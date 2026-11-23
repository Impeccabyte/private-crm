/**
 * Maverick webhook ingress (one URL per connection; each has its own secret).
 * Verifies the SHA-512 signature, rejects stale dates, dedupes on event id, stores the raw event,
 * returns 200 quickly and hands processing to the worker queue.
 */
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { configOf } from "@/lib/integrations";
import { decryptOrNull } from "@/lib/crypto";
import { eventAgeHours, parseEnvelope, verify } from "@/processors/maverick/webhook";
import { enqueueWebhook } from "@/jobs/queue";

export async function POST(req: Request, ctx: { params: Promise<{ path: string }> }) {
  const { path } = await ctx.params;
  const conn = await db.query.processorConnections.findFirst({ where: eq(schema.processorConnections.webhookPath, path) });
  if (!conn) return Response.json({ error: "not found" }, { status: 404 });

  const raw = await req.text();
  if (raw.length > 1_000_000) return Response.json({ error: "payload too large" }, { status: 413 });
  let body: unknown;
  try {
    body = raw.trim().startsWith("{") ? JSON.parse(raw) : Object.fromEntries(new URLSearchParams(raw));
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = parseEnvelope(body);
  const store = async (status: "rejected" | "received", reason: string | null, signatureValid: boolean, externalId: string | null, env?: { module?: string; action?: string; date?: string }) => {
    const [row] = await db.insert(schema.webhookEvents).values({
      connectionId: conn.id, externalId, module: env?.module ?? null, action: env?.action ?? null, eventDate: env?.date ?? null,
      signatureValid, status, lastError: reason, payload: body as object,
    }).onConflictDoNothing().returning({ id: schema.webhookEvents.id });
    return row?.id ?? null;
  };

  if (!conn.enabled) {
    await store("rejected", "Connection is disabled", false, null, parsed.ok ? parsed.envelope : parsed.partial);
    return Response.json({ error: "connection disabled" }, { status: 409 });
  }
  if (!parsed.ok) {
    await store("rejected", parsed.reason, false, null, parsed.partial);
    return Response.json({ error: parsed.reason }, { status: 400 });
  }
  const env = parsed.envelope;
  const sig = verify(decryptOrNull(conn.webhookSecretEnc), req.headers.get("webhook-signature"), env);
  if (!sig.valid) {
    // Rejected events are stored without the dedupe key so a forged id can't block the real event.
    await store("rejected", sig.reason ?? "Invalid signature", false, null, env);
    return Response.json({ error: "invalid signature" }, { status: 401 });
  }
  const maxAge = configOf(conn).maxEventAgeHours;
  const age = eventAgeHours(env.date);
  if (maxAge > 0 && age !== null && age > maxAge) {
    await store("rejected", `Event date is ${Math.round(age)}h old (limit ${maxAge}h)`, true, null, env);
    return Response.json({ error: "stale event" }, { status: 400 });
  }

  const dup = await db.query.webhookEvents.findFirst({ where: and(eq(schema.webhookEvents.connectionId, conn.id), eq(schema.webhookEvents.externalId, env.id)) });
  if (dup) return Response.json({ ok: true, duplicate: true });

  const id = await store("received", null, true, env.id, env);
  if (id) await enqueueWebhook(id);
  return Response.json({ ok: true });
}
