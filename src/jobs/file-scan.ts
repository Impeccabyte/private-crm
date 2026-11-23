/**
 * Scans files that were stored as "pending" because the virus scanner was unreachable at upload time.
 * Runs every minute in the worker. Clean → downloadable. Infected → content deleted, record kept, lead notified.
 */
import { and, asc, eq, lt } from "drizzle-orm";
import { db, schema } from "@/db";
import { get, remove } from "@/lib/files";
import { scanBuffer, scannerConfigured, ScannerUnavailable } from "@/lib/clamav";
import { audit } from "@/lib/audit";

const MAX_ATTEMPTS = 60 * 24 * 7; // ~a week of once-a-minute retries

export async function scanPendingFiles(limit = 25) {
  if (!scannerConfigured()) return { scanned: 0, skipped: "scanner not configured" };
  const pending = await db.select().from(schema.files)
    .where(and(eq(schema.files.scanStatus, "pending"), lt(schema.files.scanAttempts, MAX_ATTEMPTS)))
    .orderBy(asc(schema.files.createdAt)).limit(limit);
  let clean = 0, infected = 0;
  for (const f of pending) {
    let data: Buffer;
    try { data = await get(f.storageKey); } catch (err) {
      await db.update(schema.files).set({ scanStatus: "error", scanResult: `Couldn’t read the stored file: ${(err as Error).message}`.slice(0, 300), scannedAt: new Date() }).where(eq(schema.files.id, f.id));
      continue;
    }
    try {
      const r = await scanBuffer(data);
      if (r.status === "clean") {
        await db.update(schema.files).set({ scanStatus: "clean", scanResult: "OK", scannedAt: new Date(), scanAttempts: f.scanAttempts + 1 }).where(eq(schema.files.id, f.id));
        clean++;
      } else {
        await remove(f.storageKey);
        await db.update(schema.files).set({ scanStatus: "infected", scanResult: r.signature, scannedAt: new Date(), scanAttempts: f.scanAttempts + 1 }).where(eq(schema.files.id, f.id));
        if (f.leadId) await db.insert(schema.activities).values({ type: "system", title: `Attachment blocked: ${f.originalName}`, body: `The virus scanner found ${r.signature}. The file was deleted and can’t be downloaded.`, leadId: f.leadId });
        await audit(null, "file.infected", "file", f.id, { name: f.originalName, signature: r.signature, leadId: f.leadId });
        infected++;
      }
    } catch (err) {
      if (!(err instanceof ScannerUnavailable)) throw err;
      // Scanner still down: count the attempt and stop for this round.
      await db.update(schema.files).set({ scanAttempts: f.scanAttempts + 1, scanResult: err.message.slice(0, 300) }).where(eq(schema.files.id, f.id));
      return { scanned: clean + infected, clean, infected, waiting: true };
    }
  }
  return { scanned: clean + infected, clean, infected, waiting: false };
}
