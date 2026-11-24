/**
 * Postgres-backed job queue (pg-boss). The web app only enqueues; the worker process (src/worker) runs jobs.
 */
import { PgBoss } from "pg-boss";

export const Q = {
  webhook: "webhook-process",
  sync: "connection-sync",
  nightly: "nightly-sync-check",
  fileScan: "file-scan-pending",
  emailSend: "email-send-round",
} as const;

export type SyncKind = "full" | "merchants" | "applications" | "tickets" | "chargebacks" | "residuals" | "payouts";

const g = globalThis as unknown as { __crmBoss?: Promise<PgBoss> };

export function getBoss(opts: { worker?: boolean } = {}): Promise<PgBoss> {
  if (!g.__crmBoss) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    const boss = new PgBoss({ connectionString: url, supervise: !!opts.worker, schedule: !!opts.worker, max: 4 });
    boss.on("error", (err) => console.error("[queue]", err));
    g.__crmBoss = boss.start().then(async (b) => {
      for (const name of Object.values(Q)) await b.createQueue(name).catch(() => {});
      return b;
    });
  }
  return g.__crmBoss;
}

export async function enqueueWebhook(eventId: string) {
  const b = await getBoss();
  return b.send(Q.webhook, { eventId }, { retryLimit: 5, retryDelay: 30, retryBackoff: true, singletonKey: eventId });
}

export async function enqueueSync(connectionId: string, kind: SyncKind, triggeredBy?: string) {
  const b = await getBoss();
  return b.send(Q.sync, { connectionId, kind, triggeredBy: triggeredBy ?? null }, { retryLimit: 2, retryDelay: 60, singletonKey: `${connectionId}:${kind}` });
}

/** Starts a newsletter send round now instead of waiting for the next minute. */
export async function enqueueEmailRound() {
  const b = await getBoss();
  return b.send(Q.emailSend, {}, { singletonKey: "now", singletonSeconds: 20 });
}
