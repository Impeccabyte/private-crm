"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { encrypt } from "@/lib/crypto";
import { sendMail } from "@/lib/mail";
import { getSetting } from "@/lib/settings";
import { hashPassword, passwordProblems, verifyPassword } from "@/lib/password";
import { portalActor, requirePortalAction } from "@/lib/portal/dal";
import { getOwnChargeback, REQUEST_KINDS, type RequestKind } from "@/lib/portal/data";
import { destroyAllPortalSessions } from "@/lib/portal/session";

export type RequestState = { error?: string; fieldErrors?: Record<string, string>; values?: Record<string, string>; ok?: string };

const s = (f: FormData, k: string, max = 2000) => String(f.get(k) ?? "").trim().slice(0, max);

async function nextNumber() {
  const [row] = (await db.execute(sql`select coalesce(max(nullif(regexp_replace(number, '\\D', '', 'g'), '')::int), 3000) + 1 as next from tickets where number like 'TCK-%'`)) as unknown as { next: number }[];
  return `TCK-${row!.next}`;
}

const isRedirect = (e: unknown) => (e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT");

/** One form handles every request kind; each kind asks for what staff need to act without a back-and-forth. */
export async function createRequest(_p: RequestState, f: FormData): Promise<RequestState> {
  const values: Record<string, string> = {};
  for (const [k, v] of f.entries()) if (typeof v === "string" && !["account", "routing"].includes(k)) values[k] = v;
  try {
    const u = await requirePortalAction();
    const kind = s(f, "kind") as RequestKind;
    if (!(kind in REQUEST_KINDS)) return { error: "Choose what you need help with.", values };
    const fe: Record<string, string> = {};
    const details: Record<string, string> = {};
    let subject = s(f, "subject", 140);
    const message = s(f, "message", 5000);
    let sensitive: Record<string, string> | null = null;
    let chargebackId: string | null = null;

    if (kind === "support") {
      if (subject.length < 3) fe.subject = "Give it a short title, like “Deposit missing for Nov 22”.";
      if (message.length < 5) fe.message = "Tell us what's going on.";
    }
    if (kind === "equipment") {
      const what = s(f, "what", 80);
      const qty = Number(s(f, "qty") || "1");
      if (!what) fe.what = "Choose what you need.";
      if (!Number.isInteger(qty) || qty < 1 || qty > 50) fe.qty = "Enter a number from 1 to 50.";
      Object.assign(details, { "What you need": what, "How many": String(qty), "Ship to": s(f, "shipTo", 300) || "The business address on file" });
      subject = `${what}${qty > 1 ? ` (${qty})` : ""}`;
    }
    if (kind === "account_change") {
      const what = s(f, "what", 80);
      if (!what) fe.what = "Choose what you'd like to change.";
      if (message.length < 5) fe.message = "Tell us what should change.";
      details["What to change"] = what;
      subject = `Change: ${what || "account details"}`;
      if (what === "Deposit bank account") {
        const bank = s(f, "bankName", 80), routing = s(f, "routing", 20).replace(/\D/g, ""), account = s(f, "account", 30).replace(/\D/g, "");
        if (!bank) fe.bankName = "Enter the bank's name.";
        if (!/^\d{9}$/.test(routing)) fe.routing = "A routing number is 9 digits.";
        if (!/^\d{4,17}$/.test(account)) fe.account = "Enter the account number, digits only.";
        details["New bank"] = bank;
        details["New account ends in"] = account.slice(-4);
        sensitive = { bankName: bank, routing, account };
      }
    }
    if (kind === "trip") {
      const dest = s(f, "destination", 120), start = s(f, "start", 10), end = s(f, "end", 10), people = s(f, "travelers", 3);
      if (!dest) fe.destination = "Where would you like to go?";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) fe.start = "Choose a check-in date.";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(end) || end < start) fe.end = "Choose a check-out date after check-in.";
      Object.assign(details, { Destination: dest, "Check-in": start, "Check-out": end, Travelers: people || "Not given", "Flexible dates": f.get("flexible") === "on" ? "Yes" : "No" });
      subject = `Trip to ${dest || "somewhere new"}`;
    }
    if (kind === "dispute") {
      const cb = await getOwnChargeback(u, s(f, "chargeback", 40));
      if (!cb) return { error: "We couldn't find that dispute on your account.", values };
      chargebackId = cb.id;
      if (message.length < 5) fe.message = "Tell us what happened with this sale.";
      Object.assign(details, { Dispute: `Case ${cb.caseId}`, Amount: `$${cb.amount.toFixed(2)}`, "Has proof of the sale": f.get("hasProof") === "on" ? "Yes" : "Not sure" });
      subject = `Dispute help: case ${cb.caseId}`;
    }
    if (Object.keys(fe).length) return { fieldErrors: fe, values };

    const g = await getSetting("general");
    const merchant = await db.query.merchants.findFirst({ where: eq(schema.merchants.id, u.merchantId), columns: { ownerId: true, dbaName: true } });
    const [t] = await db.insert(schema.tickets).values({
      number: await nextNumber(), merchantId: u.merchantId, subject: subject.slice(0, 140), category: REQUEST_KINDS[kind].category, priority: kind === "dispute" ? "high" : "normal",
      source: "portal", assigneeId: merchant?.ownerId ?? null, contactName: u.name, contactEmail: u.email,
      slaDueAt: new Date(Date.now() + g.ticketFirstResponseMinutes * 60_000),
      portalKind: kind, portalDetails: details, portalSensitiveEnc: sensitive ? encrypt(JSON.stringify(sensitive)) : null, portalUserId: u.id, chargebackId,
    }).returning({ id: schema.tickets.id, number: schema.tickets.number });
    await db.insert(schema.ticketMessages).values({ ticketId: t!.id, kind: "inbound", authorName: u.name, authorPortalUserId: u.id, body: message || Object.entries(details).map(([k, v]) => `${k}: ${v}`).join("\n") || subject });
    await audit(await portalActor(u), "portal.request.create", "ticket", t!.id, { kind });

    if (merchant?.ownerId) {
      const owner = await db.query.users.findFirst({ where: eq(schema.users.id, merchant.ownerId), columns: { email: true } });
      const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
      if (owner) await sendMail(owner.email, `New request from ${merchant.dbaName}: ${subject} [${t!.number}]`,
        `${u.name} sent a ${REQUEST_KINDS[kind].label.toLowerCase()} request from the merchant portal.\n\n${base}/support?t=${t!.id}\n`);
    }
    revalidatePath("/portal", "layout");
    redirect(`/portal/requests/${t!.id}?sent=1`);
  } catch (e) {
    if (isRedirect(e)) throw e;
    return { error: e instanceof z.ZodError ? e.issues[0]!.message : (e as Error).message, values };
  }
}

export async function replyToRequest(_p: RequestState, f: FormData): Promise<RequestState> {
  try {
    const u = await requirePortalAction();
    const id = s(f, "ticketId", 40);
    const body = s(f, "body", 5000);
    if (body.length < 1) return { fieldErrors: { body: "Write your reply first." } };
    const t = await db.query.tickets.findFirst({ where: and(eq(schema.tickets.id, id), eq(schema.tickets.merchantId, u.merchantId), eq(schema.tickets.source, "portal")) });
    if (!t) return { error: "We couldn't find that request on your account." };
    await db.insert(schema.ticketMessages).values({ ticketId: t.id, kind: "inbound", authorName: u.name, authorPortalUserId: u.id, body });
    await db.update(schema.tickets).set({ status: t.status === "Closed" || t.status === "On Hold" ? "In Progress" : t.status, closedAt: null }).where(eq(schema.tickets.id, t.id));
    await audit(await portalActor(u), "portal.request.reply", "ticket", t.id);
    revalidatePath(`/portal/requests/${t.id}`);
    revalidatePath("/portal", "layout");
    if (s(f, "from", 10) === "home") redirect(`/portal?settled=${t.id}`);
    return { ok: "Sent. We'll reply here and by email." };
  } catch (e) {
    if (isRedirect(e)) throw e;
    return { error: (e as Error).message };
  }
}

export async function changePortalPassword(_p: RequestState, f: FormData): Promise<RequestState> {
  try {
    const u = await requirePortalAction();
    const current = String(f.get("current") ?? ""), next = String(f.get("next") ?? ""), confirm = String(f.get("confirm") ?? "");
    const row = await db.query.portalUsers.findFirst({ where: eq(schema.portalUsers.id, u.id) });
    if (!row || !(await verifyPassword(current, row.passwordHash))) return { fieldErrors: { current: "That isn't your current password." } };
    const sec = await getSetting("security");
    const problem = passwordProblems(next, sec.passwordMinLength);
    if (problem) return { fieldErrors: { next: problem } };
    if (next !== confirm) return { fieldErrors: { confirm: "The two passwords don't match." } };
    await db.update(schema.portalUsers).set({ passwordHash: await hashPassword(next) }).where(eq(schema.portalUsers.id, u.id));
    await destroyAllPortalSessions(u.id);
    await audit(await portalActor(u), "portal.auth.password_changed", "portal_user", u.id);
  } catch (e) {
    if (isRedirect(e)) throw e;
    return { error: (e as Error).message };
  }
  redirect("/portal/login?set=1");
}
