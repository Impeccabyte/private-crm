/**
 * Maverick webhook verification and parsing.
 * Docs: `Webhook-Signature` = SHA-512 hex of `<webhookSignature><id><module><action><date>` where webhookSignature is the
 * per-URL secret. It is NOT an HMAC and does not cover the body, so we also dedupe on `id` and reject stale dates.
 * Envelope: { id, module, action, date, data }. Some documented examples (Signed Completed, Conditional Approval)
 * show only the data object; those cannot be verified and are stored as rejected for an admin to review.
 */
import { createHash } from "node:crypto";
import { safeEqual } from "@/lib/crypto";

export type Envelope = { id: string; module: string; action: string; date: string; data: unknown };

export function computeSignature(secret: string, e: Pick<Envelope, "id" | "module" | "action" | "date">) {
  return createHash("sha512").update(`${secret}${e.id}${e.module}${e.action}${e.date}`).digest("hex");
}

export type ParseResult =
  | { ok: true; envelope: Envelope }
  | { ok: false; reason: string; partial?: Partial<Envelope> };

export function parseEnvelope(body: unknown): ParseResult {
  if (!body || typeof body !== "object") return { ok: false, reason: "Body is not a JSON object" };
  const b = body as Record<string, unknown>;
  const partial = { id: b.id != null ? String(b.id) : undefined, module: b.module as string, action: b.action as string, date: b.date as string };
  if (b.id == null || !b.module || !b.action || !b.date) {
    return { ok: false, reason: "Missing id/module/action/date — cannot verify the signature", partial };
  }
  return { ok: true, envelope: { id: String(b.id), module: String(b.module), action: String(b.action), date: String(b.date), data: b.data } };
}

export function verify(secret: string | null, header: string | null, e: Envelope): { valid: boolean; reason?: string } {
  if (!secret) return { valid: false, reason: "No webhook secret is configured for this connection" };
  if (!header) return { valid: false, reason: "Missing Webhook-Signature header" };
  const expected = computeSignature(secret, e);
  return safeEqual(expected, header.trim().toLowerCase()) ? { valid: true } : { valid: false, reason: "Signature does not match" };
}

/** Maverick sends "YYYY-MM-DD HH:mm:ss" without a zone; treat as UTC. Returns age in hours, or null if unparsable. */
export function eventAgeHours(date: string, now = Date.now()): number | null {
  const t = Date.parse(date.includes("T") ? date : date.replace(" ", "T") + "Z");
  return Number.isNaN(t) ? null : (now - t) / 3_600_000;
}
