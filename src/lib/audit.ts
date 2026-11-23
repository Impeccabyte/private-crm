import { db, schema } from "@/db";

export type AuditActor = { id?: string | null; email?: string | null; ip?: string | null };

/** Append a row to the append-only audit log. Never throws into the caller's flow. */
export async function audit(actor: AuditActor | null, action: string, entityType?: string, entityId?: string, details: Record<string, unknown> = {}) {
  try {
    await db.insert(schema.auditLog).values({
      actorUserId: actor?.id ?? null,
      actorEmail: actor?.email ?? null,
      ip: actor?.ip ?? null,
      action,
      entityType: entityType ?? null,
      entityId: entityId ?? null,
      details,
    });
  } catch (err) {
    console.error("[audit] failed to write", action, err);
  }
}
