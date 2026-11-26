/**
 * Everything the merchant portal reads. Every function takes the signed-in PortalUser and filters by its
 * merchantId; none accepts a merchant id from the caller. What merchants must never see (residuals, internal
 * notes, staff activity, underwriting, unmasked numbers) is simply never selected here.
 */
import "server-only";
import { and, asc, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { PortalUser } from "./dal";

const T = schema;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const monthStart = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
export const lastFour = (v?: string | null) => (v ? v.replace(/\D/g, "").slice(-4) : null);

/** Kinds a merchant can send from the portal. Labels are what both the merchant and staff see. */
export const REQUEST_KINDS = {
  support: { label: "Question or problem", category: "Support question" },
  equipment: { label: "Equipment and supplies", category: "Equipment & supplies" },
  account_change: { label: "Account change", category: "Account change" },
  trip: { label: "Trip request", category: "Travel" },
  dispute: { label: "Dispute help", category: "Dispute" },
} as const;
export type RequestKind = keyof typeof REQUEST_KINDS;

/** Merchant-facing wording for ticket states. */
export const REQUEST_STATUS: Record<string, { label: string; tone: "neutral" | "info" | "warn" | "done" }> = {
  New: { label: "Sent", tone: "neutral" },
  "In Progress": { label: "In progress", tone: "info" },
  "On Hold": { label: "On hold", tone: "warn" },
  Closed: { label: "Done", tone: "done" },
};

async function accountsOf(merchantId: string) {
  return db
    .select({ id: T.merchantAccounts.id, mid: T.merchantAccounts.mid, bankName: T.merchantAccounts.bankName, bankLast4: T.merchantAccounts.bankAccountLast4, status: T.merchantAccounts.status, openedAt: T.merchantAccounts.openedAt, channel: T.merchantAccounts.channel })
    .from(T.merchantAccounts)
    .where(eq(T.merchantAccounts.merchantId, merchantId))
    .orderBy(asc(T.merchantAccounts.openedAt));
}

const bankLabel = (a: { bankName: string | null; bankLast4: string | null }) =>
  a.bankLast4 ? `${a.bankName ?? "Your bank"} ••${a.bankLast4}` : a.bankName ?? "your bank";

// ── Totals ────────────────────────────────────────────────────────────────────
export type Summary = {
  hasAccounts: boolean;
  month: { label: string; sales: number; count: number; fees: number; deposited: number; prevSales: number };
  lastDeposit: { date: string; net: number; bank: string } | null;
  openDisputes: number;
  disputeRate90: number | null;
  onHold: number;
};

export async function getSummary(u: PortalUser): Promise<Summary> {
  const accts = await accountsOf(u.merchantId);
  const ids = accts.map((a) => a.id);
  const now = new Date();
  const m0 = monthStart(now);
  const p0 = monthStart(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15)));
  const sameDayPrev = new Date(Date.UTC(p0.getUTCFullYear(), p0.getUTCMonth(), now.getUTCDate()));
  const d90 = new Date(Date.now() - 90 * 86_400_000);
  const label = now.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
  const merchant = await db.query.merchants.findFirst({ where: eq(T.merchants.id, u.merchantId), columns: { reserveBalance: true } });
  const [cbOpen] = await db.select({ n: sql<number>`count(*)::int` }).from(T.chargebacks)
    .where(and(eq(T.chargebacks.merchantId, u.merchantId), eq(T.chargebacks.status, "Processed")));
  const empty: Summary = { hasAccounts: false, month: { label, sales: 0, count: 0, fees: 0, deposited: 0, prevSales: 0 }, lastDeposit: null, openDisputes: cbOpen?.n ?? 0, disputeRate90: null, onHold: merchant?.reserveBalance ?? 0 };
  if (!ids.length) return empty;

  const salesIn = (from: Date, to: Date) => db.select({ amt: sql<number>`coalesce(sum(${T.dailyMetrics.salesAmount}),0)::float`, n: sql<number>`coalesce(sum(${T.dailyMetrics.salesCount}),0)::int` })
    .from(T.dailyMetrics).where(and(inArray(T.dailyMetrics.merchantAccountId, ids), gte(T.dailyMetrics.day, iso(from)), lte(T.dailyMetrics.day, iso(to))));
  const [[cur], [prev], [pay], last, [cb90], [n90]] = await Promise.all([
    salesIn(m0, now),
    salesIn(p0, sameDayPrev),
    db.select({ fees: sql<number>`coalesce(sum(${T.payouts.fees}),0)::float`, net: sql<number>`coalesce(sum(${T.payouts.net}),0)::float` })
      .from(T.payouts).where(and(inArray(T.payouts.merchantAccountId, ids), gte(T.payouts.depositDate, iso(m0)))),
    db.select({ date: T.payouts.depositDate, net: T.payouts.net, acct: T.payouts.merchantAccountId }).from(T.payouts)
      .where(inArray(T.payouts.merchantAccountId, ids)).orderBy(desc(T.payouts.depositDate)).limit(1),
    db.select({ n: sql<number>`count(*)::int` }).from(T.chargebacks).where(and(eq(T.chargebacks.merchantId, u.merchantId), gte(T.chargebacks.receivedAt, iso(d90)))),
    db.select({ n: sql<number>`coalesce(sum(${T.dailyMetrics.salesCount}),0)::int` }).from(T.dailyMetrics).where(and(inArray(T.dailyMetrics.merchantAccountId, ids), gte(T.dailyMetrics.day, iso(d90)))),
  ]);
  const l = last[0];
  const lAcct = l ? accts.find((a) => a.id === l.acct) : undefined;
  return {
    hasAccounts: true,
    month: { label, sales: cur?.amt ?? 0, count: cur?.n ?? 0, fees: pay?.fees ?? 0, deposited: pay?.net ?? 0, prevSales: prev?.amt ?? 0 },
    lastDeposit: l ? { date: l.date, net: l.net, bank: lAcct ? bankLabel(lAcct) : "your bank" } : null,
    openDisputes: cbOpen?.n ?? 0,
    disputeRate90: n90 && n90.n > 0 ? ((cb90?.n ?? 0) / n90.n) * 100 : null,
    onHold: merchant?.reserveBalance ?? 0,
  };
}

// ── Feed ──────────────────────────────────────────────────────────────────────
export type FeedItem = {
  key: string;
  at: string; // ISO
  /** Set for events that only have a date (deposits, disputes): group by this, not by a time zone. */
  day?: string;
  kind: "deposit" | "dispute" | "dispute_result" | "request" | "reply" | "you_replied" | "request_done" | "terminal" | "account";
  title: string;
  detail: string;
  amount?: number;
  href?: string;
  /** The request this event belongs to, so the reply that just left "Needs you" can be found once. */
  ticketId?: string;
};
export type NeedsYou = { key: string; kind: "dispute" | "reply"; title: string; detail: string; action: string; href: string; due?: string; ticketId?: string };

export async function getFeed(u: PortalUser, limit = 30): Promise<{ needs: NeedsYou[]; items: FeedItem[] }> {
  const accts = await accountsOf(u.merchantId);
  const ids = accts.map((a) => a.id);
  const byId = new Map(accts.map((a) => [a.id, a]));
  const since = iso(new Date(Date.now() - 60 * 86_400_000));
  const today = iso(new Date());

  const [pays, cbs, tix, terms] = await Promise.all([
    ids.length ? db.select().from(T.payouts).where(and(inArray(T.payouts.merchantAccountId, ids), gte(T.payouts.depositDate, since))).orderBy(desc(T.payouts.depositDate)).limit(limit) : [],
    db.select().from(T.chargebacks).where(eq(T.chargebacks.merchantId, u.merchantId)).orderBy(desc(T.chargebacks.receivedAt)).limit(20),
    db.select().from(T.tickets).where(and(eq(T.tickets.merchantId, u.merchantId), eq(T.tickets.source, "portal"))).orderBy(desc(T.tickets.updatedAt)).limit(20),
    ids.length ? db.select({ id: T.terminals.id, name: T.terminals.name, model: T.terminals.model, createdAt: T.terminals.createdAt }).from(T.terminals).where(inArray(T.terminals.merchantAccountId, ids)).orderBy(desc(T.terminals.createdAt)).limit(5) : [],
  ]);
  const tixIds = tix.map((t) => t.id);
  const msgs = tixIds.length
    ? await db.select({ id: T.ticketMessages.id, ticketId: T.ticketMessages.ticketId, kind: T.ticketMessages.kind, author: T.ticketMessages.authorName, body: T.ticketMessages.body, at: T.ticketMessages.createdAt })
      .from(T.ticketMessages).where(and(inArray(T.ticketMessages.ticketId, tixIds), inArray(T.ticketMessages.kind, ["inbound", "outbound"]))).orderBy(asc(T.ticketMessages.createdAt))
    : [];

  const items: FeedItem[] = [];
  const needs: NeedsYou[] = [];

  for (const p of pays) {
    const a = byId.get(p.merchantAccountId);
    items.push({
      key: `p-${p.id}`, at: `${p.depositDate}T12:00:00Z`, day: p.depositDate, kind: "deposit",
      title: `Deposit sent to ${a ? bankLabel(a) : "your bank"}`,
      detail: [`Card sales ${fmtUsd(p.gross)}`, `fees ${fmtUsd(p.fees)}`, p.chargebacks ? `disputes ${fmtUsd(p.chargebacks)}` : null, p.batches > 1 ? `${p.batches} days of sales` : null].filter(Boolean).join(" · "),
      amount: p.net, href: "/portal/deposits",
    });
  }

  const helpOpenFor = new Set(tix.filter((t) => t.chargebackId && t.status !== "Closed").map((t) => t.chargebackId!));
  for (const c of cbs) {
    const card = [c.cardBrand, c.cardLast4 ? `••${c.cardLast4}` : null].filter(Boolean).join(" ");
    items.push({
      key: `c-${c.id}`, at: `${c.receivedAt}T12:00:00Z`, day: c.receivedAt, kind: "dispute",
      title: `A customer disputed a ${fmtUsd(c.amount)} charge`,
      detail: [card, c.reason].filter(Boolean).join(" · ") || "Dispute opened",
      href: "/portal/disputes",
    });
    if (c.status !== "Processed") {
      items.push({ key: `cr-${c.id}`, at: c.updatedAt.toISOString(), kind: "dispute_result",
        title: c.status === "Won" ? `Dispute decided in your favor: ${fmtUsd(c.amount)}` : `Dispute decided for the customer: ${fmtUsd(c.amount)}`,
        detail: `Case ${c.caseId}`, href: "/portal/disputes" });
    }
    const open = c.status === "Processed" && c.disputeStatus === "none" && (!c.respondBy || c.respondBy >= today);
    if (open && !helpOpenFor.has(c.id)) {
      needs.push({ key: `n-c-${c.id}`, kind: "dispute", title: `A customer disputed a ${fmtUsd(c.amount)} charge`,
        detail: [card, c.respondBy ? `respond by ${fmtDay(c.respondBy)}` : null].filter(Boolean).join(" · "),
        action: "Tell us what happened", href: `/portal/requests/new?kind=dispute&chargeback=${c.id}`, due: c.respondBy ?? undefined });
    }
  }

  for (const t of tix) {
    const label = REQUEST_KINDS[(t.portalKind ?? "support") as RequestKind]?.label ?? "Request";
    items.push({ key: `t-${t.id}`, at: t.createdAt.toISOString(), kind: "request", title: `You sent a request: ${t.subject}`, detail: `${label} · ${t.number}`, href: `/portal/requests/${t.id}` });
    const ms = msgs.filter((m) => m.ticketId === t.id);
    for (const m of ms.filter((x) => x.kind === "inbound").slice(1).slice(-3)) {
      items.push({ key: `m-${m.id}`, at: m.at.toISOString(), kind: "you_replied", title: `You replied about "${t.subject}"`, detail: `“${clip(m.body, 110)}”`, href: `/portal/requests/${t.id}`, ticketId: t.id });
    }
    for (const m of ms.filter((x) => x.kind === "outbound").slice(-3)) {
      items.push({ key: `m-${m.id}`, at: m.at.toISOString(), kind: "reply", title: `${firstName(m.author)} replied about ${t.subject.toLowerCase().startsWith("your") ? t.subject : `"${t.subject}"`}`,
        detail: `“${clip(m.body, 110)}”`, href: `/portal/requests/${t.id}` });
    }
    if (t.closedAt) items.push({ key: `td-${t.id}`, at: t.closedAt.toISOString(), kind: "request_done", title: `Request done: ${t.subject}`, detail: t.number, href: `/portal/requests/${t.id}` });
    const lastMsg = ms[ms.length - 1];
    if (t.status !== "Closed" && lastMsg?.kind === "outbound") {
      needs.push({ key: `n-t-${t.id}`, kind: "reply", title: `${firstName(lastMsg.author)} is waiting on your reply`, detail: `${t.subject}: “${clip(lastMsg.body, 140)}”`, action: "Reply", href: `/portal/requests/${t.id}`, ticketId: t.id });
    }
  }

  for (const tm of terms) items.push({ key: `tm-${tm.id}`, at: tm.createdAt.toISOString(), kind: "terminal", title: `${tm.name ?? tm.model ?? "A terminal"} was added to your account`, detail: tm.model ?? "Card terminal" });
  for (const a of accts) if (a.openedAt) items.push({ key: `a-${a.id}`, at: `${a.openedAt}T12:00:00Z`, day: a.openedAt, kind: "account", title: "Your merchant account opened", detail: `Account ending ${lastFour(a.mid)}` });

  items.sort((a, b) => b.at.localeCompare(a.at));
  needs.sort((a, b) => (a.due ?? "9").localeCompare(b.due ?? "9"));
  return { needs, items: items.slice(0, limit) };
}

// ── Deposits & reports ────────────────────────────────────────────────────────
export type DepositRow = { id: string; date: string; gross: number; fees: number; chargebacks: number; reserve: number; net: number; batches: number; bank: string; account: string };

export async function getDeposits(u: PortalUser, from: string, to: string): Promise<DepositRow[]> {
  const accts = await accountsOf(u.merchantId);
  if (!accts.length) return [];
  const byId = new Map(accts.map((a) => [a.id, a]));
  const rows = await db.select().from(T.payouts)
    .where(and(inArray(T.payouts.merchantAccountId, accts.map((a) => a.id)), gte(T.payouts.depositDate, from), lte(T.payouts.depositDate, to)))
    .orderBy(desc(T.payouts.depositDate));
  return rows.map((p) => {
    const a = byId.get(p.merchantAccountId)!;
    return { id: p.id, date: p.depositDate, gross: p.gross, fees: p.fees, chargebacks: p.chargebacks, reserve: p.reserve, net: p.net, batches: p.batches, bank: bankLabel(a), account: `••${lastFour(a.mid)}` };
  });
}

export async function getDailySales(u: PortalUser, from: string, to: string) {
  const accts = await accountsOf(u.merchantId);
  if (!accts.length) return [];
  return db.select({ day: T.dailyMetrics.day, amount: sql<number>`sum(${T.dailyMetrics.salesAmount})::float`, count: sql<number>`sum(${T.dailyMetrics.salesCount})::int` })
    .from(T.dailyMetrics)
    .where(and(inArray(T.dailyMetrics.merchantAccountId, accts.map((a) => a.id)), gte(T.dailyMetrics.day, from), lte(T.dailyMetrics.day, to)))
    .groupBy(T.dailyMetrics.day).orderBy(asc(T.dailyMetrics.day));
}

export type MonthRow = { month: string; sales: number; count: number; fees: number; deposited: number; disputes: number };

export async function getMonthly(u: PortalUser, months = 12): Promise<MonthRow[]> {
  const accts = await accountsOf(u.merchantId);
  if (!accts.length) return [];
  const ids = accts.map((a) => a.id);
  const now = new Date();
  const from = iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1)));
  const [sales, pays, cbs] = await Promise.all([
    db.select({ m: sql<string>`to_char(${T.dailyMetrics.day}::date, 'YYYY-MM')`, amt: sql<number>`sum(${T.dailyMetrics.salesAmount})::float`, n: sql<number>`sum(${T.dailyMetrics.salesCount})::int` })
      .from(T.dailyMetrics).where(and(inArray(T.dailyMetrics.merchantAccountId, ids), gte(T.dailyMetrics.day, from))).groupBy(sql`1`),
    db.select({ m: sql<string>`to_char(${T.payouts.depositDate}::date, 'YYYY-MM')`, fees: sql<number>`sum(${T.payouts.fees})::float`, net: sql<number>`sum(${T.payouts.net})::float` })
      .from(T.payouts).where(and(inArray(T.payouts.merchantAccountId, ids), gte(T.payouts.depositDate, from))).groupBy(sql`1`),
    db.select({ m: sql<string>`to_char(${T.chargebacks.receivedAt}::date, 'YYYY-MM')`, n: sql<number>`count(*)::int` })
      .from(T.chargebacks).where(and(eq(T.chargebacks.merchantId, u.merchantId), gte(T.chargebacks.receivedAt, from))).groupBy(sql`1`),
  ]);
  const out: MonthRow[] = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const m = iso(d).slice(0, 7);
    const s = sales.find((x) => x.m === m), p = pays.find((x) => x.m === m), c = cbs.find((x) => x.m === m);
    out.push({ month: m, sales: s?.amt ?? 0, count: s?.n ?? 0, fees: p?.fees ?? 0, deposited: p?.net ?? 0, disputes: c?.n ?? 0 });
  }
  return out;
}

// ── Disputes ──────────────────────────────────────────────────────────────────
export async function getDisputes(u: PortalUser) {
  const [rows, help] = await Promise.all([
    db.select({
      id: T.chargebacks.id, caseId: T.chargebacks.caseId, amount: T.chargebacks.amount, reason: T.chargebacks.reason, reasonCode: T.chargebacks.reasonCode,
      cardBrand: T.chargebacks.cardBrand, cardLast4: T.chargebacks.cardLast4, transactionDate: T.chargebacks.transactionDate, receivedAt: T.chargebacks.receivedAt,
      respondBy: T.chargebacks.respondBy, status: T.chargebacks.status, disputeStatus: T.chargebacks.disputeStatus,
    }).from(T.chargebacks).where(eq(T.chargebacks.merchantId, u.merchantId)).orderBy(desc(T.chargebacks.receivedAt)),
    db.select({ id: T.tickets.id, cb: T.tickets.chargebackId, status: T.tickets.status }).from(T.tickets)
      .where(and(eq(T.tickets.merchantId, u.merchantId), eq(T.tickets.source, "portal"), eq(T.tickets.portalKind, "dispute"))),
  ]);
  return rows.map((r) => ({ ...r, request: help.find((h) => h.cb === r.id) ?? null }));
}

/** A chargeback id from a URL is only honoured when it belongs to this merchant. */
export async function getOwnChargeback(u: PortalUser, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return (await db.query.chargebacks.findFirst({ where: and(eq(T.chargebacks.id, id), eq(T.chargebacks.merchantId, u.merchantId)) })) ?? null;
}

// ── Requests ──────────────────────────────────────────────────────────────────
export async function getRequests(u: PortalUser) {
  const rows = await db.select({
    id: T.tickets.id, number: T.tickets.number, subject: T.tickets.subject, kind: T.tickets.portalKind, status: T.tickets.status,
    createdAt: T.tickets.createdAt, updatedAt: T.tickets.updatedAt, assignee: T.users.name,
  }).from(T.tickets).leftJoin(T.users, eq(T.tickets.assigneeId, T.users.id))
    .where(and(eq(T.tickets.merchantId, u.merchantId), eq(T.tickets.source, "portal"))).orderBy(desc(T.tickets.updatedAt));
  const ids = rows.map((r) => r.id);
  const last = ids.length
    ? await db.selectDistinctOn([T.ticketMessages.ticketId], { ticketId: T.ticketMessages.ticketId, kind: T.ticketMessages.kind, author: T.ticketMessages.authorName, at: T.ticketMessages.createdAt })
      .from(T.ticketMessages).where(and(inArray(T.ticketMessages.ticketId, ids), inArray(T.ticketMessages.kind, ["inbound", "outbound"])))
      .orderBy(T.ticketMessages.ticketId, desc(T.ticketMessages.createdAt))
    : [];
  return rows.map((r) => {
    const l = last.find((x) => x.ticketId === r.id);
    return { ...r, waitingOnYou: r.status !== "Closed" && l?.kind === "outbound", lastAuthor: l?.author ?? null, lastAt: l?.at ?? r.createdAt };
  });
}

/** One request with its merchant-visible thread. Internal notes and system messages are never selected. */
export async function getRequest(u: PortalUser, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const t = await db.query.tickets.findFirst({ where: and(eq(T.tickets.id, id), eq(T.tickets.merchantId, u.merchantId), eq(T.tickets.source, "portal")) });
  if (!t) return null;
  const [messages, assignee] = await Promise.all([
    db.select({ id: T.ticketMessages.id, kind: T.ticketMessages.kind, author: T.ticketMessages.authorName, body: T.ticketMessages.body, at: T.ticketMessages.createdAt })
      .from(T.ticketMessages).where(and(eq(T.ticketMessages.ticketId, t.id), inArray(T.ticketMessages.kind, ["inbound", "outbound"]))).orderBy(asc(T.ticketMessages.createdAt)),
    t.assigneeId ? db.query.users.findFirst({ where: eq(T.users.id, t.assigneeId), columns: { name: true } }) : null,
  ]);
  return {
    id: t.id, number: t.number, subject: t.subject, kind: (t.portalKind ?? "support") as RequestKind, status: t.status,
    details: (t.portalDetails ?? {}) as Record<string, string>, hasSensitive: Boolean(t.portalSensitiveEnc),
    createdAt: t.createdAt, closedAt: t.closedAt, assignee: assignee?.name ?? null, messages,
  };
}

// ── Account ───────────────────────────────────────────────────────────────────
export async function getAccount(u: PortalUser) {
  const m = await db.query.merchants.findFirst({ where: eq(T.merchants.id, u.merchantId) });
  if (!m) return null;
  const [le, accts, contacts, owner, users] = await Promise.all([
    m.legalEntityId ? db.query.legalEntities.findFirst({ where: eq(T.legalEntities.id, m.legalEntityId), columns: { legalName: true, entityType: true, einLast4: true } }) : null,
    accountsOf(m.id),
    db.select({ id: T.contacts.id, first: T.contacts.firstName, last: T.contacts.lastName, title: T.contacts.title, email: T.contacts.email, phone: T.contacts.phone, labels: T.contacts.labels })
      .from(T.contacts).where(eq(T.contacts.merchantId, m.id)).orderBy(asc(T.contacts.lastName)),
    m.ownerId ? db.query.users.findFirst({ where: eq(T.users.id, m.ownerId), columns: { name: true, email: true } }) : null,
    db.select({ id: T.portalUsers.id, name: T.portalUsers.name, email: T.portalUsers.email, status: T.portalUsers.status, lastLoginAt: T.portalUsers.lastLoginAt })
      .from(T.portalUsers).where(and(eq(T.portalUsers.merchantId, m.id), ne(T.portalUsers.status, "disabled"))),
  ]);
  const terms = accts.length
    ? await db.select({ id: T.terminals.id, tid: T.terminals.tid, name: T.terminals.name, model: T.terminals.model, location: T.terminals.location, status: T.terminals.status, acct: T.terminals.merchantAccountId })
      .from(T.terminals).where(inArray(T.terminals.merchantAccountId, accts.map((a) => a.id))).orderBy(asc(T.terminals.name))
    : [];
  return {
    business: {
      dbaName: m.dbaName, legalName: le?.legalName ?? null, entityType: le?.entityType ?? null, einLast4: le?.einLast4 ?? null,
      industry: m.industry, mcc: m.mcc, address: [m.street, [m.city, m.state].filter(Boolean).join(", "), m.zip].filter(Boolean).join(" · "),
      phone: m.csPhone, email: m.csEmail, website: m.website, liveSince: m.liveSince, status: m.status,
    },
    accounts: accts.map((a) => ({ id: a.id, mid: `•••• ${lastFour(a.mid)}`, status: a.status, openedAt: a.openedAt, bank: bankLabel(a), channel: a.channel,
      terminals: terms.filter((t) => t.acct === a.id).map((t) => ({ id: t.id, name: t.name ?? t.model ?? "Terminal", model: t.model, location: t.location, status: t.status, tid: `••${lastFour(t.tid)}` })) })),
    contacts: contacts.map((c) => ({ id: c.id, name: `${c.first} ${c.last}`, title: c.title, email: c.email, phone: c.phone, labels: c.labels })),
    manager: owner ? { name: owner.name, email: owner.email } : null,
    logins: users,
  };
}

// ── small helpers ─────────────────────────────────────────────────────────────
export const fmtUsd = (n: number) => (n < 0 ? "−$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const firstName = (n: string | null) => (n ? n.split(/\s+/)[0]! : "We");
const clip = (s: string, n: number) => { const t = s.replace(/\s+/g, " ").trim(); return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t; };
