/**
 * Merchant portal sessions. A separate cookie and a separate table from staff sessions (src/lib/session.ts),
 * so a merchant's cookie is never read by the staff Data Access Layer and a staff cookie never opens the portal.
 */
import "server-only";
import { cookies, headers } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { db, schema } from "@/db";
import { randomToken, sha256 } from "@/lib/crypto";
import { clientIp } from "@/lib/session";

export const PORTAL_COOKIE = "ib_portal";

const secureCookies = () => (process.env.APP_URL ?? "").startsWith("https://");

export async function createPortalSession(portalUserId: string, ttlMs: number, persistent: boolean) {
  const token = randomToken(32);
  const h = await headers();
  const expiresAt = new Date(Date.now() + ttlMs);
  await db.insert(schema.portalSessions).values({
    id: sha256(token),
    portalUserId,
    expiresAt,
    ip: clientIp(h),
    userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
  });
  (await cookies()).set(PORTAL_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookies(),
    path: "/",
    ...(persistent ? { expires: expiresAt } : {}),
  });
}

export async function readPortalSessionUserId(): Promise<string | null> {
  const token = (await cookies()).get(PORTAL_COOKIE)?.value;
  if (!token) return null;
  const row = await db.query.portalSessions.findFirst({
    where: and(eq(schema.portalSessions.id, sha256(token)), gt(schema.portalSessions.expiresAt, new Date())),
  });
  return row?.portalUserId ?? null;
}

export async function destroyPortalSession() {
  const jar = await cookies();
  const token = jar.get(PORTAL_COOKIE)?.value;
  if (token) await db.delete(schema.portalSessions).where(eq(schema.portalSessions.id, sha256(token)));
  jar.delete(PORTAL_COOKIE);
}

export async function destroyAllPortalSessions(portalUserId: string) {
  await db.delete(schema.portalSessions).where(eq(schema.portalSessions.portalUserId, portalUserId));
}
