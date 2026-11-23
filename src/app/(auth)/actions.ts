"use server";

import { redirect } from "next/navigation";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { getSetting } from "@/lib/settings";
import { hashPassword, passwordProblems, verifyPassword } from "@/lib/password";
import { createSession, destroyAllSessions, destroySession, requestIp } from "@/lib/session";
import { audit } from "@/lib/audit";
import { sha256 } from "@/lib/crypto";
import { issuePasswordLink } from "@/lib/password-links";

export type FormState = { error?: string; fieldErrors?: Record<string, string>; ok?: string; email?: string };

const safeNext = (n: FormDataEntryValue | null) => {
  const s = typeof n === "string" ? n : "";
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/login") ? s : "/";
};

export async function loginAction(_prev: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const remember = form.get("remember") === "on";
  const fieldErrors: Record<string, string> = {};
  if (!email) fieldErrors.email = "Enter your work email.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fieldErrors.email = "Enter an email like name@impeccabyte.com.";
  if (!password) fieldErrors.password = "Enter your password.";
  if (Object.keys(fieldErrors).length) return { fieldErrors, email };

  const sec = await getSetting("security");
  const sso = await getSetting("sso");
  const ip = await requestIp();
  const user = await db.query.users.findFirst({ where: eq(schema.users.email, email) });

  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    const until = user.lockedUntil.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    return { error: `locked:${until}`, email };
  }

  const ok = await verifyPassword(password, user?.passwordHash);
  if (!user || !ok || user.status !== "active") {
    if (user) {
      const count = user.failedLoginCount + 1;
      const lock = count >= sec.lockoutAttempts;
      await db.update(schema.users).set({
        failedLoginCount: lock ? 0 : count,
        lockedUntil: lock ? new Date(Date.now() + sec.lockoutMinutes * 60_000) : user.lockedUntil,
      }).where(eq(schema.users.id, user.id));
      await audit({ id: user.id, email, ip }, lock ? "auth.locked" : "auth.login_failed", "user", user.id);
      if (lock) {
        const until = new Date(Date.now() + sec.lockoutMinutes * 60_000).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
        return { error: `locked:${until}`, email };
      }
    } else {
      await audit({ email, ip }, "auth.login_failed", "user", undefined, { reason: "unknown email" });
    }
    return { error: "mismatch", email };
  }

  if (sso.enabled && !sso.allowPasswordLogin && user.role !== "admin") {
    return { error: `Password sign-in is turned off. Use “Sign in with ${sso.providerName}”.`, email };
  }

  await db.update(schema.users).set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() }).where(eq(schema.users.id, user.id));
  const ttl = remember ? sec.rememberMeDays * 86_400_000 : sec.sessionHours * 3_600_000;
  await createSession(user.id, ttl, remember);
  await audit({ id: user.id, email, ip }, "auth.login", "user", user.id, { remember });
  redirect(safeNext(form.get("next")));
}

export async function logoutAction() {
  await destroySession();
  redirect("/login?signed_out=1");
}

export async function forgotPasswordAction(_prev: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { fieldErrors: { email: "Enter your work email." }, email };
  const user = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
  if (user && user.status !== "disabled") {
    await issuePasswordLink(user.id, user.email, "reset");
    await audit({ id: user.id, email, ip: await requestIp() }, "auth.reset_requested", "user", user.id);
  }
  // Same response either way, so the form never reveals whether an account exists.
  return { ok: "sent", email };
}

export async function resetPasswordAction(_prev: FormState, form: FormData): Promise<FormState> {
  const token = String(form.get("token") ?? "");
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  const sec = await getSetting("security");
  const problem = passwordProblems(password, sec.passwordMinLength);
  if (problem) return { fieldErrors: { password: problem } };
  if (password !== confirm) return { fieldErrors: { confirm: "Passwords don't match." } };
  const row = await db.query.passwordTokens.findFirst({
    where: and(eq(schema.passwordTokens.id, sha256(token)), isNull(schema.passwordTokens.usedAt), gt(schema.passwordTokens.expiresAt, new Date())),
  });
  if (!row) return { error: "This link has expired or was already used. Request a new one." };
  await db.update(schema.passwordTokens).set({ usedAt: new Date() }).where(eq(schema.passwordTokens.id, row.id));
  await db.update(schema.users).set({ passwordHash: await hashPassword(password), status: "active", failedLoginCount: 0, lockedUntil: null }).where(eq(schema.users.id, row.userId));
  await destroyAllSessions(row.userId);
  await audit({ id: row.userId, ip: await requestIp() }, row.purpose === "invite" ? "auth.invite_accepted" : "auth.password_reset", "user", row.userId);
  redirect("/login?reset=1");
}
