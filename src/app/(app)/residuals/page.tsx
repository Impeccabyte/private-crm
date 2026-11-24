import Link from "next/link";
import { and, desc, eq, inArray, sql as dsql } from "drizzle-orm";
import { ChevronLeft, ChevronRight, DollarSign, Download } from "lucide-react";
import { db, schema } from "@/db";
import { requirePage, scopeOwnerIds, initialsOf } from "@/lib/dal";
import { can } from "@/lib/rbac";
import { usd, short } from "@/lib/format";
import { Empty, Kpi, PageHeader, Pill } from "@/components/ui";
import { DensityToggle } from "@/components/list";
import { ResidualTree, type Node } from "./ResidualTree";

export const metadata = { title: "Residuals" };

export default async function ResidualsPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const user = await requirePage("residuals.view");
  const sp = await searchParams;
  const owners = await scopeOwnerIds(user);
  const aScope = owners ? inArray(schema.residualLines.agentId, owners) : undefined;
  const periods = (await db.selectDistinct({ p: schema.residualLines.period }).from(schema.residualLines).where(aScope).orderBy(desc(schema.residualLines.period))).map((r) => r.p);
  const period = periods.includes(sp.period ?? "") ? sp.period! : periods[0];
  if (!period) {
    return <div className="content"><PageHeader title="Residuals" /><section className="card"><Empty icon={DollarSign} title="No residuals yet">Residuals appear after the processor publishes them and a sync runs (Settings → Integrations → Re-sync).</Empty></section></div>;
  }
  const lines = await db.select({ r: schema.residualLines, mid: schema.merchantAccounts.mid, dba: schema.merchants.dbaName, merchantId: schema.merchants.id })
    .from(schema.residualLines).leftJoin(schema.merchantAccounts, eq(schema.residualLines.merchantAccountId, schema.merchantAccounts.id))
    .leftJoin(schema.merchants, eq(schema.merchantAccounts.merchantId, schema.merchants.id)).where(and(eq(schema.residualLines.period, period), aScope));
  const agentIds = [...new Set(lines.map((l) => l.r.agentId).filter(Boolean))] as string[];
  const users = agentIds.length ? await db.select().from(schema.users).where(inArray(schema.users.id, agentIds)) : [];
  const parents = users.map((u) => u.parentAgentId).filter(Boolean) as string[];
  const parentUsers = parents.length ? await db.select().from(schema.users).where(inArray(schema.users.id, parents)) : [];
  const allUsers = new Map([...users, ...parentUsers].map((u) => [u.id, u]));

  const leaf = (l: (typeof lines)[number]): Node => ({
    id: l.r.id, kind: "mid", label: l.dba ?? l.r.label ?? "Unmatched MID", sub: l.mid ? `MID ••${l.mid.slice(-4)}` : "", href: l.merchantId ? `/merchants/${l.merchantId}?tab=residuals` : undefined,
    salesCount: l.r.salesCount, salesAmount: l.r.salesAmount, revenue: l.r.revenue, expense: l.r.expense, split: `${l.r.splitPct}%`, adjustment: l.r.adjustment, adjustmentNote: l.r.adjustmentNote,
    profit: l.r.profit, held: l.r.held, heldNote: l.r.heldNote, children: [],
  });
  const sum = (id: string, kind: Node["kind"], label: string, children: Node[], extra: Partial<Node> = {}): Node => ({
    id, kind, label, children, split: kind === "agent" ? "Blended" : children[0]?.split ?? "",
    salesCount: children.reduce((a, c) => a + c.salesCount, 0), salesAmount: children.reduce((a, c) => a + c.salesAmount, 0),
    revenue: children.reduce((a, c) => a + c.revenue, 0), expense: children.reduce((a, c) => a + c.expense, 0), adjustment: children.reduce((a, c) => a + c.adjustment, 0),
    profit: children.reduce((a, c) => a + c.profit, 0), held: children.reduce((a, c) => a + c.held, 0), heldNote: children.find((c) => c.heldNote)?.heldNote ?? null, ...extra,
  });

  // agent → (direct lines, sub-agents → lines). House/unassigned lines group separately.
  const tops = new Map<string, { direct: Node[]; subs: Map<string, Node[]> }>();
  const house: Node[] = [];
  for (const l of lines) {
    const u = l.r.agentId ? allUsers.get(l.r.agentId) : null;
    if (!u || u.role !== "agent") { house.push(leaf(l)); continue; }
    const topId = u.parentAgentId ?? u.id;
    const t = tops.get(topId) ?? { direct: [] as Node[], subs: new Map<string, Node[]>() };
    if (u.parentAgentId) t.subs.set(u.id, [...(t.subs.get(u.id) ?? []), leaf(l)]); else t.direct.push(leaf(l));
    tops.set(topId, t);
  }
  const tree: Node[] = [...tops.entries()].map(([topId, t]) => {
    const u = allUsers.get(topId);
    const kids: Node[] = [];
    if (t.direct.length) kids.push(sum(`${topId}-d`, "group", `${u?.name ?? "Agent"} · direct`, t.direct));
    for (const [subId, ls] of t.subs) kids.push(sum(subId, "sub", allUsers.get(subId)?.name ?? "Sub-agent", ls, { tag: "Sub-agent", avatar: { ini: initialsOf(allUsers.get(subId)?.name ?? "?"), color: allUsers.get(subId)?.avatarColor ?? "av-6", photo: allUsers.get(subId)?.avatarKey ?? null } }));
    return sum(topId, "agent", u?.name ?? "Agent", kids, { tag: "Agent", avatar: { ini: initialsOf(u?.name ?? "?"), color: u?.avatarColor ?? "av-6", photo: u?.avatarKey ?? null } });
  }).sort((a, b) => a.label.localeCompare(b.label));
  if (house.length && !owners) tree.push(sum("house", "agent", "Impeccabyte house accounts", [sum("house-d", "group", "House book", house)]));

  const t = tree.reduce((a, n) => ({ rev: a.rev + n.revenue, exp: a.exp + n.expense, adj: a.adj + n.adjustment, prof: a.prof + n.profit, held: a.held + n.held, vol: a.vol + n.salesAmount }), { rev: 0, exp: 0, adj: 0, prof: 0, held: 0, vol: 0 });
  const idx = periods.indexOf(period);
  const label = (p: string) => new Date(p + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const published = lines.map((l) => l.r.publishedAt).filter(Boolean).sort().at(-1);
  void dsql;

  return (
    <div className="content">
      <PageHeader title="Residuals" sub={owners ? "Your residuals and your sub-agents’. Other agents’ rows are hidden." : "Monthly commission per MID, rolled up from merchant to sub-agent to agent"}
        actions={<>
          <div className="row" style={{ gap: 2 }}>
            {idx < periods.length - 1 ? <Link className="btn icon" href={`?period=${periods[idx + 1]}`} aria-label="Previous month"><ChevronLeft size={16} aria-hidden="true" /></Link> : <span className="btn icon dis" aria-hidden="true"><ChevronLeft size={16} /></span>}
            <form method="get" className="row" style={{ gap: 0 }}><label className="sr" htmlFor="period">Period</label>
              <select id="period" name="period" className="inp" defaultValue={period} style={{ width: 170, fontWeight: 500 }}>{periods.map((p) => <option key={p} value={p}>{label(p)}</option>)}</select>
              <button className="btn" type="submit" style={{ marginLeft: 4 }}>Go</button>
            </form>
            {idx > 0 ? <Link className="btn icon" href={`?period=${periods[idx - 1]}`} aria-label="Next month"><ChevronRight size={16} aria-hidden="true" /></Link> : <span className="btn icon dis" aria-hidden="true"><ChevronRight size={16} /></span>}
          </div>
          {published && <Pill status="Approved" label={`Published ${new Date(published).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`} />}
          {can(user.role, "export") && <a className="btn" href={`/api/export/residuals?period=${period}`}><Download size={14} aria-hidden="true" />Export CSV</a>}
        </>} />
      <section className="kpis" aria-label="Residual totals">
        <Kpi label="Total revenue" value={usd(t.rev)} sub={`${label(period)} · ${short(t.vol)} volume`} />
        <Kpi label="Expense" value={usd(-t.exp)} sub="Interchange, dues, processor cost" />
        <Kpi label="Adjustments" value={usd(t.adj)} sub="Chargeback & other fees" />
        <Kpi label={owners ? "My profit" : "Profit"} value={usd(t.prof)} sub="After splits and adjustments" />
        <Kpi label="Held" value={usd(t.held)} sub="Hover a held amount for the reason" />
      </section>
      <section className="card lv" aria-label="Residuals by agent">
        <div className="lt"><span className="muted sm">Profit = (revenue − expense) × split + adjustments. Held amounts are paid when the hold clears.</span><span className="sp" /><DensityToggle /></div>
        <ResidualTree nodes={tree} total={{ salesCount: tree.reduce((a, n) => a + n.salesCount, 0), salesAmount: t.vol, revenue: t.rev, expense: t.exp, adjustment: t.adj, profit: t.prof, held: t.held }} periodLabel={label(period)} />
      </section>
    </div>
  );
}
