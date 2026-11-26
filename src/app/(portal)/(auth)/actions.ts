"use server";

import { redirect } from "next/navigation";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { getSetting } from "@/lib/settings";
import { hashPassword, passwordProblems, verifyPassword } from "@/lib/password";
import { requestIp } from "@/lib/session";
import { audit } from "@/lib/audit";
import { sha256 } from "@/lib/crypto";
import { createPortalSession, destroyAllPortalSessions, destroyPortalSession } from "@/lib/portal/session";
import { issuePortalLink } from "@/lib/portal/links";

export type AuthState = { error?: string; fieldErrors?: Record<string, string>; ok?: string; email?: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const safeNext = (n: FormDataEntryValue | null) => {
  const s = typeof n === "string" ? n : "";
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/login") ? s : "/";
};
const hhmm = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });

export async function portalLogin(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const remember = form.get("remember") === "on";
  const fieldErrors: Record<string, string> = {};
  if (!EMAIL.test(email)) fieldErrors.email = "Enter the email address we invited.";
  if (!password) fieldErrors.password = "Enter your password.";
  if (Object.keys(fieldErrors).length) return { fieldErrors, email };

  const sec = await getSetting("security");
  const ip = await requestIp();
  const u = await db.query.portalUsers.findFirst({ where: eq(schema.portalUsers.email, email) });
  if (u?.lockedUntil && u.lockedUntil > new Date()) return { error: `Too many tries. You can sign in again after ${hhmm(u.lockedUntil)}, or reset your password.`, email };

  const ok = await verifyPassword(password, u?.passwordHash);
  if (!u || !ok || u.status !== "active") {
    if (u) {
      const count = u.failedLoginCount + 1;
      const lock = count >= sec.lockoutAttempts;
      const until = new Date(Date.now() + sec.lockoutMinutes * 60_000);
      await db.update(schema.portalUsers).set({ failedLoginCount: lock ? 0 : count, lockedUntil: lock ? until : u.lockedUntil }).where(eq(schema.portalUsers.id, u.id));
      await audit({ email: `portal:${email}`, ip }, lock ? "portal.auth.locked" : "portal.auth.login_failed", "portal_user", u.id);
      if (lock) return { error: `Too many tries. You can sign in again after ${hhmm(until)}, or reset your password.`, email };
    } else {
      await audit({ email: `portal:${email}`, ip }, "portal.auth.login_failed", "portal_user", undefined, { reason: "unknown email" });
    }
    return { error: "That email and password don't match. Check both, or reset your password.", email };
  }

  await db.update(schema.portalUsers).set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() }).where(eq(schema.portalUsers.id, u.id));
  await createPortalSession(u.id, remember ? sec.rememberMeDays * 86_400_000 : sec.sessionHours * 3_600_000, remember);
  await audit({ email: `portal:${email}`, ip }, "portal.auth.login", "portal_user", u.id, { remember });
  redirect(safeNext(form.get("next")));
}

export async function portalLogout() {
  await destroyPortalSession();
  redirect("/login?signed_out=1");
}

export async function portalForgot(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL.test(email)) return { fieldErrors: { email: "Enter the email address you sign in with." }, email };
  const u = await db.query.portalUsers.findFirst({ where: eq(schema.portalUsers.email, email) });
  if (u && u.status !== "disabled") {
    const m = await db.query.merchants.findFirst({ where: eq(schema.merchants.id, u.merchantId), columns: { dbaName: true } });
    await issuePortalLink(u.id, u.email, u.name, m?.dbaName ?? "your business", "reset");
    await audit({ email: `portal:${email}`, ip: await requestIp() }, "portal.auth.reset_requested", "portal_user", u.id);
  }
  // Same answer either way, so the form never reveals whether an account exists.
  return { ok: "sent", email };
}

export async function portalSetPassword(_prev: AuthState, form: FormData): Promise<AuthState> {
  const token = String(form.get("token") ?? "");
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  const sec = await getSetting("security");
  const problem = passwordProblems(password, sec.passwordMinLength);
  if (problem) return { fieldErrors: { password: problem } };
  if (password !== confirm) return { fieldErrors: { confirm: "The two passwords don't match." } };
  const row = await db.query.portalPasswordTokens.findFirst({
    where: and(eq(schema.portalPasswordTokens.id, sha256(token)), isNull(schema.portalPasswordTokens.usedAt), gt(schema.portalPasswordTokens.expiresAt, new Date())),
  });
  if (!row) return { error: "This link has expired or was already used. Ask for a new one below." };
  const u = await db.query.portalUsers.findFirst({ where: eq(schema.portalUsers.id, row.portalUserId) });
  if (!u || u.status === "disabled") return { error: "This sign-in has been turned off. Contact your account manager." };
  await db.update(schema.portalPasswordTokens).set({ usedAt: new Date() }).where(eq(schema.portalPasswordTokens.id, row.id));
  await db.update(schema.portalUsers).set({ passwordHash: await hashPassword(password), status: "active", failedLoginCount: 0, lockedUntil: null }).where(eq(schema.portalUsers.id, u.id));
  await destroyAllPortalSessions(u.id);
  await audit({ email: `portal:${u.email}`, ip: await requestIp() }, row.purpose === "invite" ? "portal.auth.invite_accepted" : "portal.auth.password_reset", "portal_user", u.id);
  redirect("/login?set=1");
}
