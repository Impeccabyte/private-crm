import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { db, schema } from "@/db";

/**
 * Who can own a merchant (be its account manager). The owner is who the merchant sees in the portal, who gets
 * their portal requests, and who residuals are credited to.
 */
export const OWNER_ROLES = ["admin", "manager", "agent"] as const;

export type OwnerOption = { id: string; name: string; active: boolean };

/** Active users who can be given a merchant, by name. */
export async function assignableOwners(): Promise<OwnerOption[]> {
  const rows = await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users)
    .where(and(eq(schema.users.status, "active"), inArray(schema.users.role, [...OWNER_ROLES]))).orderBy(asc(schema.users.name));
  return rows.map((r) => ({ ...r, active: true }));
}

/** Everyone who owns at least one merchant today, including disabled users, for the owner filter. */
export async function currentOwners(): Promise<OwnerOption[]> {
  const rows = await db.selectDistinct({ id: schema.users.id, name: schema.users.name, status: schema.users.status }).from(schema.users)
    .innerJoin(schema.merchants, eq(schema.merchants.ownerId, schema.users.id)).orderBy(asc(schema.users.name));
  return rows.map((r) => ({ id: r.id, name: r.name, active: r.status === "active" }));
}

/**
 * Checks a new owner from a form. "" or "none" means unassigned (null). Anything else must be an active user in
 * OWNER_ROLES; otherwise it throws.
 */
export async function resolveNewOwner(raw: string): Promise<string | null> {
  if (!raw || raw === "none") return null;
  const u = await db.query.users.findFirst({ where: and(eq(schema.users.id, raw), eq(schema.users.status, "active"), inArray(schema.users.role, [...OWNER_ROLES])), columns: { id: true } });
  if (!u) throw new Error("That person can't own merchants. Pick an active admin, manager or agent.");
  return u.id;
}

/**
 * After a merchant changes hands, open requests (not Closed) that sat with the previous owner, or with nobody, move
 * to the new owner. Requests someone else picked up stay with them. Returns how many moved.
 */
export async function moveOpenTickets(merchantId: string, fromOwnerId: string | null, toOwnerId: string): Promise<number> {
  const open = await db.select({ id: schema.tickets.id, assigneeId: schema.tickets.assigneeId }).from(schema.tickets)
    .where(and(eq(schema.tickets.merchantId, merchantId), ne(schema.tickets.status, "Closed")));
  const ids = open.filter((t) => t.assigneeId === null || (fromOwnerId !== null && t.assigneeId === fromOwnerId)).map((t) => t.id);
  if (!ids.length) return 0;
  await db.update(schema.tickets).set({ assigneeId: toOwnerId, updatedAt: new Date() }).where(inArray(schema.tickets.id, ids));
  return ids.length;
}
