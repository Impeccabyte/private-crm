"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { actorFor, assertMerchantInScope, requirePermission, scopeOwnerIds } from "@/lib/dal";
import { audit } from "@/lib/audit";
import { encrypt, last4 } from "@/lib/crypto";
import { findDuplicates, type DupMatch } from "@/lib/duplicates";
import { hideEligibility } from "@/lib/merchant-hide";
import { moveOpenTickets, resolveNewOwner } from "@/lib/owners";

export type MerchantFormState = { error?: string; fieldErrors?: Record<string, string>; duplicates?: DupMatch[]; values?: Record<string, string> };

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function createMerchant(_p: MerchantFormState, f: FormData): Promise<MerchantFormState> {
  const values = Object.fromEntries(["dbaName", "legalName", "ein", "mcc", "industry", "street", "city", "state", "zip", "csPhone", "csEmail", "website", "contactFirst", "contactLast", "contactEmail", "contactPhone", "ownerId"].map((k) => [k, s(f, k)]));
  try {
    const user = await requirePermission("merchants.edit");
    const v = z.object({
      dbaName: z.string().min(2, "Enter the DBA name"), legalName: z.string().min(2, "Enter the legal name"),
      ein: z.string().refine((x) => x === "" || /^\d{2}-?\d{7}$/.test(x), "EIN is 9 digits, e.g. 12-3456789"),
      mcc: z.string().refine((x) => x === "" || /^\d{4}$/.test(x), "MCC is 4 digits"), csEmail: z.string().refine((x) => x === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x), "Invalid email"),
    }).passthrough().parse(values);
    if (f.get("confirmDuplicate") !== "yes") {
      const dups = await findDuplicates({ name: v.dbaName, phone: values.csPhone, website: values.website, email: values.csEmail, einLast4: last4(values.ein) });
      if (dups.some((d) => d.confidence !== "low")) return { duplicates: dups, values };
    }
    const owners = await scopeOwnerIds(user);
    const ownerId = owners ? user.id : (values.ownerId ? await resolveNewOwner(values.ownerId) : null) ?? user.id;
    const [le] = await db.insert(schema.legalEntities).values({ legalName: v.legalName, einEnc: values.ein ? encrypt(values.ein.replace(/\D/g, "")) : null, einLast4: last4(values.ein) }).returning();
    const [m] = await db.insert(schema.merchants).values({
      legalEntityId: le!.id, dbaName: v.dbaName, status: "prospect", mcc: values.mcc || null, industry: values.industry || null, street: values.street || null,
      city: values.city || null, state: values.state || null, zip: values.zip || null, csPhone: values.csPhone || null, csEmail: values.csEmail || null, website: values.website || null, ownerId,
    }).returning();
    if (values.contactFirst) {
      await db.insert(schema.contacts).values({ merchantId: m!.id, legalEntityId: le!.id, firstName: values.contactFirst, lastName: values.contactLast, email: values.contactEmail || null, phone: values.contactPhone || null, labels: ["Primary"] });
    }
    await db.insert(schema.activities).values({ type: "system", title: "Merchant created", merchantId: m!.id, actorUserId: user.id });
    await audit(await actorFor(user), "merchant.create", "merchant", m!.id, { dba: v.dbaName });
    revalidatePath("/merchants");
    redirect(`/merchants/${m!.id}`);
  } catch (e) {
    if ((e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
    if (e instanceof z.ZodError) return { values, fieldErrors: Object.fromEntries(e.issues.map((i) => [String(i.path[0]), i.message])) };
    return { values, error: (e as Error).message };
  }
}

export async function bulkReassign(f: FormData) {
  const user = await requirePermission("merchants.edit");
  const ids = f.getAll("ids").map(String).filter(Boolean);
  const raw = s(f, "ownerId");
  if (!ids.length || !raw) return;
  if (await scopeOwnerIds(user)) throw new Error("Only managers can reassign merchants.");
  for (const id of ids) await assertMerchantInScope(user, id);
  const ownerId = await resolveNewOwner(raw);
  const before = await db.select({ id: schema.merchants.id, ownerId: schema.merchants.ownerId }).from(schema.merchants).where(inArray(schema.merchants.id, ids));
  await db.update(schema.merchants).set({ ownerId }).where(inArray(schema.merchants.id, ids));
  let ticketsMoved = 0;
  if (ownerId) for (const m of before) if (m.ownerId !== ownerId) ticketsMoved += await moveOpenTickets(m.id, m.ownerId, ownerId);
  await audit(await actorFor(user), "merchant.reassign", "merchant", undefined, { ids, ownerId, ticketsMoved });
  revalidatePath("/merchants");
  revalidatePath("/support");
}

export async function updateMerchantOwner(merchantId: string, raw: string) {
  const user = await requirePermission("merchants.edit");
  if (await scopeOwnerIds(user)) throw new Error("Only managers can reassign merchants.");
  await assertMerchantInScope(user, merchantId);
  const ownerId = await resolveNewOwner(raw);
  const before = await db.query.merchants.findFirst({ where: eq(schema.merchants.id, merchantId), columns: { ownerId: true } });
  if (!before || before.ownerId === ownerId) return;
  await db.update(schema.merchants).set({ ownerId }).where(eq(schema.merchants.id, merchantId));
  const ticketsMoved = ownerId ? await moveOpenTickets(merchantId, before.ownerId, ownerId) : 0;
  await audit(await actorFor(user), "merchant.reassign", "merchant", merchantId, { from: before.ownerId, ownerId, ticketsMoved });
  revalidatePath(`/merchants/${merchantId}`);
  revalidatePath("/merchants");
  revalidatePath("/support");
}


/** Hides merchants that qualify (boarding, one cancelled application, no MIDs or chargebacks). Others are skipped. */
export async function hideMerchants(ids: string[]): Promise<{ ok?: string; error?: string }> {
  try {
    const user = await requirePermission("merchants.hide");
    const actor = await actorFor(user);
    const hidden: string[] = [], skipped: string[] = [];
    for (const id of [...new Set(ids)].slice(0, 500)) {
      await assertMerchantInScope(user, id);
      const m = await db.query.merchants.findFirst({ where: eq(schema.merchants.id, id), columns: { dbaName: true } });
      const el = await hideEligibility(id);
      if (!m || !el.ok) { skipped.push(`${m?.dbaName ?? "Unknown"} (${el.ok ? "not found" : el.reason.replace(/\.$/, "").toLowerCase()})`); continue; }
      await db.update(schema.merchants).set({ hiddenAt: new Date(), hiddenById: user.id }).where(eq(schema.merchants.id, id));
      await db.insert(schema.activities).values({ type: "system", title: `Hidden by ${user.name}`, merchantId: id, actorUserId: user.id });
      await audit(actor, "merchant.hidden", "merchant", id, { dbaName: m.dbaName });
      hidden.push(m.dbaName);
    }
    revalidatePath("/merchants");
    revalidatePath("/applications");
    if (!hidden.length) return { error: `Nothing hidden. ${skipped.join("; ")}` };
    const one = hidden.length === 1 ? `${hidden[0]} is hidden.` : `${hidden.length} merchants hidden.`;
    return { ok: skipped.length ? `${one} Skipped: ${skipped.join("; ")}` : one };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

export async function unhideMerchants(ids: string[]): Promise<{ ok?: string; error?: string }> {
  try {
    const user = await requirePermission("merchants.hide");
    const actor = await actorFor(user);
    const names: string[] = [];
    for (const id of [...new Set(ids)].slice(0, 500)) {
      await assertMerchantInScope(user, id);
      const m = await db.query.merchants.findFirst({ where: eq(schema.merchants.id, id), columns: { dbaName: true, hiddenAt: true } });
      if (!m?.hiddenAt) continue;
      await db.update(schema.merchants).set({ hiddenAt: null, hiddenById: null }).where(eq(schema.merchants.id, id));
      await db.insert(schema.activities).values({ type: "system", title: `Unhidden by ${user.name}`, merchantId: id, actorUserId: user.id });
      await audit(actor, "merchant.unhidden", "merchant", id, { dbaName: m.dbaName });
      names.push(m.dbaName);
      revalidatePath(`/merchants/${id}`);
    }
    revalidatePath("/merchants");
    revalidatePath("/applications");
    if (!names.length) return { ok: "Nothing to unhide." };
    return { ok: names.length === 1 ? `${names[0]} is visible again.` : `${names.length} merchants are visible again.` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong." };
  }
}
