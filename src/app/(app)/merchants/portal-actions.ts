"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { actorFor, assertMerchantInScope, requirePermission } from "@/lib/dal";
import { audit } from "@/lib/audit";
import { issuePortalLink } from "@/lib/portal/links";
import { destroyAllPortalSessions } from "@/lib/portal/session";
import type { ActionState } from "@/components/forms";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Staff invite a merchant to the portal. One login per business for now. */
export async function invitePortalUser(_p: ActionState, f: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("merchants.edit");
    const merchantId = String(f.get("merchantId") ?? "");
    await assertMerchantInScope(user, merchantId);
    const name = String(f.get("name") ?? "").trim().slice(0, 120);
    const email = String(f.get("email") ?? "").trim().toLowerCase();
    const fe: Record<string, string> = {};
    if (name.length < 2) fe.name = "Enter the person's name.";
    if (!EMAIL.test(email)) fe.email = "Enter a valid email.";
    if (Object.keys(fe).length) return { fieldErrors: fe };
    const m = await db.query.merchants.findFirst({ where: eq(schema.merchants.id, merchantId), columns: { dbaName: true, hiddenAt: true } });
    if (!m || m.hiddenAt) return { error: "Merchant not found." };
    const existing = await db.query.portalUsers.findFirst({ where: eq(schema.portalUsers.email, email) });
    if (existing && existing.merchantId !== merchantId) return { error: "That email already signs in for another merchant." };
    const current = await db.query.portalUsers.findFirst({ where: and(eq(schema.portalUsers.merchantId, merchantId)) });
    if (current && current.email !== email && current.status !== "disabled") return { error: `This business already has a sign-in (${current.email}). Turn it off first to invite someone else.` };

    let id = existing?.id;
    if (existing) {
      await db.update(schema.portalUsers).set({ name, status: existing.status === "active" ? "active" : "invited" }).where(eq(schema.portalUsers.id, existing.id));
    } else {
      const [row] = await db.insert(schema.portalUsers).values({ merchantId, email, name, invitedById: user.id }).returning({ id: schema.portalUsers.id });
      id = row!.id;
    }
    const r = await issuePortalLink(id!, email, name, m.dbaName, "invite");
    await audit(await actorFor(user), "portal.invite", "portal_user", id, { merchantId, email });
    revalidatePath(`/merchants/${merchantId}`);
    return r.ok ? { ok: `Invite sent to ${email}.` } : { error: `Saved, but the email failed: ${r.error}` };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

async function loadPortalUser(id: string) {
  const user = await requirePermission("merchants.edit");
  const pu = await db.query.portalUsers.findFirst({ where: eq(schema.portalUsers.id, id) });
  if (!pu) throw new Error("Sign-in not found.");
  await assertMerchantInScope(user, pu.merchantId);
  return { user, pu };
}

export async function resendPortalInvite(id: string): Promise<ActionState> {
  try {
    const { user, pu } = await loadPortalUser(id);
    if (pu.status === "disabled") return { error: "Turn the sign-in back on first." };
    const m = await db.query.merchants.findFirst({ where: eq(schema.merchants.id, pu.merchantId), columns: { dbaName: true } });
    const r = await issuePortalLink(pu.id, pu.email, pu.name, m?.dbaName ?? "your business", pu.status === "active" ? "reset" : "invite");
    await audit(await actorFor(user), "portal.invite_resent", "portal_user", pu.id);
    return r.ok ? { ok: pu.status === "active" ? "Password reset link sent." : "Invite sent again." } : { error: r.error };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function setPortalUserEnabled(id: string, enabled: boolean): Promise<ActionState> {
  try {
    const { user, pu } = await loadPortalUser(id);
    await db.update(schema.portalUsers).set({ status: enabled ? (pu.passwordHash ? "active" : "invited") : "disabled" }).where(eq(schema.portalUsers.id, pu.id));
    if (!enabled) await destroyAllPortalSessions(pu.id);
    await audit(await actorFor(user), enabled ? "portal.user_enabled" : "portal.user_disabled", "portal_user", pu.id);
    revalidatePath(`/merchants/${pu.merchantId}`);
    return { ok: enabled ? "Sign-in turned back on." : "Sign-in turned off and signed out." };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
