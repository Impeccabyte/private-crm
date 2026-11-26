"use server";

import { and, eq, ne } from "drizzle-orm";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { actorFor, requireUser } from "@/lib/dal";
import { audit } from "@/lib/audit";
import { sha256 } from "@/lib/crypto";
import { getSetting } from "@/lib/settings";
import { hashPassword, passwordProblems, verifyPassword } from "@/lib/password";
import { SESSION_COOKIE } from "@/lib/session";
import { AVATAR_MAX_BYTES, AvatarRefused, clearAvatar, setAvatar } from "@/lib/avatars";
import { ScannerUnavailable } from "@/lib/clamav";
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

// ── Profile: name and photo. Always the signed-in user's own; no user id is taken from the form. ──────────

const nameSchema = z.string()
  .transform((s) => s.replace(/\s+/g, " ").trim())
  .pipe(z.string()
    .min(1, "Enter your name.")
    .max(80, "Keep your name to 80 characters or fewer.")
    .refine((s) => !/[\u0000-\u001f\u007f<>]/.test(s), "Use letters, spaces and ordinary punctuation."));

export async function updateName(_p: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = nameSchema.safeParse(String(f.get("name") ?? ""));
  if (!parsed.success) return { fieldErrors: { name: parsed.error.issues[0]!.message } };
  const name = parsed.data;
  if (name === user.name) return { ok: "Your name is unchanged." };
  await db.update(schema.users).set({ name }).where(eq(schema.users.id, user.id));
  await audit(await actorFor(user), "user.name_changed", "user", user.id, { from: user.name, to: name });
  revalidatePath("/", "layout");
  return { ok: "Name updated." };
}

export async function uploadAvatar(f: FormData): Promise<ActionState> {
  const user = await requireUser();
  const file = f.get("photo");
  if (!(file instanceof File) || !file.size) return { error: "Choose a photo to upload." };
  if (file.size > AVATAR_MAX_BYTES) return { error: "That photo is too large. Try a smaller one." };
  try {
    await setAvatar(user.id, Buffer.from(await file.arrayBuffer()));
  } catch (e) {
    if (e instanceof AvatarRefused) return { error: e.message };
    if (e instanceof ScannerUnavailable) return { error: "The virus scanner isn’t reachable right now, so photos can’t be uploaded. Try again in a minute." };
    console.error("[account] avatar upload", e);
    return { error: "Couldn’t save that photo." };
  }
  await audit(await actorFor(user), "user.avatar_changed", "user", user.id, { size: file.size });
  revalidatePath("/", "layout");
  return { ok: "Photo updated." };
}

export async function removeAvatar(): Promise<ActionState> {
  const user = await requireUser();
  if (!(await clearAvatar(user.id))) return { ok: "You don’t have a photo." };
  await audit(await actorFor(user), "user.avatar_removed", "user", user.id);
  revalidatePath("/", "layout");
  return { ok: "Photo removed." };
}
