import Link from "next/link";
import { and, eq, gte, inArray, isNotNull, lt, sql as dsql } from "drizzle-orm";
import { Download } from "lucide-react";
import { db, schema } from "@/db";
import { requirePage, scopeOwnerIds } from "@/lib/dal";
import { can } from "@/lib/rbac";
import { monthStart, volumeBetween, volumeByMonth, pctChange } from "@/lib/metrics";
import { num, pct, short, signedPct, STAGE_LABEL, STAGES, usd } from "@/lib/format";
import { Card, Kpi, PageHeader, Tabs } from "@/components/ui";
import { Bars, SimpleLine } from "@/components/charts";

export const metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePage("reports.view");
  const sp = await searchParams;
  const owners = await scopeOwnerIds(user);
  const tab = ["portfolio", "pipeline", "support"].includes(sp.tab ?? "") ? sp.tab! : "portfolio";
  const months = [3, 6, 12].includes(Number(sp.months)) ? Number(sp.months) : 12;
  const compare = sp.compare !== "0";
  const group = ["agent", "processor", "mcc"].includes(sp.group ?? "") ? sp.group! : "agent";
  const from = monthStart(new Date(), -(months - 1)), to = new Date();
  const prevFrom = monthStart(new Date(), -(2 * months - 1));
  const mScope = owners ? inArray(schema.merchants.ownerId, owners) : undefined;
  const qs = (x: Record<string, string | undefined>) => `?${new URLSearchParams(Object.entries({ ...sp, ...x }).filter(([, v]) => v !== undefined && v !== "") as [string, string][])}`;
  const fromIso = from.toISOString().slice(0, 10);

  const controls = (
    <div className="row w" style={{ gap: 8 }}>
      <div className="seg" role="group" aria-label="Date range">
        {[3, 6, 12].map((m) => <Link key={m} href={qs({ months: String(m) })} className="btn ghost sm" style={months === m ? { background: "var(--surface)", color: "var(--ink)", boxShadow: "0 1px 2px rgba(16,24,40,.12)", height: 24 } : { height: 24 }} aria-current={months === m}>Last {m} months</Link>)}
      </div>
      <Link href={qs({ compare: compare ? "0" : "1" })} className="row" style={{ gap: 8, textDecoration: "none", color: "var(--ink-2)" }} role="switch" aria-checked={compare}>
        <span className={`switch ${compare ? "on" : ""}`} aria-hidden="true" /><span className="sm">Compare to previous period</span>
      </Link>
      <span className="row" style={{ gap: 6 }}><span className="sm muted">Group by</span>
        <div className="seg" role="group" aria-label="Group by">
          {[["agent", "Agent"], ["processor", "Processor"], ["mcc", "MCC"]].map(([k, l]) => <Link key={k} href={qs({ group: k })} className="btn ghost sm" style={group === k ? { background: "var(--surface)", color: "var(--ink)", boxShadow: "0 1px 2px rgba(16,24,40,.12)", height: 24 } : { height: 24 }} aria-current={group === k}>{l}</Link>)}
        </div>
      </span>
      {can(user.role, "export") && <a className="btn" href={`/api/export/merchants`}><Download size={14} aria-hidden="true" />Export</a>}
    </div>
  );

  return (
    <div className="content">
      <PageHeader title="Reports" sub={owners ? "Scoped to your book of merchants" : "Whole portfolio · computed from stored daily snapshots"} actions={controls} />
      <Tabs active={tab} base={qs({ tab: undefined })} tabs={[{ key: "portfolio", label: "Portfolio" }, { key: "pipeline", label: "Pipeline" }, { key: "support", label: "Support" }]} />
      {tab === "portfolio" && <Portfolio owners={owners} months={months} compare={compare} group={group} from={from} prevFrom={prevFrom} to={to} mScope={mScope} />}
      {tab === "pipeline" && <Pipeline owners={owners} fromIso={fromIso} group={group} mScope={mScope} />}
      {tab === "support" && <Support owners={owners} fromIso={fromIso} mScope={mScope} />}
    </div>
  );
}

type Scope = ReturnType<typeof inArray> | undefined;

async function Portfolio({ owners, months, compare, group, from, prevFrom, to, mScope }: { owners: string[] | null; months: number; compare: boolean; group: string; from: Date; prevFrom: Date; to: Date; mScope: Scope }) {
  const series = await volumeByMonth(owners, months * 2);
  const cur = series.slice(months), prev = series.slice(0, months);
  const [vCur, vPrev, active, closedInRange] = await Promise.all([
    volumeBetween(owners, from, to), volumeBetween(owners, prevFrom, from),
    db.select({ n: dsql<number>`count(*)::int` }).from(schema.merchants).where(and(eq(schema.merchants.status, "live"), mScope)),
    db.select({ n: dsql<number>`count(distinct ${schema.merchantAccounts.merchantId})::int` }).from(schema.merchantAccounts).innerJoin(schema.merchants, eq(schema.merchantAccounts.merchantId, schema.merchants.id))
      .where(and(isNotNull(schema.merchantAccounts.closedAt), gte(schema.merchantAccounts.closedAt, from.toISOString().slice(0, 10)), mScope)),
  ]);
  const fromIso = from.toISOString().slice(0, 10);
  const boardedByMonth = await db.select({ m: dsql<string>`to_char(date_trunc('month', ${schema.merchants.liveSince}), 'YYYY-MM')`, n: dsql<number>`count(*)::int` })
    .from(schema.merchants).where(and(gte(schema.merchants.liveSince, fromIso), mScope)).groupBy(dsql`1`);
  const closedByMonth = await db.select({ m: dsql<string>`to_char(date_trunc('month', ${schema.merchantAccounts.closedAt}), 'YYYY-MM')`, n: dsql<number>`count(distinct ${schema.merchantAccounts.merchantId})::int` })
    .from(schema.merchantAccounts).innerJoin(schema.merchants, eq(schema.merchantAccounts.merchantId, schema.merchants.id)).where(and(gte(schema.merchantAccounts.closedAt, fromIso), mScope)).groupBy(dsql`1`);
  const activeNow = active[0]!.n;
  const ac = cur.map((x) => ({ label: x.label, boarded: boardedByMonth.find((b) => b.m === x.key)?.n ?? 0, closed: closedByMonth.find((b) => b.m === x.key)?.n ?? 0 }));
  const attr = ac.map((x) => ({ label: x.label, value: activeNow ? (x.closed / activeNow) * 100 : 0 }));

  const groupExpr = group === "mcc" ? dsql<string>`coalesce(${schema.merchants.mcc}, '—')` : group === "processor" ? dsql<string>`initcap(${schema.merchantAccounts.processor})` : dsql<string>`coalesce(${schema.users.name}, 'Unassigned')`;
  const base = db.select({
    id: schema.merchants.id, dba: schema.merchants.dbaName, mcc: schema.merchants.mcc, industry: schema.merchants.industry, grp: groupExpr,
    amt: dsql<number>`sum(${schema.dailyMetrics.salesAmount})::float`, cnt: dsql<number>`sum(${schema.dailyMetrics.salesCount})::int`,
    prevAmt: dsql<number>`0::float`,
  }).from(schema.dailyMetrics).innerJoin(schema.merchantAccounts, eq(schema.dailyMetrics.merchantAccountId, schema.merchantAccounts.id))
    .innerJoin(schema.merchants, eq(schema.merchantAccounts.merchantId, schema.merchants.id)).leftJoin(schema.users, eq(schema.merchants.ownerId, schema.users.id))
    .where(and(gte(schema.dailyMetrics.day, fromIso), mScope)).groupBy(schema.merchants.id, schema.merchants.dbaName, schema.merchants.mcc, schema.merchants.industry, groupExpr);
  const perMerchant = await base;
  const prevPer = await db.select({ id: schema.merchants.id, amt: dsql<number>`sum(${schema.dailyMetrics.salesAmount})::float` }).from(schema.dailyMetrics)
    .innerJoin(schema.merchantAccounts, eq(schema.dailyMetrics.merchantAccountId, schema.merchantAccounts.id)).innerJoin(schema.merchants, eq(schema.merchantAccounts.merchantId, schema.merchants.id))
    .where(and(gte(schema.dailyMetrics.day, prevFrom.toISOString().slice(0, 10)), lt(schema.dailyMetrics.day, fromIso), mScope)).groupBy(schema.merchants.id);
  const top = [...perMerchant].sort((a, b) => b.amt - a.amt).slice(0, 20);
  const total = perMerchant.reduce((a, r) => a + r.amt, 0);
  const byMcc = new Map<string, { label: string; amt: number }>();
  for (const r of perMerchant) { const k = r.mcc ?? "—"; const e = byMcc.get(k) ?? { label: `${k} ${r.industry ?? ""}`.trim(), amt: 0 }; e.amt += r.amt; byMcc.set(k, e); }
  const mccMix = [...byMcc.values()].sort((a, b) => b.amt - a.amt).slice(0, 7);
  const byGroup = new Map<string, number>();
  for (const r of perMerchant) byGroup.set(r.grp, (byGroup.get(r.grp) ?? 0) + r.amt);
  const cbs = await db.select({ id: schema.merchants.id, dba: schema.merchants.dbaName, n: dsql<number>`count(*)::int` }).from(schema.chargebacks).innerJoin(schema.merchants, eq(schema.chargebacks.merchantId, schema.merchants.id))
    .where(and(gte(schema.chargebacks.receivedAt, fromIso), mScope)).groupBy(schema.merchants.id, schema.merchants.dbaName);
  const cbRatio = cbs.map((c) => { const t = perMerchant.find((p) => p.id === c.id)?.cnt ?? 0; return { ...c, ratio: t ? (c.n / t) * 100 : 0 }; }).sort((a, b) => b.ratio - a.ratio).slice(0, 10);
  const maxCb = Math.max(1, ...cbRatio.map((c) => c.ratio), 0.9);
  const vDelta = pctChange(vCur.amount, vPrev.amount);
  const groupLabel = group === "mcc" ? "MCC" : group === "processor" ? "Processor" : "Agent";

  return (
    <>
      <section className="kpis" aria-label="Portfolio summary">
        <Kpi label={`Volume · last ${months} months`} value={short(vCur.amount)} delta={vDelta === null ? undefined : pct(Math.abs(vDelta))} deltaDir={vDelta === null ? "flat" : vDelta >= 0 ? "up" : "dn"} sub="vs previous period" />
        <Kpi label="Transactions" value={num(vCur.count)} sub={`avg ticket ${vCur.count ? usd(vCur.amount / vCur.count) : "—"}`} />
        <Kpi label="Active merchants" value={num(activeNow)} sub="live today" />
        <Kpi label={`Closed · ${months} months`} value={num(closedInRange[0]!.n)} sub="merchant accounts closed" />
        <Kpi label="Avg monthly attrition" value={pct(attr.reduce((a, x) => a + x.value, 0) / Math.max(1, attr.length))} sub="closed ÷ active" />
      </section>
      <div className="grid2" style={{ gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr)" }}>
        <Card title="Processing volume by month" bodyClass="card-b">
          <Bars data={cur.map((x, i) => ({ label: x.label, current: x.amount, previous: compare ? prev[i]?.amount ?? 0 : null }))} series={compare ? [{ key: "current", label: "This period" }, { key: "previous", label: "Previous period" }] : [{ key: "current", label: "Volume" }]} />
          <div className="subtle sm" style={{ marginTop: 6 }}>The current month is month-to-date.</div>
        </Card>
        <Card title="MCC mix" actions={<span className="subtle sm">Share of volume</span>} bodyClass="card-b stack">
          {mccMix.length === 0 && <div className="subtle sm">No volume in this period.</div>}
          {mccMix.map((x) => (
            <div key={x.label}><div className="row sm"><span>{x.label}</span><span className="sp" /><b className="num">{pct(total ? (x.amt / total) * 100 : 0)}</b></div>
              <div className="prog" style={{ marginTop: 4 }}><i style={{ width: `${total ? (x.amt / mccMix[0]!.amt) * 100 : 0}%`, background: "var(--accent)" }} /></div></div>
          ))}
        </Card>
      </div>
      <div className="grid2">
        <Card title="Active vs closed merchants" actions={<span className="subtle sm">Went live vs closed, per month</span>} bodyClass="card-b">
          <Bars data={ac} series={[{ key: "boarded", label: "Went live" }, { key: "closed", label: "Closed" }]} fmt="number" height={220} />
        </Card>
        <Card title="Monthly attrition" actions={<span className="subtle sm">Closed ÷ active</span>} bodyClass="card-b">
          <SimpleLine data={attr} fmt="pct" label="Attrition" />
        </Card>
      </div>
      <div className="grid2" style={{ gridTemplateColumns: "minmax(0,3fr) minmax(0,2fr)" }}>
        <Card title="Top 20 merchants by volume" actions={<span className="subtle sm">Last {months} months</span>} className="lv">
          <div className="tblw"><table className="tbl compact">
            <thead><tr><th className="r w0">#</th><th>Merchant</th><th>MCC</th><th>{groupLabel}</th><th className="r">Volume</th><th className="r">vs prior</th></tr></thead>
            <tbody>{top.map((t, i) => { const p = prevPer.find((x) => x.id === t.id)?.amt ?? 0; const d = p ? ((t.amt - p) / p) * 100 : null; return (
              <tr key={t.id}><td className="r subtle">{i + 1}</td><td><Link className="rl" href={`/ase/merchants/${t.id}`}>{t.dba}</Link></td><td className="mono muted">{t.mcc ?? "—"}</td><td className="muted">{t.grp}</td><td className="r">{usd(t.amt)}</td><td className="r"><span className={d === null ? "subtle" : d >= 0 ? "tx-green" : "tx-red"}>{d === null ? "—" : signedPct(d)}</span></td></tr>
            ); })}</tbody>
          </table></div>
        </Card>
        <div className="stack">
          <Card title="Chargeback ratio by merchant" actions={<span className="subtle sm">Highest 10</span>} bodyClass="card-b">
            {cbRatio.length === 0 && <div className="subtle sm">No chargebacks in this period.</div>}
            <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 8 }} role="img" aria-label="Chargeback ratio by merchant with the 0.65% threshold">
              {cbRatio.map((c) => (
                <div className="hbar" key={c.id}><span className="sm ellipsis">{c.dba}</span>
                  <div className="tr2" style={{ height: 18 }}><div className="bk" style={{ width: `${(c.ratio / maxCb) * 75}%`, minWidth: 2 }}>{c.ratio >= 0.65 && <div className="fg" style={{ width: "100%" }} />}</div><b className="sm num">{c.ratio.toFixed(2)}%</b></div></div>
              ))}
            </div>
            {cbRatio.length > 0 && <div className="subtle sm" style={{ marginTop: 8 }}>Solid bars are over the 0.65% network monitoring threshold.</div>}
          </Card>
          <Card title={`Volume by ${groupLabel.toLowerCase()}`} className="lv">
            <table className="tbl compact"><tbody>{[...byGroup.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => <tr key={k}><td>{k}</td><td className="r">{usd(v)}</td><td className="r muted">{pct(total ? (v / total) * 100 : 0)}</td></tr>)}</tbody></table>
          </Card>
        </div>
      </div>
    </>
  );
}

async function Pipeline({ owners, fromIso, group, mScope }: { owners: string[] | null; fromIso: string; group: string; mScope: Scope }) {
  const dScope = owners ? inArray(schema.deals.ownerId, owners) : undefined;
  const entered = await db.select({ stage: schema.dealStageHistory.stage, n: dsql<number>`count(distinct ${schema.dealStageHistory.dealId})::int` })
    .from(schema.dealStageHistory).innerJoin(schema.deals, eq(schema.dealStageHistory.dealId, schema.deals.id))
    .where(and(gte(schema.dealStageHistory.enteredAt, new Date(fromIso)), dScope)).groupBy(schema.dealStageHistory.stage);
  // A deal that reached a later stage also passed the earlier ones.
  const ordered = STAGES.filter((s) => s !== "lost");
  const reach = ordered.map((s, i) => ({ s, n: entered.filter((e) => ordered.indexOf(e.stage as (typeof ordered)[number]) >= i).reduce((a, e) => a + e.n, 0) }));
  const top = Math.max(1, reach[0]?.n ?? 1);
  const durations = await db.execute(dsql`
    select h.stage, avg(extract(epoch from (coalesce(nx.entered_at, now()) - h.entered_at)) / 86400)::float as days
    from deal_stage_history h join deals d on d.id = h.deal_id
    left join lateral (select entered_at from deal_stage_history x where x.deal_id = h.deal_id and x.entered_at > h.entered_at order by entered_at limit 1) nx on true
    where h.entered_at >= ${fromIso} and h.stage not in ('won','lost') ${owners ? dsql`and d.owner_id in ${owners}` : dsql``}
    group by h.stage`) as unknown as { stage: string; days: number }[];
  const gExpr = group === "mcc" ? dsql<string>`coalesce(${schema.merchants.mcc}, '—')` : group === "processor" ? dsql<string>`initcap(${schema.applications.processor})` : dsql<string>`coalesce(${schema.users.name}, 'Unassigned')`;
  const cycle = await db.select({
    grp: gExpr, n: dsql<number>`count(*)::int`,
    toApprove: dsql<number>`avg(extract(epoch from (${schema.applications.approvedAt} - ${schema.applications.createdAt})) / 86400)::float`,
    toBatch: dsql<number>`avg(extract(epoch from (${schema.applications.firstBatchAt} - ${schema.applications.approvedAt})) / 86400)::float`,
  }).from(schema.applications).innerJoin(schema.merchants, eq(schema.applications.merchantId, schema.merchants.id)).leftJoin(schema.users, eq(schema.merchants.ownerId, schema.users.id))
    .where(and(isNotNull(schema.applications.approvedAt), mScope)).groupBy(gExpr);
  const all = cycle.reduce((a, c) => ({ n: a.n + c.n, ta: a.ta + (c.toApprove ?? 0) * c.n, tb: a.tb + (c.toBatch ?? 0) * c.n }), { n: 0, ta: 0, tb: 0 });
  const decided = await db.select({ status: schema.applications.status, n: dsql<number>`count(*)::int` }).from(schema.applications).innerJoin(schema.merchants, eq(schema.applications.merchantId, schema.merchants.id))
    .where(and(inArray(schema.applications.status, ["Approved", "Declined"]), gte(schema.applications.statusChangedAt, new Date(fromIso)), mScope)).groupBy(schema.applications.status);
  const ap = decided.find((d) => d.status === "Approved")?.n ?? 0, de = decided.find((d) => d.status === "Declined")?.n ?? 0;
  const maxCycle = Math.max(1, ...cycle.map((c) => (c.toApprove ?? 0) + (c.toBatch ?? 0)));

  return (
    <>
      <div className="grid2" style={{ gridTemplateColumns: "minmax(0,3fr) minmax(0,2fr)" }}>
        <Card title="Conversion funnel by stage" actions={<span className="subtle sm">Deals that reached each stage</span>} bodyClass="card-b stack">
          {reach.map((r, i) => (
            <div key={r.s} className="row" style={{ gap: 12 }}>
              <span style={{ width: 130, fontWeight: 500 }}>{STAGE_LABEL[r.s]}</span>
              <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10 }}>
                <div aria-hidden="true" style={{ width: `${(r.n / top) * 88}%`, minWidth: 2, height: 26, borderRadius: 6, background: `color-mix(in srgb, var(--accent) ${100 - i * 13}%, var(--surface))` }} />
                <b className="num">{r.n}</b>
              </div>
              <span className="sm muted num" style={{ width: 110, textAlign: "right" }}>{i === 0 ? "100%" : `${reach[i - 1]!.n ? Math.round((r.n / reach[i - 1]!.n) * 100) : 0}% from prior`}</span>
            </div>
          ))}
        </Card>
        <Card title="Average days in stage" bodyClass="card-b stack">
          {ordered.filter((s) => s !== "won").map((s) => { const d = durations.find((x) => x.stage === s)?.days ?? null; return (
            <div key={s}><div className="row sm"><span>{STAGE_LABEL[s]}</span><span className="sp" /><b className="num">{d === null ? "—" : `${d.toFixed(1)} days`}</b></div>
              <div className="prog" style={{ marginTop: 4 }}><i style={{ width: `${Math.min(100, ((d ?? 0) / 21) * 100)}%`, background: "var(--accent)" }} /></div></div>
          ); })}
        </Card>
      </div>
      <Card title="Boarding cycle time" actions={<span className="subtle sm">Application created → approved → first batch</span>} bodyClass="card-b stack">
        <div className="row w" style={{ gap: 32 }}>
          <div><div className="subtle sm">Created → approved</div><div className="num" style={{ fontSize: 22, fontWeight: 600 }}>{all.n ? `${(all.ta / all.n).toFixed(1)} days` : "—"}</div></div>
          <div><div className="subtle sm">Approved → first batch</div><div className="num" style={{ fontSize: 22, fontWeight: 600 }}>{all.n ? `${(all.tb / all.n).toFixed(1)} days` : "—"}</div></div>
          <div><div className="subtle sm">Approval rate</div><div className="num" style={{ fontSize: 22, fontWeight: 600 }}>{ap + de ? pct((ap / (ap + de)) * 100) : "—"}</div></div>
        </div>
        <table className="tbl compact">
          <thead><tr><th>{group === "mcc" ? "MCC" : group === "processor" ? "Processor" : "Agent"}</th><th style={{ width: "50%" }}>Created → approved → first batch</th><th className="r">Approved apps</th><th className="r">Average total</th></tr></thead>
          <tbody>{cycle.map((c) => (
            <tr key={c.grp}><td>{c.grp}</td>
              <td><div style={{ display: "flex", height: 12, borderRadius: 3, overflow: "hidden", background: "var(--sunken)" }} aria-hidden="true"><span style={{ width: `${((c.toApprove ?? 0) / maxCycle) * 100}%`, background: "var(--accent)" }} /><span style={{ width: `${((c.toBatch ?? 0) / maxCycle) * 100}%`, background: "color-mix(in srgb, var(--accent) 35%, var(--surface))" }} /></div></td>
              <td className="r">{c.n}</td><td className="r">{((c.toApprove ?? 0) + (c.toBatch ?? 0)).toFixed(1)} days</td></tr>
          ))}</tbody>
        </table>
        <div className="legend"><span><i className="lg1" />Created → approved</span><span><i className="lg0" />Approved → first batch</span></div>
      </Card>
    </>
  );
}

async function Support({ owners, fromIso, mScope }: { owners: string[] | null; fromIso: string; mScope: Scope }) {
  const ownerSql = owners ? dsql`and m.owner_id in ${owners}` : dsql``;
  const weekly = await db.execute(dsql`
    with w as (select generate_series(date_trunc('week', now()) - interval '7 weeks', date_trunc('week', now()), interval '1 week') as wk)
    select to_char(w.wk, 'Mon DD') as label,
      (select count(*)::int from tickets t left join merchants m on m.id = t.merchant_id where date_trunc('week', t.created_at) = w.wk ${ownerSql}) as opened,
      (select count(*)::int from tickets t left join merchants m on m.id = t.merchant_id where date_trunc('week', t.closed_at) = w.wk ${ownerSql}) as closed,
      (select percentile_cont(0.5) within group (order by extract(epoch from (t.first_response_at - t.created_at)) / 60)::float from tickets t left join merchants m on m.id = t.merchant_id where t.first_response_at is not null and date_trunc('week', t.created_at) = w.wk ${ownerSql}) as frt
    from w order by w.wk`) as unknown as { label: string; opened: number; closed: number; frt: number | null }[];
  const byCat = await db.select({
    cat: dsql<string>`coalesce(${schema.tickets.category}, 'Uncategorized')`, n: dsql<number>`count(*)::int`,
    hrs: dsql<number>`percentile_cont(0.5) within group (order by extract(epoch from (${schema.tickets.closedAt} - ${schema.tickets.createdAt})) / 3600)::float`,
    esc: dsql<number>`count(*) filter (where ${schema.tickets.source} = 'maverick')::int`,
  }).from(schema.tickets).leftJoin(schema.merchants, eq(schema.tickets.merchantId, schema.merchants.id))
    .where(and(gte(schema.tickets.createdAt, new Date(fromIso)), mScope)).groupBy(dsql`1`);
  const opened = weekly.reduce((a, w) => a + w.opened, 0), closed = weekly.reduce((a, w) => a + w.closed, 0);
  const frts = weekly.map((w) => w.frt).filter((x): x is number => x !== null);
  const maxH = Math.max(1, ...byCat.map((c) => c.hrs ?? 0));
  return (
    <>
      <section className="kpis">
        <Kpi label="Opened · 8 weeks" value={num(opened)} />
        <Kpi label="Closed · 8 weeks" value={num(closed)} />
        <Kpi label="First response (median)" value={frts.length ? `${Math.round(frts.reduce((a, b) => a + b, 0) / frts.length)}m` : "—"} />
        <Kpi label="Resolution (median)" value={byCat.some((c) => c.hrs) ? `${(byCat.reduce((a, c) => a + (c.hrs ?? 0) * c.n, 0) / Math.max(1, byCat.reduce((a, c) => a + (c.hrs ? c.n : 0), 0))).toFixed(1)}h` : "—"} />
      </section>
      <div className="grid2">
        <Card title="Tickets opened vs closed" actions={<span className="subtle sm">Per week</span>} bodyClass="card-b"><Bars data={weekly} series={[{ key: "opened", label: "Opened" }, { key: "closed", label: "Closed" }]} fmt="number" height={220} /></Card>
        <Card title="First response time" actions={<span className="subtle sm">Median minutes per week</span>} bodyClass="card-b"><SimpleLine data={weekly.map((w) => ({ label: w.label, value: w.frt ?? 0 }))} label="First response (minutes)" /></Card>
      </div>
      <Card title="Resolution time by category" actions={<span className="subtle sm">Median hours</span>} className="lv">
        <div className="tblw"><table className="tbl">
          <thead><tr><th>Category</th><th className="r">Tickets</th><th style={{ width: "40%" }}>Median resolution</th><th className="r">Hours</th><th className="r">Mirrored / escalated to Maverick</th></tr></thead>
          <tbody>{byCat.map((c) => (
            <tr key={c.cat}><td style={{ fontWeight: 500 }}>{c.cat}</td><td className="r">{c.n}</td><td><div className="prog"><i style={{ width: `${((c.hrs ?? 0) / maxH) * 100}%`, background: "var(--accent)" }} /></div></td><td className="r">{c.hrs ? c.hrs.toFixed(1) : "—"}</td><td className="r">{c.esc}</td></tr>
          ))}</tbody>
        </table></div>
      </Card>
    </>
  );
}
