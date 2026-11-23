"use server";

import { and, eq, ne } from "drizzle-orm";
import { cookies } from "next/headers";
import { db, schema } from "@/db";
import { actorFor, requireUser } from "@/lib/dal";
import { audit } from "@/lib/audit";
import { sha256 } from "@/lib/crypto";
import { getSetting } from "@/lib/settings";
import { hashPassword, passwordProblems, verifyPassword } from "@/lib/password";
import { SESSION_COOKIE } from "@/lib/session";
import type { ActionState } from "@/components/forms";

export async function changePassword(_p: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireUser();
  const current = String(f.get("current") ?? ""), pw = String(f.get("password") ?? ""), confirm = String(f.get("confirm") ?? "");
  const row = await db.query.users.findFirst({ where: eq(schema.users.id, user.id) });
  if (!(await verifyPassword(current, row?.passwordHash))) return { fieldErrors: { current: "That isn’t your current password." } };
  const sec = await getSetting("security");
  const problem = passwordProblems(pw, sec.passwordMinLength);
  if (problem) return { fieldErrors: { password: problem } };
  if (pw !== confirm) return { fieldErrors: { confirm: "Passwords don’t match." } };
  await db.update(schema.users).set({ passwordHash: await hashPassword(pw) }).where(eq(schema.users.id, user.id));
  // Keep this session, end the others.
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  await db.delete(schema.sessions).where(and(eq(schema.sessions.userId, user.id), token ? ne(schema.sessions.id, sha256(token)) : undefined));
  await audit(await actorFor(user), "auth.password_changed", "user", user.id);
  return { ok: "Password updated. Other sessions were signed out." };
}
