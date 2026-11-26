"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, sql as dsql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { actorFor, assertMerchantInScope, requirePermission, type CurrentUser } from "@/lib/dal";
import { audit } from "@/lib/audit";
import { adapterFor, configOf, getConnection } from "@/lib/integrations";
import { submitBlockers, SECTIONS } from "@/lib/applications";
import type { ActionState } from "@/components/forms";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

async function load(user: CurrentUser, id: string) {
  const app = await db.query.applications.findFirst({ where: eq(schema.applications.id, id) });
  if (!app) throw new Error("Application not found.");
  await assertMerchantInScope(user, app.merchantId);
  return app;
}

/** Writes to the processor only happen for connections with an external id, and require confirmation when configured. */
async function processorWrite(app: typeof schema.applications.$inferSelect, confirmed: boolean, fn: (a: ReturnType<typeof adapterFor>, ext: string) => Promise<void>) {
  if (!app.connectionId || !app.externalId) return { pushed: false, note: "Saved in the CRM only (this application isn’t linked to a processor record yet)." };
  const conn = await getConnection(app.connectionId);
  if (!conn?.enabled) return { pushed: false, note: "Saved in the CRM only (the processor connection is disabled)." };
  if (configOf(conn).confirmWrites && !confirmed) throw new Error("CONFIRM");
  await fn(adapterFor(conn), app.externalId);
  return { pushed: true, note: `Sent to Maverick (${conn.mode}).` };
}

export async function createApplication(_p: ActionState, f: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("deals.edit").catch(() => requirePermission("applications.edit"));
    let merchantId = s(f, "merchantId");
    const dealId = s(f, "dealId") || null;
    const dbaName = s(f, "dbaName"), legalName = s(f, "legalName");
    if (!merchantId) {
      if (!dbaName) return { fieldErrors: { dbaName: "Enter the DBA name" } };
      const [le] = await db.insert(schema.legalEntities).values({ legalName: legalName || dbaName }).returning();
      const deal = dealId ? await db.query.deals.findFirst({ where: eq(schema.deals.id, dealId) }) : null;
      const [m] = await db.insert(schema.merchants).values({ dbaName, legalEntityId: le!.id, status: "boarding", mcc: s(f, "mcc") || null, ownerId: deal?.ownerId ?? user.id }).returning();
      merchantId = m!.id;
      if (dealId) await db.update(schema.deals).set({ merchantId }).where(eq(schema.deals.id, dealId));
    } else {
      await assertMerchantInScope(user, merchantId);
      await db.update(schema.merchants).set({ status: "boarding" }).where(and(eq(schema.merchants.id, merchantId), eq(schema.merchants.status, "prospect")));
    }
    const connId = s(f, "connectionId") || null;
    const [{ next }] = (await db.execute(dsql`select coalesce(max(nullif(regexp_replace(number, '\\D', '', 'g'), '')::int), 20000) + 1 as next from applications where number like 'APP-%'`)) as unknown as { next: number }[];
    const volume = Number(s(f, "volume").replace(/[$,]/g, "")) || null;
    const sections = Object.fromEntries(SECTIONS.map((x) => [x.key, { state: "missing", summary: "Not started" }]));
    if (dbaName || merchantId) sections.business = { state: "partial", summary: "DBA and legal name from the deal · address and EIN needed" };
    if (volume) sections.processing = { state: "partial", summary: `Est. $${volume.toLocaleString()}/mo · ticket sizes needed` };
    if (s(f, "campaign")) sections.fees = { state: "complete", summary: `Pricing campaign “${s(f, "campaign")}”` };
    const [app] = await db.insert(schema.applications).values({
      number: `APP-${next}`, merchantId, dealId, connectionId: connId, campaign: s(f, "campaign") || null, forLabel: s(f, "forLabel") || "New merchant",
      status: "New", estMonthlyVolume: volume, avgTicket: Number(s(f, "avgTicket")) || null, sections, ownerId: user.id,
    }).returning();
    await db.insert(schema.applicationStatusHistory).values({ applicationId: app!.id, status: "New" });
    const docs = ["Voided check", "Driver’s license — primary owner", "Business license", "Bank statements · 3 months", "Prior processing statements"];
    await db.insert(schema.applicationDocuments).values(docs.map((name) => ({ applicationId: app!.id, name, required: true })));
    await db.insert(schema.activities).values({ type: "system", title: `Boarding application ${app!.number} created`, merchantId, applicationId: app!.id, actorUserId: user.id, tag: app!.number });
    await audit(await actorFor(user), "application.create", "application", app!.id, { dealId, merchantId });
    revalidatePath("/ase/applications");
    redirect(`/ase/applications/${app!.id}`);
  } catch (e) {
    if ((e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
    return { error: (e as Error).message };
  }
}

export async function setSection(appId: string, key: string, state: "complete" | "partial" | "missing", summary: string) {
  const user = await requirePermission("applications.edit");
  const app = await load(user, appId);
  const sections = { ...(app.sections as object), [key]: { state, summary } };
  await db.update(schema.applications).set({ sections }).where(eq(schema.applications.id, appId));
  await audit(await actorFor(user), "application.section", "application", appId, { key, state });
  revalidatePath(`/ase/applications/${appId}`);
}

export async function toggleDocument(appId: string, docId: string, uploaded: boolean) {
  const user = await requirePermission("applications.edit");
  await load(user, appId);
  await db.update(schema.applicationDocuments).set({ uploaded, uploadedAt: uploaded ? new Date() : null }).where(and(eq(schema.applicationDocuments.id, docId), eq(schema.applicationDocuments.applicationId, appId)));
  const docs = await db.select().from(schema.applicationDocuments).where(eq(schema.applicationDocuments.applicationId, appId));
  const req = docs.filter((d) => d.required), got = req.filter((d) => d.uploaded).length;
  const app = await db.query.applications.findFirst({ where: eq(schema.applications.id, appId) });
  await db.update(schema.applications).set({ sections: { ...(app!.sections as object), documents: { state: got === req.length ? "complete" : got ? "partial" : "missing", summary: `${got} of ${req.length} required received` } } }).where(eq(schema.applications.id, appId));
  revalidatePath(`/ase/applications/${appId}`);
}

export async function toggleCondition(appId: string, condId: string, met: boolean) {
  const user = await requirePermission("applications.edit");
  await load(user, appId);
  await db.update(schema.applicationConditions).set({ met, metAt: met ? new Date() : null }).where(and(eq(schema.applicationConditions.id, condId), eq(schema.applicationConditions.applicationId, appId)));
  await audit(await actorFor(user), "application.condition", "application", appId, { condId, met });
  revalidatePath(`/ase/applications/${appId}`);
}

export async function addSigner(_p: ActionState, f: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("applications.edit");
    const app = await load(user, s(f, "appId"));
    const v = z.object({ name: z.string().min(2), email: z.string().email().or(z.literal("")), role: z.string(), ownershipPct: z.number().min(0).max(100) })
      .parse({ name: s(f, "name"), email: s(f, "email"), role: s(f, "role") || "Owner · Signer", ownershipPct: Number(s(f, "ownershipPct") || 0) });
    await db.insert(schema.applicationSigners).values({ applicationId: app.id, ...v, email: v.email || null, lastEvent: "Added" });
    revalidatePath(`/ase/applications/${app.id}`);
    return { ok: "Signer added." };
  } catch (e) { return { error: e instanceof z.ZodError ? "Enter a name, a valid email and ownership %." : (e as Error).message }; }
}

export async function addNote(_p: ActionState, f: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("applications.edit");
    const app = await load(user, s(f, "appId"));
    const body = s(f, "body");
    if (!body) return { error: "Write a note first." };
    await db.insert(schema.activities).values({ type: "note", title: "Note", body, merchantId: app.merchantId, applicationId: app.id, actorUserId: user.id, internal: true });
    revalidatePath(`/ase/applications/${app.id}`);
    return { ok: "Note added." };
  } catch (e) { return { error: (e as Error).message }; }
}

export async function sendEsign(appId: string, confirmed = false): Promise<ActionState> {
  try {
    const user = await requirePermission("applications.edit");
    const app = await load(user, appId);
    const r = await processorWrite(app, confirmed, (a, ext) => a.requestSignature(ext));
    await db.update(schema.applicationSigners).set({ lastEvent: `E-sign request sent ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}` })
      .where(and(eq(schema.applicationSigners.applicationId, appId), dsql`${schema.applicationSigners.status} <> 'Signed'`));
    await db.insert(schema.activities).values({ type: "system", title: "E-sign request sent", merchantId: app.merchantId, applicationId: app.id, actorUserId: user.id, tag: app.number });
    await audit(await actorFor(user), "application.esign_requested", "application", appId, { pushed: r.pushed });
    revalidatePath(`/ase/applications/${appId}`);
    return { ok: `E-sign request sent. ${r.note}` };
  } catch (e) { return (e as Error).message === "CONFIRM" ? { error: "CONFIRM" } : { error: (e as Error).message }; }
}

export async function getCompletionLink(appId: string): Promise<ActionState & { url?: string }> {
  try {
    const user = await requirePermission("applications.edit");
    const app = await load(user, appId);
    let url = app.completionUrl;
    if (!url && app.connectionId && app.externalId) {
      const conn = await getConnection(app.connectionId);
      if (conn?.enabled) url = await adapterFor(conn).getApplicationUrl(app.externalId);
      if (url) await db.update(schema.applications).set({ completionUrl: url }).where(eq(schema.applications.id, appId));
    }
    if (!url) return { error: "No completion link yet. It’s available once the application exists at the processor." };
    await audit(await actorFor(user), "application.link_copied", "application", appId);
    return { ok: "Link copied to your clipboard.", url };
  } catch (e) { return { error: (e as Error).message }; }
}

export async function markSignedManually(appId: string): Promise<ActionState> {
  try {
    const user = await requirePermission("applications.edit");
    const app = await load(user, appId);
    await db.update(schema.applicationSigners).set({ status: "Signed", signedAt: new Date(), lastEvent: `Marked signed manually by ${user.name}` }).where(eq(schema.applicationSigners.applicationId, appId));
    const sections = { ...(app.sections as object), signature: { state: "complete", summary: "Signed (marked manually)" } };
    await db.update(schema.applications).set({ signatureStatus: "Signed", sections }).where(eq(schema.applications.id, appId));
    await db.insert(schema.activities).values({ type: "system", title: "Application marked signed manually", merchantId: app.merchantId, applicationId: app.id, actorUserId: user.id, tag: app.number });
    await audit(await actorFor(user), "application.signed_manually", "application", appId);
    revalidatePath(`/ase/applications/${appId}`);
    return { ok: "Marked as signed. Keep the signed PDF with the merchant’s documents." };
  } catch (e) { return { error: (e as Error).message }; }
}

export async function setStatus(appId: string, status: "Pending" | "Underwriting" | "Approved" | "Declined" | "Cancelled", confirmed = false): Promise<ActionState> {
  try {
    const user = await requirePermission("applications.edit");
    const app = await load(user, appId);
    let note = "";
    if (status === "Underwriting") {
      const [docs, signers] = await Promise.all([
        db.select().from(schema.applicationDocuments).where(eq(schema.applicationDocuments.applicationId, appId)),
        db.select().from(schema.applicationSigners).where(eq(schema.applicationSigners.applicationId, appId)),
      ]);
      const blockers = submitBlockers(app, docs, signers);
      if (blockers.length) return { error: `Not ready: ${blockers.join("; ")}` };
      note = (await processorWrite(app, confirmed, (a, ext) => a.submitToUnderwriting(ext))).note;
    }
    await db.update(schema.applications).set({ status, statusChangedAt: new Date(), approvedAt: status === "Approved" ? new Date() : app.approvedAt }).where(eq(schema.applications.id, appId));
    await db.insert(schema.applicationStatusHistory).values({ applicationId: appId, status });
    await db.insert(schema.activities).values({ type: "system", title: `Application ${app.number} moved to ${status}`, merchantId: app.merchantId, applicationId: appId, actorUserId: user.id, tag: app.number });
    if (status === "Declined" || status === "Cancelled") {
      const others = await db.select({ id: schema.applications.id }).from(schema.applications).where(and(eq(schema.applications.merchantId, app.merchantId), dsql`${schema.applications.status} not in ('Declined','Cancelled')`, dsql`${schema.applications.id} <> ${appId}`));
      const m = await db.query.merchants.findFirst({ where: eq(schema.merchants.id, app.merchantId) });
      if (!others.length && m?.status === "boarding") await db.update(schema.merchants).set({ status: "prospect" }).where(eq(schema.merchants.id, app.merchantId));
    }
    await audit(await actorFor(user), "application.status", "application", appId, { from: app.status, to: status });
    revalidatePath(`/ase/applications/${appId}`); revalidatePath("/ase/applications");
    return { ok: `Moved to ${status}. ${note}`.trim() };
  } catch (e) { return (e as Error).message === "CONFIRM" ? { error: "CONFIRM" } : { error: (e as Error).message }; }
}

export async function refreshChecks(appId: string): Promise<ActionState> {
  try {
    const user = await requirePermission("applications.edit");
    const app = await load(user, appId);
    if (!app.connectionId || !app.externalId) return { error: "This application isn’t linked to a processor record." };
    const conn = await getConnection(app.connectionId);
    if (!conn?.enabled) return { error: "The processor connection is disabled." };
    const checks = await adapterFor(conn).getApplicationChecks(app.externalId);
    if (!checks.length) return { ok: "No new check results from the processor." };
    await db.delete(schema.applicationChecks).where(eq(schema.applicationChecks.applicationId, appId));
    await db.insert(schema.applicationChecks).values(checks.map((c) => ({ applicationId: appId, name: c.name, status: c.status, detail: c.detail ?? null })));
    revalidatePath(`/ase/applications/${appId}`);
    return { ok: `${checks.length} checks refreshed.` };
  } catch (e) { return { error: (e as Error).message }; }
}
