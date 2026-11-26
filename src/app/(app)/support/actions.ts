"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, sql as dsql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { actorFor, assertMerchantInScope, requirePermission, type CurrentUser } from "@/lib/dal";
import { audit } from "@/lib/audit";
import { getSetting } from "@/lib/settings";
import { adapterFor, configOf, getConnection } from "@/lib/integrations";
import { sendMail } from "@/lib/mail";
import type { ActionState } from "@/components/forms";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

async function loadTicket(user: CurrentUser, id: string) {
  const t = await db.query.tickets.findFirst({ where: eq(schema.tickets.id, id) });
  if (!t) throw new Error("Ticket not found.");
  if (t.merchantId) await assertMerchantInScope(user, t.merchantId);
  return t;
}

async function nextNumber() {
  const [{ next }] = (await db.execute(dsql`select coalesce(max(nullif(regexp_replace(number, '\\D', '', 'g'), '')::int), 3000) + 1 as next from tickets where number like 'TCK-%'`)) as unknown as { next: number }[];
  return `TCK-${next}`;
}

export async function createTicket(_p: ActionState, f: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("tickets.edit");
    const v = z.object({ subject: z.string().min(3, "Enter a subject"), body: z.string().min(1, "Describe the issue"), merchantId: z.string().uuid().optional().or(z.literal("")), category: z.string(), priority: z.enum(["low", "normal", "high"]) })
      .parse({ subject: s(f, "subject"), body: s(f, "body"), merchantId: s(f, "merchantId"), category: s(f, "category"), priority: s(f, "priority") || "normal" });
    if (v.merchantId) await assertMerchantInScope(user, v.merchantId);
    const g = await getSetting("general");
    const contact = v.merchantId ? await db.query.contacts.findFirst({ where: eq(schema.contacts.merchantId, v.merchantId) }) : null;
    const [t] = await db.insert(schema.tickets).values({
      number: await nextNumber(), merchantId: v.merchantId || null, subject: v.subject, category: v.category || null, priority: v.priority, source: "internal",
      assigneeId: user.role === "support" ? user.id : null, contactName: contact ? `${contact.firstName} ${contact.lastName}` : null, contactEmail: contact?.email ?? null,
      slaDueAt: new Date(Date.now() + g.ticketFirstResponseMinutes * 60_000),
    }).returning();
    await db.insert(schema.ticketMessages).values({ ticketId: t!.id, kind: "internal", authorName: user.name, authorUserId: user.id, body: v.body });
    await audit(await actorFor(user), "ticket.create", "ticket", t!.id);
    revalidatePath("/support");
    redirect(`/support?t=${t!.id}`);
  } catch (e) {
    if ((e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
    return { error: e instanceof z.ZodError ? e.issues[0]!.message : (e as Error).message };
  }
}

export async function postMessage(_p: ActionState, f: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("tickets.edit");
    const t = await loadTicket(user, s(f, "ticketId"));
    const mode = s(f, "mode") === "note" ? "note" : "reply";
    const body = s(f, "body");
    const notify = f.get("notify") === "on";
    if (!body) return { error: "Write a message first." };
    let note = "";
    if (mode === "reply") {
      if (t.source === "maverick" && t.connectionId && t.externalId) {
        const conn = await getConnection(t.connectionId);
        if (conn?.enabled) {
          if (configOf(conn).confirmWrites && f.get("confirmed") !== "yes") return { error: "CONFIRM" };
          await adapterFor(conn).addTicketResponse(t.externalId, body);
          note = " Posted to the Maverick ticket.";
        }
      } else if (notify && t.contactEmail) {
        const portalLink = t.source === "portal" ? `\n\nSee the whole conversation and reply in your Impeccabyte account:\n${(process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}/portal/requests/${t.id}\n` : "";
        const r = await sendMail(t.contactEmail, `Re: ${t.subject} [${t.number}]`, body + portalLink);
        note = r.ok ? ` Emailed ${t.contactEmail}.` : ` Email failed: ${r.error}`;
      }
    }
    await db.insert(schema.ticketMessages).values({ ticketId: t.id, kind: mode === "note" ? "internal" : "outbound", authorName: user.name, authorUserId: user.id, body, notifyMerchant: mode === "reply" && notify });
    await db.update(schema.tickets).set({
      firstResponseAt: mode === "reply" && !t.firstResponseAt ? new Date() : t.firstResponseAt,
      status: mode === "reply" && t.status === "New" ? "In Progress" : t.status, assigneeId: t.assigneeId ?? user.id,
    }).where(eq(schema.tickets.id, t.id));
    await audit(await actorFor(user), mode === "note" ? "ticket.note" : "ticket.reply", "ticket", t.id, { notify });
    revalidatePath("/support");
    return { ok: (mode === "note" ? "Internal note added." : "Reply saved.") + note };
  } catch (e) { return { error: (e as Error).message }; }
}

export async function updateTicket(f: FormData) {
  const user = await requirePermission("tickets.edit");
  const t = await loadTicket(user, s(f, "ticketId"));
  const status = z.enum(["New", "In Progress", "On Hold", "Closed"]).parse(s(f, "status") || t.status);
  const assigneeId = s(f, "assigneeId");
  await db.update(schema.tickets).set({ status, assigneeId: assigneeId === "none" ? null : assigneeId || t.assigneeId, closedAt: status === "Closed" ? (t.closedAt ?? new Date()) : null }).where(eq(schema.tickets.id, t.id));
  if (status !== t.status) await db.insert(schema.ticketMessages).values({ ticketId: t.id, kind: "system", authorName: "System", body: `${user.name} changed status to ${status}` });
  await audit(await actorFor(user), "ticket.update", "ticket", t.id, { status, assigneeId });
  revalidatePath("/support");
}

export async function escalateToMaverick(ticketId: string, confirmed = false): Promise<ActionState> {
  try {
    const user = await requirePermission("tickets.edit");
    const t = await loadTicket(user, ticketId);
    if (t.source === "maverick") return { error: "This ticket is already in Maverick’s help desk." };
    if (!t.merchantId) return { error: "Link the ticket to a merchant first." };
    const m = await db.query.merchants.findFirst({ where: eq(schema.merchants.id, t.merchantId) });
    if (!m?.connectionId || !m.externalId) return { error: "This merchant isn’t linked to a Maverick DBA yet (no processor id)." };
    const conn = await getConnection(m.connectionId);
    if (!conn?.enabled) return { error: "The merchant’s processor connection is disabled." };
    if (configOf(conn).confirmWrites && !confirmed) return { error: "CONFIRM" };
    const first = await db.query.ticketMessages.findFirst({ where: eq(schema.ticketMessages.ticketId, t.id) });
    const { externalId } = await adapterFor(conn).createTicket({ dbaExternalId: m.externalId, subject: t.subject, text: first?.body ?? t.subject, notifyMerchant: false });
    await db.update(schema.tickets).set({ source: "maverick", connectionId: conn.id, externalId }).where(eq(schema.tickets.id, t.id));
    await db.insert(schema.ticketMessages).values({ ticketId: t.id, kind: "system", authorName: "System", body: `Escalated to Maverick by ${user.name} · Maverick ticket ${externalId}` });
    await audit(await actorFor(user), "ticket.escalate", "ticket", t.id, { externalId });
    revalidatePath("/support");
    return { ok: `Escalated. Maverick ticket ${externalId} now mirrors this one.` };
  } catch (e) { return { error: (e as Error).message }; }
}
