/**
 * Worker process: runs queued jobs. Started by `npm run worker` (its own container in Docker Compose).
 * Reads connection settings from the database on every job, so Settings changes apply without a restart.
 */
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { configOf } from "@/lib/integrations";
import { getBoss, Q, enqueueSync, type SyncKind } from "@/jobs/queue";
import { processWebhookEvent, SkipError } from "@/jobs/webhook-processor";
import { runSync } from "@/jobs/sync";
import { scanPendingFiles } from "@/jobs/file-scan";

async function main() {
  const boss = await getBoss({ worker: true });
  console.log("[worker] started");

  await boss.work<{ eventId: string }>(Q.webhook, { batchSize: 5 }, async (jobs) => {
    for (const job of jobs) {
      try {
        const r = await processWebhookEvent(job.data.eventId);
        console.log(`[worker] webhook ${job.data.eventId} → ${r}`);
      } catch (err) {
        if (err instanceof SkipError) { console.warn("[worker] skip", err.message); continue; }
        console.warn(`[worker] webhook ${job.data.eventId} failed: ${(err as Error).message}`);
        throw err; // pg-boss retries with backoff
      }
    }
  });

  await boss.work<{ connectionId: string; kind: SyncKind; triggeredBy: string | null }>(Q.sync, async (jobs) => {
    for (const job of jobs) {
      const stats = await runSync(job.data.connectionId, job.data.kind, job.data.triggeredBy);
      console.log(`[worker] sync ${job.data.kind} for ${job.data.connectionId}`, stats);
    }
  });

  // Hourly: start the nightly reconciliation for connections whose configured hour (UTC) is now.
  await boss.schedule(Q.nightly, "5 * * * *");
  await boss.work(Q.nightly, async () => {
    const hour = new Date().getUTCHours();
    const conns = await db.select().from(schema.processorConnections).where(eq(schema.processorConnections.enabled, true));
    for (const c of conns) if (configOf(c).nightlySyncHourUtc === hour) await enqueueSync(c.id, "full");
  });

  // Every minute: virus-scan uploads that arrived while the scanner was unreachable.
  await boss.schedule(Q.fileScan, "* * * * *");
  await boss.work(Q.fileScan, async () => {
    const r = await scanPendingFiles();
    if (r.scanned || ("waiting" in r && r.waiting)) console.log("[worker] file scan", r);
  });

  const stop = async () => { console.log("[worker] stopping"); await boss.stop({ graceful: true, timeout: 10_000 }).catch(() => {}); process.exit(0); };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

main().catch((err) => { console.error("[worker] fatal", err); process.exit(1); });
