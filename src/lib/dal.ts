/**
 * Data Access Layer: the only place pages and server actions get the current user, check permissions
 * and compute record scope. Proxy (src/proxy.ts) only does an optimistic cookie check; the real check is here.
 */
import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { readSessionUserId, requestIp } from "./session";
import { can, isScoped, type Permission, type Role } from "./rbac";

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  avatarColor: string;
  initials: string;
};

export const initialsOf = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const userId = await readSessionUserId();
  if (!userId) return null;
  const u = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  if (!u || u.status !== "active") return null;
  return { id: u.id, email: u.email, name: u.name, role: u.role, avatarColor: u.avatarColor, initials: initialsOf(u.name) };
});

export async function requireUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

export class ForbiddenError extends Error {
  constructor(perm: string) { super(`You don't have permission to do that (${perm}).`); }
}

/** For pages: redirect to Home with a notice when the role lacks the permission. */
export async function requirePage(perm: Permission): Promise<CurrentUser> {
  const u = await requireUser();
  if (!can(u.role, perm)) redirect(`/?denied=${encodeURIComponent(perm)}`);
  return u;
}

/** For server actions and route handlers: throw instead of redirecting. */
export async function requirePermission(perm: Permission): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) throw new ForbiddenError("signed-in");
  if (!can(u.role, perm)) throw new ForbiddenError(perm);
  return u;
}

/**
 * Owner ids whose records this user may see, or null for "everything".
 * Agents: themselves plus their sub-agents (one level, matching the residual hierarchy).
 */
export const scopeOwnerIds = cache(async (user: CurrentUser): Promise<string[] | null> => {
  if (!isScoped(user.role)) return null;
  const subs = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.parentAgentId, user.id));
  return [user.id, ...subs.map((s) => s.id)];
});

/** Throws if a scoped user tries to touch a merchant outside their book. */
export async function assertMerchantInScope(user: CurrentUser, merchantId: string) {
  const ids = await scopeOwnerIds(user);
  if (!ids) return;
  const m = await db.query.merchants.findFirst({ where: eq(schema.merchants.id, merchantId), columns: { ownerId: true } });
  if (!m || !m.ownerId || !ids.includes(m.ownerId)) throw new ForbiddenError("merchant scope");
}

export async function actorFor(user: CurrentUser) {
  return { id: user.id, email: user.email, ip: await requestIp() };
}

export async function usersByIds(ids: string[]) {
  if (!ids.length) return [];
  return db.select().from(schema.users).where(inArray(schema.users.id, ids));
}
