"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { actorFor, assertMerchantInScope, getCurrentUser, requirePermission, requireUser } from "@/lib/dal";
import { audit } from "@/lib/audit";
import { decryptOrNull } from "@/lib/crypto";
import type { ActionState } from "@/components/forms";

export async function toggleTask(id: string, done: boolean) {
  const user = await requireUser();
  await db.update(schema.tasks).set({ completedAt: done ? new Date() : null }).where(and(eq(schema.tasks.id, id), eq(schema.tasks.assigneeId, user.id)));
  revalidatePath("/");
}

export async function createTask(_p: ActionState, f: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    const v = z.object({ title: z.string().min(1, "Required").max(200), due: z.string().optional(), merchantId: z.string().uuid().optional().or(z.literal("")) })
      .parse({ title: String(f.get("title") ?? "").trim(), due: String(f.get("due") ?? ""), merchantId: String(f.get("merchantId") ?? "") });
    if (v.merchantId) await assertMerchantInScope(user, v.merchantId);
    const dueAt = v.due ? new Date(`${v.due}T17:00:00`) : new Date(new Date().setHours(17, 0, 0, 0));
    await db.insert(schema.tasks).values({ title: v.title, dueAt, assigneeId: user.id, createdBy: user.id, merchantId: v.merchantId || null });
    if (v.merchantId) await db.insert(schema.activities).values({ type: "task", title: `Task created: ${v.title}`, merchantId: v.merchantId, actorUserId: user.id });
    revalidatePath("/");
    if (v.merchantId) revalidatePath(`/merchants/${v.merchantId}`);
    return { ok: "Task added." };
  } catch (e) {
    return { error: e instanceof z.ZodError ? "Give the task a title." : (e as Error).message };
  }
}

/** Log a call, email or note on a merchant timeline. */
export async function logActivity(_p: ActionState, f: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("merchants.edit");
    const v = z.object({
      merchantId: z.string().uuid(), type: z.enum(["call", "email", "note", "meeting"]), title: z.string().max(200).optional(), body: z.string().min(1, "Write something").max(10000),
    }).parse({ merchantId: f.get("merchantId"), type: f.get("type"), title: String(f.get("title") ?? "").trim() || undefined, body: String(f.get("body") ?? "").trim() });
    await assertMerchantInScope(user, v.merchantId);
    const title = v.title || { call: "Call logged", email: "Email logged", note: "Internal note", meeting: "Meeting logged" }[v.type];
    await db.insert(schema.activities).values({ type: v.type, title, body: v.body, merchantId: v.merchantId, actorUserId: user.id, internal: v.type === "note" });
    if (v.type === "call" || v.type === "email") await db.update(schema.contacts).set({ lastContactedAt: new Date() }).where(eq(schema.contacts.merchantId, v.merchantId));
    revalidatePath(`/merchants/${v.merchantId}`);
    return { ok: `${title} saved.` };
  } catch (e) {
    return { error: e instanceof z.ZodError ? e.issues[0]!.message : (e as Error).message };
  }
}

/**
 * Reveal a sensitive value (EIN or bank account). Requires `sensitive.reveal`, a reason, and writes an audit row.
 * Returns the plain value for the client to show briefly; it is never rendered server-side.
 */
export async function revealSensitive(kind: "ein" | "bank" | "request_bank", id: string, reason: string): Promise<{ value?: string; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in again." };
  try {
    await requirePermission("sensitive.reveal");
  } catch {
    await audit(await actorFor(user), "sensitive.reveal_denied", kind === "ein" ? "legal_entity" : kind === "request_bank" ? "ticket" : "merchant_account", id);
    return { error: "You need the “Reveal sensitive data” permission. Ask an admin." };
  }
  if (!reason.trim()) return { error: "Choose a reason." };
  let value: string | null = null;
  if (kind === "ein") {
    const le = await db.query.legalEntities.findFirst({ where: eq(schema.legalEntities.id, id) });
    value = decryptOrNull(le?.einEnc);
  } else if (kind === "request_bank") {
    // New bank details a merchant sent in a portal account-change request.
    const t = await db.query.tickets.findFirst({ where: eq(schema.tickets.id, id), columns: { merchantId: true, portalSensitiveEnc: true } });
    if (t?.merchantId) await assertMerchantInScope(user, t.merchantId);
    const raw = decryptOrNull(t?.portalSensitiveEnc);
    if (raw) { const b = JSON.parse(raw) as { bankName?: string; routing?: string; account?: string }; value = `${b.bankName ?? "Bank"} · routing ${b.routing ?? "?"} · account ${b.account ?? "?"}`; }
  } else {
    const ma = await db.query.merchantAccounts.findFirst({ where: eq(schema.merchantAccounts.id, id) });
    if (ma) await assertMerchantInScope(user, ma.merchantId);
    value = decryptOrNull(ma?.bankAccountEnc);
  }
  if (!value) return { error: "No value on file." };
  await audit(await actorFor(user), "sensitive.reveal", kind === "ein" ? "legal_entity" : kind === "request_bank" ? "ticket" : "merchant_account", id, { field: kind, reason: reason.slice(0, 200) });
  return { value };
}
