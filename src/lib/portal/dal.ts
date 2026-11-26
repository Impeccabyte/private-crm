/**
 * Merchant portal Data Access Layer. The only way portal pages and actions learn who is signed in and
 * which merchant they belong to. The merchant id comes from the portal_users row behind the session,
 * never from the URL, a form field or the client.
 */
import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requestIp } from "@/lib/session";
import { readPortalSessionUserId } from "./session";

export type PortalUser = {
  id: string;
  email: string;
  name: string;
  firstName: string;
  merchantId: string;
  dbaName: string;
};

export const getPortalUser = cache(async (): Promise<PortalUser | null> => {
  const id = await readPortalSessionUserId();
  if (!id) return null;
  const row = await db
    .select({ u: schema.portalUsers, dba: schema.merchants.dbaName, hidden: schema.merchants.hiddenAt })
    .from(schema.portalUsers)
    .innerJoin(schema.merchants, eq(schema.portalUsers.merchantId, schema.merchants.id))
    .where(eq(schema.portalUsers.id, id))
    .limit(1);
  const r = row[0];
  if (!r || r.u.status !== "active" || r.hidden) return null;
  return {
    id: r.u.id,
    email: r.u.email,
    name: r.u.name,
    firstName: r.u.name.split(/\s+/)[0] ?? r.u.name,
    merchantId: r.u.merchantId,
    dbaName: r.dba,
  };
});

/** For portal pages: send anyone without a live merchant session to the portal sign-in. */
export async function requirePortalUser(): Promise<PortalUser> {
  const u = await getPortalUser();
  if (!u) redirect("/portal/login");
  return u;
}

export class PortalForbiddenError extends Error {
  constructor() { super("Please sign in again."); }
}

/** For portal server actions and route handlers: throw instead of redirecting. */
export async function requirePortalAction(): Promise<PortalUser> {
  const u = await getPortalUser();
  if (!u) throw new PortalForbiddenError();
  return u;
}

export async function portalActor(u: PortalUser) {
  return { id: null, email: `portal:${u.email}`, ip: await requestIp() };
}
