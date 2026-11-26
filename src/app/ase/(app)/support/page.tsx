import Link from "next/link";
import { and, asc, desc, eq, inArray, isNull, lte, ne, or, sql as dsql, type SQL } from "drizzle-orm";
import { Download, MessageCircle, Plus } from "lucide-react";
import { db, schema } from "@/db";
import { requirePage, scopeOwnerIds, initialsOf } from "@/lib/dal";
import { can } from "@/lib/rbac";
import { getSetting } from "@/lib/settings";
import { daysUntil, fmtDate, fmtDateTime, minutesLabel, relTime, usd } from "@/lib/format";
import { Avatar, Empty, Pill, Proc } from "@/components/ui";
import { Composer, EscalateButton } from "./Client";
import { updateTicket } from "./actions";
import { NewTicketSheet } from "./NewTicketSheet";
import { Reveal } from "../merchants/[id]/Reveal";
import { Fragment } from "react";

const SRC_LABEL: Record<string, string> = { internal: "Internal", maverick: "Maverick", portal: "Portal" };

export const metadata = { title: "Support" };

export default async function SupportPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePage("tickets.view");
  const sp = await searchParams;
  const owners = await scopeOwnerIds(user);
  const g = await getSetting("general");
  const mScope = owners ? inArray(schema.merchants.ownerId, owners) : undefined;
  const risk = and(ne(schema.tickets.status, "Closed"), isNull(schema.tickets.firstResponseAt), lte(schema.tickets.slaDueAt, new Date(Date.now() + g.ticketSlaWarnMinutes * 60_000)));
  const f = sp.f ?? (user.role === "support" ? "mine" : "open");
  const filt: Record<string, SQL | undefined> = {
    mine: and(eq(schema.tickets.assigneeId, user.id), ne(schema.tickets.status, "Closed")),
    unassigned: and(isNull(schema.tickets.assigneeId), ne(schema.tickets.status, "Closed")),
    sla: risk, open: ne(schema.tickets.status, "Closed"), closed: eq(schema.tickets.status, "Closed"),
  };
  const srcF = sp.src === "internal" || sp.src === "maverick" || sp.src === "portal" ? eq(schema.tickets.source, sp.src) : undefined;
  const list = await db.select({ t: schema.tickets, dba: schema.merchants.dbaName, who: schema.users.name, color: schema.users.avatarColor, photo: schema.users.avatarKey,
    preview: dsql<string>`(select body from ticket_messages m where m.ticket_id = "tickets"."id" and m.kind <> 'system' order by m.created_at desc limit 1)` })
    .from(schema.tickets).leftJoin(schema.merchants, eq(schema.tickets.merchantId, schema.merchants.id)).leftJoin(schema.users, eq(schema.tickets.assigneeId, schema.users.id))
    .where(and(mScope, filt[f] ?? filt.open, srcF)).orderBy(f === "sla" ? asc(schema.tickets.slaDueAt) : desc(schema.tickets.updatedAt)).limit(100);
  const cnt = async (w?: SQL) => (await db.select({ n: dsql<number>`count(*)::int` }).from(schema.tickets).leftJoin(schema.merchants, eq(schema.tickets.merchantId, schema.merchants.id)).where(and(mScope, w)))[0]!.n;
  const [cMine, cUn, cSla, cOpen] = await Promise.all([cnt(filt.mine), cnt(filt.unassigned), cnt(risk), cnt(filt.open)]);
  const selId = sp.t ?? list[0]?.t.id;
  const cur = selId ? (await db.select({ t: schema.tickets, who: schema.users.name }).from(schema.tickets).leftJoin(schema.users, eq(schema.tickets.assigneeId, schema.users.id)).leftJoin(schema.merchants, eq(schema.tickets.merchantId, schema.merchants.id)).where(and(eq(schema.tickets.id, selId), mScope)))[0] : null;
  const msgs = cur ? await db.select().from(schema.ticketMessages).where(eq(schema.ticketMessages.ticketId, cur.t.id)).orderBy(asc(schema.ticketMessages.createdAt)) : [];
  const authorIds = [...new Set(msgs.map((mm) => mm.authorUserId).filter((x): x is string => !!x))];
  const authorPhotos = new Map(authorIds.length ? (await db.select({ id: schema.users.id, k: schema.users.avatarKey }).from(schema.users).where(inArray(schema.users.id, authorIds))).map((u) => [u.id, u.k]) : []);
  const m = cur?.t.merchantId ? await db.query.merchants.findFirst({ where: eq(schema.merchants.id, cur.t.merchantId) }) : null;
  const [acct, mOwner, cbs, vol, recentTix, terms] = m ? await Promise.all([
    db.query.merchantAccounts.findFirst({ where: eq(schema.merchantAccounts.merchantId, m.id) }),
    m.ownerId ? db.query.users.findFirst({ where: eq(schema.users.id, m.ownerId) }) : null,
    db.select().from(schema.chargebacks).where(and(eq(schema.chargebacks.merchantId, m.id), eq(schema.chargebacks.status, "Processed"))),
    db.select({ day: schema.dailyMetrics.day, amt: schema.dailyMetrics.salesAmount }).from(schema.dailyMetrics).innerJoin(schema.merchantAccounts, eq(schema.dailyMetrics.merchantAccountId, schema.merchantAccounts.id))
      .where(and(eq(schema.merchantAccounts.merchantId, m.id), dsql`${schema.dailyMetrics.day} >= ${new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)}`)).orderBy(asc(schema.dailyMetrics.day)),
    db.select().from(schema.tickets).where(and(eq(schema.tickets.merchantId, m.id), ne(schema.tickets.id, cur!.t.id))).orderBy(desc(schema.tickets.createdAt)).limit(3),
    db.select({ n: dsql<number>`count(*)::int` }).from(schema.terminals).innerJoin(schema.merchantAccounts, eq(schema.terminals.merchantAccountId, schema.merchantAccounts.id)).where(eq(schema.merchantAccounts.merchantId, m.id)),
  ]) : [null, null, [], [], [], [{ n: 0 }]];
  const contact = m ? await db.query.contacts.findFirst({ where: eq(schema.contacts.merchantId, m.id) }) : null;
  const agents = await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(and(inArray(schema.users.role, ["support", "onboarding", "manager", "admin"]), eq(schema.users.status, "active"))).orderBy(asc(schema.users.name));
  const canEdit = can(user.role, "tickets.edit");
  const vol30 = vol.reduce((a, r) => a + r.amt, 0);
  const qs = (x: Record<string, string | undefined>) => `?${new URLSearchParams(Object.entries({ ...sp, ...x }).filter(([, v]) => v) as [string, string][])}`;
  const sla = (t: typeof schema.tickets.$inferSelect) => {
    if (t.status === "Closed") return { t: "Resolved", c: "sm subtle" };
    if (t.firstResponseAt) return { t: t.status === "On Hold" ? "Paused" : "Responded", c: "sm subtle" };
    if (!t.slaDueAt) return { t: "", c: "" };
    const mins = Math.round((t.slaDueAt.getTime() - Date.now()) / 60000);
    return mins < 0 ? { t: `Breached ${minutesLabel(mins)}`, c: "sm tx-red" } : mins <= g.ticketSlaWarnMinutes ? { t: `At risk · ${minutesLabel(mins)}`, c: "sm tx-amber" } : { t: `Due in ${minutesLabel(mins)}`, c: "sm subtle" };
  };
  const templates = (await getSetting("templates")).templates;
  void or;

  return (
    <div className={`inbox ${sp.t ? "has-sel" : ""}`} style={{ minHeight: "calc(100dvh - 52px)" }}>
      <section className="ilist" aria-label="Tickets">
        <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="row"><h1 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Support</h1><span className="sp" />
            {can(user.role, "export") && <a className="btn sm" href="/api/export/tickets"><Download size={14} aria-hidden="true" />CSV</a>}
            {canEdit && <Link className="btn sm pri" href={qs({ new: "1" })}><Plus size={14} aria-hidden="true" />Ticket</Link>}</div>
          <div className="views" role="tablist" aria-label="Ticket views">
            {[["mine", "My tickets", cMine], ["unassigned", "Unassigned", cUn], ["sla", "SLA at risk", cSla], ["open", "All open", cOpen], ["closed", "Closed", null]].map(([k, l, n]) => (
              <Link key={k as string} href={qs({ f: k as string, t: undefined })} className={`vt ${f === k ? "on" : ""}`} role="tab" aria-selected={f === k} style={{ padding: "0 8px" }}>{l}{n !== null && <span className="c">{n}</span>}</Link>
            ))}
          </div>
          <div className="row"><span className="subtle sm">Source</span>
            <div className="seg" role="group" aria-label="Source filter">
              {[["", "All"], ["internal", "Internal"], ["portal", "Portal"], ["maverick", "Maverick"]].map(([k, l]) => <Link key={k} href={qs({ src: k || undefined, t: undefined })} className={`btn ghost sm`} style={(sp.src ?? "") === k ? { background: "var(--surface)", color: "var(--ink)", boxShadow: "0 1px 2px rgba(16,24,40,.12)", height: 24 } : { height: 24 }} aria-current={(sp.src ?? "") === k}>{l}</Link>)}
            </div>
          </div>
        </div>
        <div role="listbox" aria-label="Ticket list">
          {list.length === 0 && <Empty icon={MessageCircle} title="Nothing here">No tickets match this view.</Empty>}
          {list.map((r) => { const s = sla(r.t); return (
            <Link key={r.t.id} href={qs({ t: r.t.id })} className={`ti ${r.t.id === selId ? "on" : ""}`} role="option" aria-selected={r.t.id === selId} scroll={false}>
              <span className="r1"><span className="mono subtle">{r.t.number}</span><span className={`tag ${r.t.source === "maverick" ? "acc" : ""}`}>{SRC_LABEL[r.t.source]}</span><span className="sp" /><span className={s.c}>{s.t}</span></span>
              <span className="subj">{r.t.subject}</span>
              <span className="r1"><span className="pv" style={{ flex: 1 }}>{r.dba ?? "No merchant"} · {r.preview?.slice(0, 80)}</span></span>
              <span className="r1"><Pill status={r.t.status} /><span className="sp" />{r.who ? <Avatar initials={initialsOf(r.who)} color={r.color} avatarKey={r.photo} title={r.who} /> : <span className="subtle sm">Unassigned</span>}<span className="subtle sm">{relTime(r.t.updatedAt)}</span></span>
            </Link>
          ); })}
        </div>
      </section>

      <section className="thread" aria-label="Conversation">
        {!cur ? <Empty icon={MessageCircle} title="Select a ticket">Pick a ticket on the left to read and reply.</Empty> : (
          <>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--line)", background: "var(--surface)", display: "flex", flexDirection: "column", gap: 8 }}>
              <div className="row w" style={{ gap: 8 }}>
                <Link className="btn ghost sm mob-only" href={qs({ t: undefined })} scroll={false}>← Tickets</Link>
                <span className="mono subtle">{cur.t.number}</span><span className={`tag ${cur.t.source === "maverick" ? "acc" : ""}`}>{SRC_LABEL[cur.t.source]}</span>
                {cur.t.source === "maverick" && <span className="subtle sm">Mirrored from Maverick help desk{cur.t.externalId ? ` · ${cur.t.externalId}` : ""}</span>}
                {cur.t.source === "portal" && <span className="subtle sm">Sent from the merchant portal. The merchant sees replies, never internal notes.</span>}
                <span className="sp" />
                {canEdit && (
                  <form action={updateTicket} className="row" style={{ gap: 6 }}>
                    <input type="hidden" name="ticketId" value={cur.t.id} />
                    <select name="status" className="inp" defaultValue={cur.t.status} aria-label="Status" style={{ height: 28 }}>{["New", "In Progress", "On Hold", "Closed"].map((x) => <option key={x}>{x}</option>)}</select>
                    <select name="assigneeId" className="inp" defaultValue={cur.t.assigneeId ?? "none"} aria-label="Assignee" style={{ height: 28 }}><option value="none">Unassigned</option>{agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
                    <button className="btn sm" type="submit">Update</button>
                  </form>
                )}
                {canEdit && cur.t.source !== "maverick" && <EscalateButton ticketId={cur.t.id} />}
              </div>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, letterSpacing: "-.01em" }}>{cur.t.subject}</h2>
              <div className="row w muted sm" style={{ gap: 8 }}><Pill status={cur.t.status} /><span>Category: {cur.t.category ?? "—"}</span><span aria-hidden="true">·</span><span>Priority: {cur.t.priority}</span><span aria-hidden="true">·</span><span className={sla(cur.t).c}>SLA: {sla(cur.t).t || "—"}</span><span aria-hidden="true">·</span><span>Opened {fmtDateTime(cur.t.createdAt)}</span></div>
            </div>
            <div style={{ flex: 1, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12, overflow: "auto" }}>
              {cur.t.source === "portal" && (Object.keys((cur.t.portalDetails ?? {}) as object).length > 0 || cur.t.portalSensitiveEnc) && (
                <div style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "10px 12px", background: "var(--sunken)" }}>
                  <dl className="dl">
                    {Object.entries((cur.t.portalDetails ?? {}) as Record<string, string>).map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}
                    {cur.t.portalSensitiveEnc && <><dt>New bank details</dt><dd><Reveal kind="request_bank" id={cur.t.id} masked="Encrypted" allowed={can(user.role, "sensitive.reveal")} /></dd></>}
                  </dl>
                  {cur.t.chargebackId && <p className="sm" style={{ margin: "8px 0 0" }}><Link href="/ase/chargebacks">Open the chargeback</Link></p>}
                </div>
              )}
              {msgs.map((mm) => mm.kind === "system" ? (
                <div key={mm.id} className="msg sysm"><span className="pm" aria-hidden="true">{mm.authorName === "Maverick" ? "M" : "•"}</span><span style={{ flex: 1 }}>{mm.body}</span><span className="subtle">{fmtDateTime(mm.createdAt)}</span></div>
              ) : (
                <article key={mm.id} className={`msg ${mm.kind === "outbound" ? "out" : ""} ${mm.kind === "internal" ? "note-y" : ""}`}>
                  <div className="row"><Avatar initials={initialsOf(mm.authorName ?? "?")} color={mm.authorUserId ? "av-8" : "av-3"} avatarKey={mm.authorUserId ? authorPhotos.get(mm.authorUserId) : null} /><b style={{ fontWeight: 600 }}>{mm.authorName}</b>
                    <span className="subtle sm">{mm.kind === "inbound" ? (cur.t.source === "maverick" ? "via Maverick" : cur.t.source === "portal" ? "via portal" : "via email") : mm.kind === "outbound" ? (mm.notifyMerchant ? "replied · merchant notified" : "replied") : ""}</span>
                    {mm.kind === "internal" && <span className="tag" style={{ background: "var(--note-line)", borderColor: "transparent", color: "var(--ink)" }}>Internal note</span>}
                    <span className="sp" /><span className="subtle sm">{fmtDateTime(mm.createdAt)}</span></div>
                  <div style={{ whiteSpace: "pre-line" }}>{mm.body}</div>
                </article>
              ))}
            </div>
            {canEdit && (
              <div style={{ padding: "12px 20px 16px" }}>
                <Composer ticketId={cur.t.id} to={cur.t.contactEmail ?? contact?.email ?? null} maverick={cur.t.source === "maverick"}
                  templates={templates.map((t) => ({ ...t, body: t.body.replace(/\{\{contact\}\}/g, (cur.t.contactName ?? contact?.firstName ?? "there").split(" ")[0]!) }))} />
              </div>
            )}
          </>
        )}
      </section>

      <aside className="ctx" aria-label="Merchant context">
        {!m ? <div className="subtle sm">No merchant linked to this ticket.</div> : (
          <>
            <div>
              <div className="sec-t">Merchant</div>
              <Link href={`/ase/merchants/${m.id}`} style={{ fontWeight: 600, fontSize: 14, color: "var(--ink)", textDecoration: "none" }}>{m.dbaName}</Link>
              <div className="row w" style={{ gap: 6, marginTop: 8 }}><Pill status={m.status === "live" ? "Live" : m.status} label={m.status[0]!.toUpperCase() + m.status.slice(1)} />{acct && <Proc />}</div>
            </div>
            <dl className="dl" style={{ gridTemplateColumns: "90px 1fr" }}>
              <dt>MID</dt><dd className="mono">{acct?.mid ?? "—"}</dd>
              <dt>MCC</dt><dd>{m.mcc ? <><span className="mono">{m.mcc}</span> {m.industry}</> : "—"}</dd>
              <dt>Agent</dt><dd>{mOwner?.name ?? "—"}</dd>
              <dt>Contact</dt><dd>{contact ? `${contact.firstName} ${contact.lastName}` : "—"}<br /><span className="num muted">{contact?.phone ?? m.csPhone}</span></dd>
            </dl>
            <div className="card" style={{ padding: 12 }}>
              <div className="subtle sm">30-day volume</div>
              <div className="num" style={{ fontSize: 17, fontWeight: 600 }}>{usd(vol30)}</div>
              {vol.length > 1 && (() => {
                const max = Math.max(...vol.map((v) => v.amt), 1);
                const pts = vol.map((v, i) => `${(i / (vol.length - 1)) * 240},${40 - (v.amt / max) * 36}`).join(" ");
                return <svg viewBox="0 0 240 44" role="img" aria-label="Daily volume, last 30 days" style={{ width: "100%", height: 44, marginTop: 6 }}><polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="2" /></svg>;
              })()}
            </div>
            <div>
              <div className="row" style={{ marginBottom: 6 }}><div className="sec-t" style={{ margin: 0 }}>Open chargebacks</div><span className="sp" /><span className="ct">{cbs.length}</span></div>
              {cbs.length === 0 && <div className="subtle sm">None open</div>}
              {cbs.map((c) => { const d = daysUntil(c.respondBy); return (
                <Link key={c.id} className="att" href={`/ase/chargebacks?cb=${c.id}`} style={{ padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 8, gridTemplateColumns: "minmax(0,1fr) auto" }}>
                  <span style={{ minWidth: 0 }}><span className="t1 num" style={{ display: "block" }}>{c.caseId} · {usd(c.amount)}</span><span className="t2" style={{ display: "block" }}>{c.reason}</span></span>
                  <span className={d !== null && d < 3 ? "pill t-red" : "sm subtle"}>{d === null ? "" : d <= 0 ? "Due today" : `${d} days`}</span>
                </Link>
              ); })}
            </div>
            <div><div className="sec-t">Terminals</div><div className="sm muted">{terms[0]?.n ?? 0} terminal{terms[0]?.n === 1 ? "" : "s"}</div></div>
            <div><div className="sec-t">Recent tickets</div>
              {recentTix.length === 0 && <div className="subtle sm">None</div>}
              <div className="sm" style={{ display: "flex", flexDirection: "column", gap: 6 }}>{recentTix.map((t) => <Link key={t.id} href={`/ase/support?t=${t.id}`} style={{ color: "var(--ink)", textDecoration: "none" }}><span className="mono subtle">{t.number}</span> {t.subject} · <span className="subtle">{t.status}</span></Link>)}</div>
            </div>
            <div className="subtle sm">Opened {fmtDate(cur?.t.createdAt)}</div>
          </>
        )}
      </aside>
      {sp.new && canEdit && <NewTicketSheet closeHref={qs({ new: undefined })} merchantId={sp.merchant} />}
    </div>
  );
}
