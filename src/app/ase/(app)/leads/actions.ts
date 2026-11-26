"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { actorFor, requirePermission, scopeOwnerIds, type CurrentUser } from "@/lib/dal";
import { audit } from "@/lib/audit";
import { last4 } from "@/lib/crypto";
import { findDuplicates, type DupMatch } from "@/lib/duplicates";
import { scoreEngagementFor, scoreFit, scoreSource, scoreVolume } from "@/lib/leads";

export type LeadFormState = { error?: string; fieldErrors?: Record<string, string>; duplicates?: DupMatch[]; values?: Record<string, string>; ok?: string };
const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

async function leadInScope(user: CurrentUser, id: string) {
  const lead = await db.query.leads.findFirst({ where: eq(schema.leads.id, id) });
  const owners = await scopeOwnerIds(user);
  if (!lead || (owners && (!lead.ownerId || !owners.includes(lead.ownerId)))) throw new Error("Lead not found.");
  return lead;
}

export async function createLead(_p: LeadFormState, f: FormData): Promise<LeadFormState> {
  const values = Object.fromEntries(["businessName", "contactName", "email", "phone", "website", "source", "mcc", "industry", "estMonthlyVolume", "currentProcessor", "ein", "ownerId"].map((k) => [k, s(f, k)]));
  try {
    const user = await requirePermission("leads.edit");
    const v = z.object({
      businessName: z.string().min(2, "Enter the business name"),
      email: z.string().refine((x) => x === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x), "Invalid email"),
      source: z.enum(["web_form", "referral", "import", "partner", "manual"]),
      mcc: z.string().refine((x) => x === "" || /^\d{4}$/.test(x), "MCC is 4 digits"),
      estMonthlyVolume: z.string().refine((x) => x === "" || !Number.isNaN(Number(x.replace(/[$,]/g, ""))), "Enter a number"),
    }).passthrough().parse({ ...values, source: values.source || "manual" });
    const decision = s(f, "duplicateDecision"); // "" | "create" | "merge:<id>" | "link:<merchantId>"
    if (!decision) {
      const dups = await findDuplicates({ name: v.businessName, phone: values.phone, website: values.website, email: values.email, einLast4: last4(values.ein) });
      if (dups.some((d) => d.confidence !== "low")) return { duplicates: dups, values };
    }
    const volume = values.estMonthlyVolume ? Number(values.estMonthlyVolume.replace(/[$,]/g, "")) : null;
    const owners = await scopeOwnerIds(user);
    const ownerId = owners ? user.id : values.ownerId || user.id;

    if (decision.startsWith("merge:")) {
      const target = await leadInScope(user, decision.slice(6));
      await db.update(schema.leads).set({
        contactName: target.contactName ?? (values.contactName || null), email: target.email ?? (values.email || null), phone: target.phone ?? (values.phone || null),
        website: target.website ?? (values.website || null), estMonthlyVolume: target.estMonthlyVolume ?? volume, lastActivityAt: new Date(), lastActivityNote: "Merged duplicate",
      }).where(eq(schema.leads.id, target.id));
      await db.insert(schema.activities).values({ type: "note", title: "Duplicate merged", body: `Merged a new ${v.source.replace("_", " ")} lead “${v.businessName}” into this record.`, leadId: target.id, actorUserId: user.id, internal: true });
      await audit(await actorFor(user), "lead.merge", "lead", target.id, { incoming: v.businessName });
      revalidatePath("/ase/leads");
      redirect(`/ase/leads?lead=${target.id}`);
    }

    const [lead] = await db.insert(schema.leads).values({
      businessName: v.businessName, contactName: values.contactName || null, email: values.email || null, phone: values.phone || null, website: values.website || null,
      source: v.source, mcc: values.mcc || null, industry: values.industry || null, estMonthlyVolume: volume, currentProcessor: values.currentProcessor || null, einLast4: last4(values.ein),
      scoreFit: scoreFit(values.mcc), scoreVolume: scoreVolume(volume), scoreSource: scoreSource(v.source), scoreEngagement: 0, ownerId,
      merchantId: decision.startsWith("link:") ? decision.slice(5) : null, lastActivityAt: new Date(), lastActivityNote: "Created",
    }).returning();
    await audit(await actorFor(user), "lead.create", "lead", lead!.id, { name: v.businessName, duplicateDecision: decision || null });
    revalidatePath("/ase/leads");
    redirect(`/ase/leads?lead=${lead!.id}`);
  } catch (e) {
    if ((e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
    if (e instanceof z.ZodError) return { values, fieldErrors: Object.fromEntries(e.issues.map((i) => [String(i.path[0]), i.message])) };
    return { values, error: (e as Error).message };
  }
}

export async function logLeadActivity(_p: LeadFormState, f: FormData): Promise<LeadFormState> {
  try {
    const user = await requirePermission("leads.edit");
    const lead = await leadInScope(user, s(f, "leadId"));
    const type = z.enum(["call", "email", "note"]).parse(s(f, "type"));
    const body = s(f, "body");
    if (!body) return { error: "Write something first." };
    const title = { call: "Call", email: "Email", note: "Note" }[type];
    await db.insert(schema.activities).values({ type, title, body, leadId: lead.id, actorUserId: user.id, internal: type === "note" });
    const n = (await db.select({ id: schema.activities.id }).from(schema.activities).where(eq(schema.activities.leadId, lead.id))).length;
    await db.update(schema.leads).set({ lastActivityAt: new Date(), lastActivityNote: title, scoreEngagement: scoreEngagementFor(n) }).where(eq(schema.leads.id, lead.id));
    revalidatePath("/ase/leads");
    return { ok: `${title} logged.` };
  } catch (e) { return { error: (e as Error).message }; }
}

export async function convertLead(leadId: string) {
  const user = await requirePermission("deals.edit");
  const lead = await leadInScope(user, leadId);
  const existing = await db.query.deals.findFirst({ where: eq(schema.deals.leadId, lead.id) });
  if (!existing) {
    const [deal] = await db.insert(schema.deals).values({ name: lead.businessName, leadId: lead.id, merchantId: lead.merchantId, stage: "contacted", amount: lead.estMonthlyVolume ?? 0, ownerId: lead.ownerId ?? user.id }).returning();
    await db.insert(schema.dealStageHistory).values({ dealId: deal!.id, stage: "contacted" });
    await audit(await actorFor(user), "lead.convert", "lead", lead.id, { dealId: deal!.id });
  }
  revalidatePath("/ase/leads"); revalidatePath("/ase/deals");
  redirect("/ase/deals");
}

export async function disqualifyLead(leadId: string) {
  const user = await requirePermission("leads.edit");
  const lead = await leadInScope(user, leadId);
  await db.update(schema.leads).set({ status: "disqualified" }).where(eq(schema.leads.id, lead.id));
  await audit(await actorFor(user), "lead.disqualify", "lead", lead.id);
  revalidatePath("/ase/leads");
  redirect("/ase/leads");
}

export async function bulkAssignLeads(f: FormData) {
  const user = await requirePermission("leads.edit");
  if (await scopeOwnerIds(user)) throw new Error("Only managers can reassign leads.");
  const ids = f.getAll("ids").map(String);
  const ownerId = s(f, "ownerId");
  if (!ids.length || !ownerId) return;
  await db.update(schema.leads).set({ ownerId }).where(and(inArray(schema.leads.id, ids)));
  await audit(await actorFor(user), "lead.reassign", "lead", undefined, { ids, ownerId });
  revalidatePath("/ase/leads");
}
