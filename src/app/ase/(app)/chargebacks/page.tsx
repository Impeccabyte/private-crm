import Link from "next/link";
import { and, asc, desc, eq, gte, inArray, lte, sql as dsql, type SQL } from "drizzle-orm";
import { AlertTriangle, Clock, Download, RotateCcw } from "lucide-react";
import { db, schema } from "@/db";
import { requirePage, scopeOwnerIds } from "@/lib/dal";
import { can } from "@/lib/rbac";
import { getSetting } from "@/lib/settings";
import { daysUntil, fmtDate, fmtDateTime, usd } from "@/lib/format";
import { Banner, Empty, Kpi, PageHeader, Pill } from "@/components/ui";
import { ColumnChooser, DensityToggle, KeyNavTable, SavedViews, Sheet } from "@/components/list";
import { ActionForm } from "@/components/forms";
import { saveDispute } from "./actions";
import { CbActions } from "./CbActions";

export const metadata = { title: "Chargebacks" };

export default async function ChargebacksPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePage("chargebacks.view");
  const sp = await searchParams;
  const owners = await scopeOwnerIds(user);
  const g = await getSetting("general");
  const mScope = owners ? inArray(schema.merchants.ownerId, owners) : undefined;
  const urgentBy = new Date(Date.now() + g.chargebackUrgentDays * 86_400_000).toISOString().slice(0, 10);
  const v = sp.view ?? "open";
  const viewW: Record<string, SQL | undefined> = {
    open: eq(schema.chargebacks.status, "Processed"), urgent: and(eq(schema.chargebacks.status, "Processed"), lte(schema.chargebacks.respondBy, urgentBy)),
    won: eq(schema.chargebacks.status, "Won"), lost: eq(schema.chargebacks.status, "Lost"), all: undefined,
  };
  const rows = await db.select({ c: schema.chargebacks, dba: schema.merchants.dbaName, merchantId: schema.merchants.id, mid: schema.merchantAccounts.mid })
    .from(schema.chargebacks).leftJoin(schema.merchants, eq(schema.chargebacks.merchantId, schema.merchants.id)).leftJoin(schema.merchantAccounts, eq(schema.chargebacks.merchantAccountId, schema.merchantAccounts.id))
    .where(and(mScope, viewW[v])).orderBy(v === "open" || v === "urgent" ? asc(schema.chargebacks.respondBy) : desc(schema.chargebacks.receivedAt)).limit(200);
  const agg = async (w?: SQL) => (await db.select({ n: dsql<number>`count(*)::int`, amt: dsql<number>`coalesce(sum(${schema.chargebacks.amount}),0)::float` }).from(schema.chargebacks).leftJoin(schema.merchants, eq(schema.chargebacks.merchantId, schema.merchants.id)).where(and(mScope, w)))[0]!;
  const since90 = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const [open, urgent, won90, lost90, wonAll, lostAll] = await Promise.all([agg(viewW.open), agg(viewW.urgent), agg(and(eq(schema.chargebacks.status, "Won"), gte(schema.chargebacks.receivedAt, since90))), agg(and(eq(schema.chargebacks.status, "Lost"), gte(schema.chargebacks.receivedAt, since90))), agg(viewW.won), agg(viewW.lost)]);
  const decided = won90.n + lost90.n;
  const sel = sp.cb ? rows.find((r) => r.c.id === sp.cb) ?? (await db.select({ c: schema.chargebacks, dba: schema.merchants.dbaName, merchantId: schema.merchants.id, mid: schema.merchantAccounts.mid }).from(schema.chargebacks).leftJoin(schema.merchants, eq(schema.chargebacks.merchantId, schema.merchants.id)).leftJoin(schema.merchantAccounts, eq(schema.chargebacks.merchantAccountId, schema.merchantAccounts.id)).where(and(eq(schema.chargebacks.id, sp.cb), mScope)))[0] : null;
  const timeline = sel ? await db.select({ a: schema.activities, who: schema.users.name }).from(schema.activities).leftJoin(schema.users, eq(schema.activities.actorUserId, schema.users.id))
    .where(and(eq(schema.activities.tag, sel.c.caseId), sel.merchantId ? eq(schema.activities.merchantId, sel.merchantId) : undefined)).orderBy(asc(schema.activities.occurredAt)) : [];
  const contact = sel?.merchantId ? await db.query.contacts.findFirst({ where: eq(schema.contacts.merchantId, sel.merchantId) }) : null;
  const canEdit = can(user.role, "chargebacks.edit");
  const qs = (x: Record<string, string | undefined>) => `?${new URLSearchParams(Object.entries({ ...sp, ...x }).filter(([, val]) => val) as [string, string][])}`;
  const COLS = [{ key: "mid", label: "MID" }, { key: "reason", label: "Reason" }, { key: "rec", label: "Received" }];

  return (
    <div className="content">
      <PageHeader title="Chargebacks" sub="Disputes mirrored from the processor · deadlines are when the processor needs the response" />
      <section className="kpis" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }} aria-label="Chargeback summary">
        <Kpi label="Open" value={String(open.n)} sub={`${usd(open.amt)} disputed`} href="?view=open" />
        <Kpi label={`Due within ${g.chargebackUrgentDays} days`} value={String(urgent.n)} sub="Respond or accept" href="?view=urgent" />
        <Kpi label="Win rate · 90 days" value={decided ? `${Math.round((won90.n / decided) * 100)}%` : "—"} sub={`${won90.n} won of ${decided} decided`} />
        <Kpi label="Lost · 90 days" value={usd(lost90.amt)} sub={`${lost90.n} cases`} />
      </section>
      <section className="card lv" aria-label="Chargebacks list">
        <div className="lt">
          <SavedViews id="chargebacks" base="/ase/chargebacks" views={[
            { label: "Open", query: "", count: open.n }, { label: `Due in ${g.chargebackUrgentDays} days`, query: "view=urgent", count: urgent.n },
            { label: "Won", query: "view=won", count: wonAll.n }, { label: "Lost", query: "view=lost", count: lostAll.n }, { label: "All", query: "view=all" },
          ]} />
          <span className="sp" />
          <ColumnChooser tableId="cb-table" columns={COLS} />
          <DensityToggle />
          {can(user.role, "export") && <a className="btn" href="/api/export/chargebacks"><Download size={14} aria-hidden="true" />Export CSV</a>}
        </div>
        {rows.length === 0 ? <Empty icon={RotateCcw} title="No chargebacks in this view">Nothing to respond to right now.</Empty> : (
          <KeyNavTable>
            <table className="tbl" id="cb-table">
              <thead><tr><th>Merchant</th><th className="col-mid">MID</th><th>Case ID</th><th className="r">Amount</th><th className="col-reason">Reason</th><th className="col-rec">Received</th><th>Response deadline</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const d = daysUntil(r.c.respondBy), open_ = r.c.status === "Processed", urgentRow = open_ && d !== null && d < g.chargebackUrgentDays;
                  return (
                    <tr key={r.c.id} className={sel?.c.id === r.c.id ? "sel" : ""}>
                      <td><Link className="rl" data-nav href={qs({ cb: r.c.id })} scroll={false}>{r.dba ?? "Unmatched merchant"}</Link></td>
                      <td className="mono muted col-mid">{r.mid ?? "—"}</td><td className="mono">{r.c.caseId}</td><td className="r" style={{ fontWeight: 500 }}>{usd(r.c.amount)}</td>
                      <td className="muted col-reason">{[r.c.reasonCode, r.c.reason].filter(Boolean).join(" ")}</td><td className="muted col-rec">{fmtDate(r.c.receivedAt)}</td>
                      <td><span className="row" style={{ gap: 8 }}><span>{fmtDate(r.c.respondBy)}</span>
                        {open_ && d !== null ? <span className={`pill ${urgentRow ? "t-red" : "t-neutral"}`}>{urgentRow ? <AlertTriangle aria-hidden="true" /> : <Clock aria-hidden="true" />}{d < 0 ? `${-d} days overdue` : d === 0 ? "Due today" : `${d} day${d === 1 ? "" : "s"} left`}</span> : !open_ && <Pill status="Closed" />}</span></td>
                      <td><span className="row" style={{ gap: 4 }}><Pill status={r.c.status} />{r.c.disputeStatus !== "none" && r.c.disputeStatus !== "accepted" && <span className="tag">Dispute {r.c.disputeStatus}</span>}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </KeyNavTable>
        )}
        <div className="lfoot"><span>{rows.length} shown · ↑/↓ moves between rows</span></div>
      </section>

      {sel && (() => {
        const d = daysUntil(sel.c.respondBy), isOpen = sel.c.status === "Processed";
        return (
          <Sheet title={`${usd(sel.c.amount)} · ${sel.dba ?? "Unmatched merchant"}`} sub={<span className="row" style={{ gap: 6 }}><span className="mono">{sel.c.caseId}</span><Pill status={sel.c.status} /></span>} closeHref={qs({ cb: undefined })}
            footer={canEdit && isOpen ? <CbActions id={sel.c.id} hasDraft={sel.c.disputeStatus === "draft"} submitted={sel.c.disputeStatus === "submitted"} /> : undefined}>
            {isOpen && d !== null && <Banner tone={d < g.chargebackUrgentDays ? "red" : "blue"} title={`Respond by ${fmtDate(sel.c.respondBy)} · ${d < 0 ? `${-d} days overdue` : d === 0 ? "due today" : `${d} days left`}`} icon={Clock}>After the deadline the processor accepts the chargeback automatically and the merchant loses {usd(sel.c.amount)} plus any chargeback fee.</Banner>}
            <dl className="dl">
              <dt>Reason</dt><dd>{[sel.c.reasonCode, sel.c.reason].filter(Boolean).join(" · ") || "—"}</dd>
              <dt>Card</dt><dd>{[sel.c.cardBrand, sel.c.cardLast4 ? `•••• ${sel.c.cardLast4}` : null].filter(Boolean).join(" ") || "—"}</dd>
              <dt>Transaction date</dt><dd>{fmtDate(sel.c.transactionDate)}</dd>
              <dt>Received</dt><dd>{fmtDate(sel.c.receivedAt)}</dd>
              <dt>MID</dt><dd className="mono">{sel.mid ?? "—"}</dd>
              <dt>Merchant contact</dt><dd>{contact ? `${contact.firstName} ${contact.lastName} · ${contact.phone ?? ""}` : "—"}</dd>
              {sel.merchantId && <><dt>Merchant</dt><dd><Link href={`/ase/merchants/${sel.merchantId}?tab=chargebacks`}>Open merchant record</Link></dd></>}
            </dl>
            <div>
              <div className="sec-t">Timeline</div>
              <div className="tl">
                <div className="ev sys"><span className="ico"><span className="pm" style={{ width: 12, height: 12, fontSize: 8, lineHeight: "12px" }}>M</span></span><div className="hd"><b>Chargeback received</b><span className="when">{fmtDate(sel.c.receivedAt)}</span></div></div>
                {timeline.map(({ a, who }) => (
                  <div key={a.id} className={`ev ${a.type === "system" ? "sys" : ""}`}><span className="ico">{a.type === "system" ? <span className="pm" style={{ width: 12, height: 12, fontSize: 8, lineHeight: "12px" }}>{a.source === "maverick" ? "M" : "•"}</span> : a.type[0]!.toUpperCase()}</span>
                    <div><div className="hd"><b>{a.title}</b>{who && <span className="muted">{who}</span>}<span className="when">{fmtDateTime(a.occurredAt)}</span></div></div></div>
                ))}
              </div>
            </div>
            <div>
              <div className="sec-t">Documents</div>
              <div className="subtle sm">Evidence upload (receipts, signed work orders, delivery proof) needs file storage, which isn’t connected in this build. Attach files in the Maverick Dashboard for now.</div>
            </div>
            {canEdit && isOpen && (
              <div id="dispute">
                <div className="sec-t">Dispute response</div>
                <ActionForm action={saveDispute} submitLabel={sel.c.disputeStatus === "draft" ? "Update draft" : "Save draft"} className="stack">
                  <input type="hidden" name="id" value={sel.c.id} />
                  <textarea name="notes" className="inp" rows={7} defaultValue={sel.c.disputeNotes ?? ""} aria-label="Rebuttal letter"
                    placeholder={`Rebuttal for ${sel.c.caseId}: what was provided, when, and the evidence that proves it (receipt, signed work order, delivery confirmation).`} />
                </ActionForm>
              </div>
            )}
            {sel.c.disputeNotes && !isOpen && <div><div className="sec-t">Dispute response</div><div className="body" style={{ whiteSpace: "pre-line" }}>{sel.c.disputeNotes}</div></div>}
          </Sheet>
        );
      })()}
    </div>
  );
}
