import "server-only";
import { cookies, headers } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { db, schema } from "@/db";
import { randomToken, sha256 } from "./crypto";

export const SESSION_COOKIE = "ib_session";

const secureCookies = () => (process.env.APP_URL ?? "").startsWith("https://");

export async function createSession(userId: string, ttlMs: number, persistent: boolean) {
  const token = randomToken(32);
  const h = await headers();
  const expiresAt = new Date(Date.now() + ttlMs);
  await db.insert(schema.sessions).values({
    id: sha256(token),
    userId,
    expiresAt,
    ip: clientIp(h),
    userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookies(),
    path: "/",
    ...(persistent ? { expires: expiresAt } : {}),
  });
}

export async function readSessionUserId(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = await db.query.sessions.findFirst({
    where: and(eq(schema.sessions.id, sha256(token)), gt(schema.sessions.expiresAt, new Date())),
  });
  return row?.userId ?? null;
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(schema.sessions).where(eq(schema.sessions.id, sha256(token)));
  jar.delete(SESSION_COOKIE);
}

export async function destroyAllSessions(userId: string) {
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
}

export function clientIp(h: Headers): string | null {
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}

export async function requestIp(): Promise<string | null> {
  return clientIp(await headers());
}
