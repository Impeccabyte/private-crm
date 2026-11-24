"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { actorFor, requirePermission } from "@/lib/dal";
import { audit } from "@/lib/audit";
import { getSetting } from "@/lib/settings";
import { newsletterMailProblems, sendMailRich } from "@/lib/mail";
import { enqueueEmailRound } from "@/jobs/queue";
import { audienceSchema, campaignSchema, DEFAULT_AUDIENCE, DEFAULT_STYLE, sendProblems, starterBlocks, validEmail, type Audience, type Block, type CampaignInput } from "@/lib/email/types";
import { renderEmail } from "@/lib/email/render";
import { firstName, resolveAudience } from "@/lib/email/audience";
import { appUrl, typedCampaign } from "@/lib/email/server";

export type Result = { ok?: string; error?: string; problems?: string[] };

const C = schema.emailCampaigns;
const msg = (e: unknown) => (e instanceof z.ZodError ? e.issues[0]?.message ?? "Check the newsletter." : (e as Error).message);
const paths = (id: string) => { revalidatePath(`/email/${id}`); revalidatePath("/email"); };

async function load(id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("Newsletter not found.");
  const c = await db.query.emailCampaigns.findFirst({ where: eq(C.id, id) });
  if (!c) throw new Error("Newsletter not found.");
  return typedCampaign(c);
}

export async function createCampaign(templateId: string | null) {
  const user = await requirePermission("campaigns.manage");
  const tpl = templateId && /^[0-9a-f-]{36}$/.test(templateId) ? await db.query.emailTemplates.findFirst({ where: eq(schema.emailTemplates.id, templateId) }) : null;
  const general = await getSetting("general");
  const [c] = await db.insert(C).values({
    name: tpl ? `${tpl.name} newsletter` : "Untitled newsletter",
    blocks: tpl ? tpl.blocks : starterBlocks(),
    style: tpl ? tpl.style : { ...DEFAULT_STYLE, accent: /^#[0-9a-f]{6}$/i.test(general.accentColor) ? general.accentColor : DEFAULT_STYLE.accent },
    audience: DEFAULT_AUDIENCE, createdById: user.id,
  }).returning({ id: C.id });
  await audit(await actorFor(user), "campaign.create", "email_campaign", c!.id, tpl ? { template: tpl.name } : {});
  redirect(`/email/${c!.id}`);
}

/** Autosaved from the builder. Only drafts can be edited; schedule, send and cancel have their own actions. */
export async function saveCampaign(id: string, input: CampaignInput): Promise<Result> {
  try {
    const user = await requirePermission("campaigns.manage");
    const c = await load(id);
    if (c.status !== "draft") return { error: "This newsletter can’t be edited any more. Duplicate it to make changes." };
    const v = campaignSchema.parse(input);
    await db.update(C).set(v).where(and(eq(C.id, id), eq(C.status, "draft")));
    // Autosave runs often, so the audit log gets one entry per editing session rather than one per keystroke.
    if (Date.now() - c.updatedAt.getTime() > 10 * 60_000) await audit(await actorFor(user), "campaign.update", "email_campaign", id, { name: v.name, blocks: v.blocks.length });
    revalidatePath("/email");
    return { ok: "Saved" };
  } catch (e) { return { error: msg(e) }; }
}

export async function duplicateCampaign(id: string) {
  const user = await requirePermission("campaigns.manage");
  const c = await load(id);
  const [n] = await db.insert(C).values({
    name: `${c.name} (copy)`.slice(0, 120), subject: c.subject, preheader: c.preheader, fromName: c.fromName, replyTo: c.replyTo,
    blocks: c.blocks, style: c.style, audience: c.audience, createdById: user.id,
  }).returning({ id: C.id });
  await audit(await actorFor(user), "campaign.create", "email_campaign", n!.id, { duplicatedFrom: id });
  redirect(`/email/${n!.id}`);
}

export async function deleteCampaign(id: string): Promise<Result> {
  try {
    const user = await requirePermission("campaigns.manage");
    const c = await load(id);
    if (c.status !== "draft") return { error: "Only drafts can be deleted. Sent newsletters are kept for their reports." };
    await db.delete(C).where(and(eq(C.id, id), eq(C.status, "draft")));
    await audit(await actorFor(user), "campaign.delete", "email_campaign", id, { name: c.name });
  } catch (e) { return { error: msg(e) }; }
  revalidatePath("/email");
  redirect("/email");
}

export type AudienceSummary = { count: number; excluded: { noEmail: number; invalid: number; duplicate: number; suppressed: number }; sample: { email: string; name: string | null; businessName: string | null; kind: "Lead" | "Merchant" }[]; error?: string };

export async function audienceSummary(input: Audience): Promise<AudienceSummary> {
  const empty = { count: 0, excluded: { noEmail: 0, invalid: 0, duplicate: 0, suppressed: 0 }, sample: [] };
  try {
    await requirePermission("campaigns.manage");
    const r = await resolveAudience(audienceSchema.parse(input));
    return { count: r.members.length, excluded: r.excluded, sample: r.members.slice(0, 10).map((m) => ({ email: m.email, name: m.name, businessName: m.businessName, kind: m.leadId ? "Lead" : "Merchant" })) };
  } catch (e) { return { ...empty, error: msg(e) }; }
}

/** Sends the current design to the signed-in user only. */
export async function sendTest(id: string): Promise<Result> {
  try {
    const user = await requirePermission("campaigns.manage");
    const c = await load(id);
    if (!c.blocks.length) return { error: "Add at least one block first." };
    const [g, mail] = await Promise.all([getSetting("general"), getSetting("email")]);
    const out = renderEmail(c, {
      merge: { first_name: firstName(user.name), name: user.name, business_name: "Harbor Coffee Co." },
      companyName: g.companyName, postalAddress: mail.postalAddress || "Your postal address (set it in Settings → Email)",
      unsubscribeUrl: `${appUrl()}/e/u/test-email-preview-link`,
    });
    const r = await sendMailRich({ to: user.email, subject: `[Test] ${out.subject || c.name}`, text: out.text, html: out.html, fromName: c.fromName || undefined, replyTo: validEmail(c.replyTo) ? c.replyTo.trim() : undefined });
    if (!r.ok) return { error: r.error ?? "The test couldn’t be sent." };
    await audit(await actorFor(user), "campaign.test", "email_campaign", id, { to: user.email });
    return { ok: `Test sent to ${user.email}.` };
  } catch (e) { return { error: msg(e) }; }
}

async function readyToSend(id: string) {
  const c = await load(id);
  if (c.status !== "draft" && c.status !== "scheduled") throw new Error("This newsletter has already been sent or is sending.");
  const problems = [...sendProblems(c), ...newsletterMailProblems(await getSetting("email"))];
  const count = problems.length ? 0 : (await resolveAudience(c.audience)).members.length;
  if (!problems.length && count === 0) problems.push("Nobody matches the audience you chose (or everyone has unsubscribed).");
  return { c, problems, count };
}

export async function sendNow(id: string): Promise<Result> {
  try {
    const user = await requirePermission("campaigns.manage");
    const { c, problems, count } = await readyToSend(id);
    if (problems.length) return { error: "Fix these before sending.", problems };
    const moved = await db.update(C).set({ status: "sending", startedAt: new Date(), scheduledAt: null, lastError: null }).where(and(eq(C.id, id), inArray(C.status, ["draft", "scheduled"]))).returning({ id: C.id });
    if (!moved.length) return { error: "This newsletter is already sending." };
    await audit(await actorFor(user), "campaign.send", "email_campaign", id, { name: c.name, subject: c.subject, recipients: count, audience: c.audience });
    await enqueueEmailRound().catch((e) => console.error("[email] couldn’t start a round now; the worker picks it up within a minute", e));
    paths(id);
    return { ok: `Sending to ${count.toLocaleString("en-US")} ${count === 1 ? "person" : "people"}.` };
  } catch (e) { return { error: msg(e) }; }
}

export async function scheduleCampaign(id: string, whenIso: string): Promise<Result> {
  try {
    const user = await requirePermission("campaigns.manage");
    const when = new Date(whenIso);
    if (Number.isNaN(when.getTime())) return { error: "Choose a date and time." };
    if (when.getTime() < Date.now() + 60_000) return { error: "Choose a time at least a minute from now, or use Send now." };
    if (when.getTime() > Date.now() + 365 * 86_400_000) return { error: "Choose a time within the next year." };
    const { c, problems, count } = await readyToSend(id);
    if (problems.length) return { error: "Fix these before scheduling.", problems };
    await db.update(C).set({ status: "scheduled", scheduledAt: when }).where(and(eq(C.id, id), inArray(C.status, ["draft", "scheduled"])));
    await audit(await actorFor(user), "campaign.schedule", "email_campaign", id, { name: c.name, at: when.toISOString(), recipientsNow: count });
    paths(id);
    return { ok: "Scheduled." };
  } catch (e) { return { error: msg(e) }; }
}

/** Scheduled → back to draft. Sending → stops; anyone not yet sent to is skipped. */
export async function cancelCampaign(id: string): Promise<Result> {
  try {
    const user = await requirePermission("campaigns.manage");
    const c = await load(id);
    if (c.status === "scheduled") {
      await db.update(C).set({ status: "draft", scheduledAt: null }).where(and(eq(C.id, id), eq(C.status, "scheduled")));
      await audit(await actorFor(user), "campaign.unschedule", "email_campaign", id, { name: c.name });
      paths(id);
      return { ok: "Schedule cancelled. It’s a draft again." };
    }
    if (c.status === "sending") {
      const R = schema.emailRecipients;
      const stopped = await db.update(C).set({ status: "cancelled", finishedAt: new Date() }).where(and(eq(C.id, id), eq(C.status, "sending"))).returning({ id: C.id });
      if (!stopped.length) return { error: "It finished sending before it could be stopped." };
      const skipped = await db.update(R).set({ status: "skipped", error: "Sending was cancelled." }).where(and(eq(R.campaignId, id), eq(R.status, "queued"))).returning({ id: R.id });
      await audit(await actorFor(user), "campaign.cancel", "email_campaign", id, { name: c.name, notSent: skipped.length });
      paths(id);
      return { ok: `Stopped. ${skipped.length.toLocaleString("en-US")} not sent.` };
    }
    return { error: "There’s nothing to cancel." };
  } catch (e) { return { error: msg(e) }; }
}

export async function saveAsTemplate(id: string, name: string): Promise<Result> {
  try {
    const user = await requirePermission("campaigns.manage");
    const c = await load(id);
    const n = z.string().trim().min(1, "Give the template a name.").max(80).parse(name);
    const [t] = await db.insert(schema.emailTemplates).values({ name: n, blocks: c.blocks as Block[], style: c.style, createdById: user.id }).returning({ id: schema.emailTemplates.id });
    await audit(await actorFor(user), "campaign.template_save", "email_template", t!.id, { name: n, from: id });
    revalidatePath("/email");
    return { ok: `Saved “${n}” as a template.` };
  } catch (e) { return { error: msg(e) }; }
}

export async function deleteTemplate(id: string): Promise<Result> {
  try {
    const user = await requirePermission("campaigns.manage");
    const [t] = await db.delete(schema.emailTemplates).where(eq(schema.emailTemplates.id, id)).returning({ name: schema.emailTemplates.name });
    if (t) await audit(await actorFor(user), "campaign.template_delete", "email_template", id, { name: t.name });
    revalidatePath("/email");
    return { ok: "Template deleted." };
  } catch (e) { return { error: msg(e) }; }
}

// ── Do-not-email list ────────────────────────────────────────────────────────
export async function addSuppression(_p: Result, f: FormData): Promise<Result> {
  try {
    const user = await requirePermission("campaigns.manage");
    const email = z.string().trim().toLowerCase().email("Enter a valid email address.").max(254).parse(String(f.get("email") ?? ""));
    const added = await db.insert(schema.emailSuppressions).values({ email, reason: "manual", detail: `Added by ${user.name}` }).onConflictDoNothing().returning({ email: schema.emailSuppressions.email });
    if (!added.length) return { error: `${email} is already on the list.` };
    await audit(await actorFor(user), "campaign.suppress", "email_suppression", email);
    revalidatePath("/email/suppressed");
    return { ok: `${email} won’t get newsletters.` };
  } catch (e) { return { error: msg(e) }; }
}

export async function removeSuppression(email: string): Promise<Result> {
  try {
    const user = await requirePermission("campaigns.manage");
    const [gone] = await db.delete(schema.emailSuppressions).where(eq(schema.emailSuppressions.email, email)).returning();
    if (gone) await audit(await actorFor(user), "campaign.unsuppress", "email_suppression", email, { was: gone.reason });
    revalidatePath("/email/suppressed");
    return { ok: `${email} can get newsletters again.` };
  } catch (e) { return { error: msg(e) }; }
}
