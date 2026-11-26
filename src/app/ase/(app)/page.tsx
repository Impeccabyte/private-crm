import Link from "next/link";
import { and, asc, count, desc, eq, gte, inArray, isNull, lt, lte, ne, notInArray, or, sql as dsql } from "drizzle-orm";
import { AlertTriangle, Clock, RotateCcw, MessageCircle, ShieldAlert, XCircle } from "lucide-react";
import { db, schema } from "@/db";
import { requireUser, scopeOwnerIds, initialsOf } from "@/lib/dal";
import { can, ROLE_LABEL } from "@/lib/rbac";
import { getSetting } from "@/lib/settings";
import { monthStart, pctChange, residualTotals, volumeBetween, volumeByMonth } from "@/lib/metrics";
import { daysSince, daysUntil, fmtDate, minutesLabel, num, pct, short, STAGE_LABEL, STAGE_PROB, usd } from "@/lib/format";
import { Avatar, Card, Kpi, Pill, Who, Banner } from "@/components/ui";
import { TrendChart } from "@/components/charts";
import { TasksCard } from "./TasksCard";

export const metadata = { title: "Home" };

export default async function HomePage({ searchParams }: { searchParams: Promise<{ denied?: string; task?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const owners = await scopeOwnerIds(user);
  const g = await getSetting("general");
  const now = new Date();
  const mStart = monthStart(now), prevStart = monthStart(now, -1);
  const sameDayPrev = new Date(prevStart.getTime() + (now.getTime() - mStart.getTime()));
  const mScope = owners ? inArray(schema.merchants.ownerId, owners) : undefined;
  const lastPeriod = prevStart.toISOString().slice(0, 10);
  const periodBefore = monthStart(now, -2).toISOString().slice(0, 10);

  const [
    activeRow, newLiveRow, volCur, volPrev, appsCur, appsPrev, decided, ticketsOpen, ticketsRisk, cbOpen, resLast, resPrev,
  ] = await Promise.all([
    db.select({ n: count() }).from(schema.merchants).where(and(eq(schema.merchants.status, "live"), mScope)),
    db.select({ n: count() }).from(schema.merchants).where(and(eq(schema.merchants.status, "live"), gte(schema.merchants.liveSince, mStart.toISOString().slice(0, 10)), mScope)),
    volumeBetween(owners, mStart, now),
    volumeBetween(owners, prevStart, sameDayPrev),
    db.select({ n: count() }).from(schema.applications).innerJoin(schema.merchants, eq(schema.applications.merchantId, schema.merchants.id)).where(and(gte(schema.applications.createdAt, mStart), mScope)),
    db.select({ n: count() }).from(schema.applications).innerJoin(schema.merchants, eq(schema.applications.merchantId, schema.merchants.id)).where(and(gte(schema.applications.createdAt, prevStart), lt(schema.applications.createdAt, mStart), mScope)),
    db.select({ status: schema.applications.status, n: count() }).from(schema.applications).innerJoin(schema.merchants, eq(schema.applications.merchantId, schema.merchants.id))
      .where(and(inArray(schema.applications.status, ["Approved", "Declined"]), gte(schema.applications.statusChangedAt, new Date(Date.now() - 90 * 86_400_000)), mScope)).groupBy(schema.applications.status),
    db.select({ n: count() }).from(schema.tickets).leftJoin(schema.merchants, eq(schema.tickets.merchantId, schema.merchants.id)).where(and(ne(schema.tickets.status, "Closed"), mScope)),
    db.select({ n: count() }).from(schema.tickets).leftJoin(schema.merchants, eq(schema.tickets.merchantId, schema.merchants.id))
      .where(and(ne(schema.tickets.status, "Closed"), isNull(schema.tickets.firstResponseAt), lte(schema.tickets.slaDueAt, new Date(Date.now() + g.ticketSlaWarnMinutes * 60_000)), mScope)),
    db.select({ n: count(), amt: dsql<number>`coalesce(sum(${schema.chargebacks.amount}),0)::float` }).from(schema.chargebacks).leftJoin(schema.merchants, eq(schema.chargebacks.merchantId, schema.merchants.id))
      .where(and(eq(schema.chargebacks.status, "Processed"), mScope)),
    residualTotals(owners, lastPeriod),
    residualTotals(owners, periodBefore),
  ]);
  const approved = decided.find((d) => d.status === "Approved")?.n ?? 0, declined = decided.find((d) => d.status === "Declined")?.n ?? 0;
  const approvalRate = approved + declined ? (approved / (approved + declined)) * 100 : null;
  const vDelta = pctChange(volCur.amount, volPrev.amount);
  const rDelta = pctChange(resLast.profit, resPrev.profit);
  const appsDelta = (appsCur[0]?.n ?? 0) - (appsPrev[0]?.n ?? 0);
  const monthName = (d: Date) => d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });

  // ── Needs attention ──────────────────────────────────────────────────────────
  const stuckBefore = new Date(Date.now() - g.stuckApplicationDays * 86_400_000);
  const cbDueBy = new Date(Date.now() + g.chargebackUrgentDays * 86_400_000).toISOString().slice(0, 10);
  const [stuck, failedChecks, cbDue, slaBreach, riskEvents] = await Promise.all([
    can(user.role, "applications.view") ? db.select({ a: schema.applications, dba: schema.merchants.dbaName, owner: schema.users.name, color: schema.users.avatarColor, photo: schema.users.avatarKey })
      .from(schema.applications).innerJoin(schema.merchants, eq(schema.applications.merchantId, schema.merchants.id)).leftJoin(schema.users, eq(schema.merchants.ownerId, schema.users.id))
      .where(and(inArray(schema.applications.status, ["New", "Pending", "Underwriting"]), lt(schema.applications.statusChangedAt, stuckBefore), mScope)).orderBy(asc(schema.applications.statusChangedAt)).limit(6) : [],
    can(user.role, "applications.view") ? db.selectDistinctOn([schema.applications.id], { a: schema.applications, dba: schema.merchants.dbaName, check: schema.applicationChecks.name, detail: schema.applicationChecks.detail, owner: schema.users.name, color: schema.users.avatarColor, photo: schema.users.avatarKey })
      .from(schema.applicationChecks).innerJoin(schema.applications, eq(schema.applicationChecks.applicationId, schema.applications.id))
      .innerJoin(schema.merchants, eq(schema.applications.merchantId, schema.merchants.id)).leftJoin(schema.users, eq(schema.merchants.ownerId, schema.users.id))
      .where(and(eq(schema.applicationChecks.status, "Failed"), inArray(schema.applications.status, ["Pending", "Underwriting"]), mScope)).limit(6) : [],
    can(user.role, "chargebacks.view") ? db.select({ c: schema.chargebacks, dba: schema.merchants.dbaName, owner: schema.users.name, color: schema.users.avatarColor, photo: schema.users.avatarKey })
      .from(schema.chargebacks).leftJoin(schema.merchants, eq(schema.chargebacks.merchantId, schema.merchants.id)).leftJoin(schema.users, eq(schema.merchants.ownerId, schema.users.id))
      .where(and(eq(schema.chargebacks.status, "Processed"), lte(schema.chargebacks.respondBy, cbDueBy), mScope)).orderBy(asc(schema.chargebacks.respondBy)).limit(6) : [],
    can(user.role, "tickets.view") ? db.select({ t: schema.tickets, dba: schema.merchants.dbaName, owner: schema.users.name, color: schema.users.avatarColor, photo: schema.users.avatarKey })
      .from(schema.tickets).leftJoin(schema.merchants, eq(schema.tickets.merchantId, schema.merchants.id)).leftJoin(schema.users, eq(schema.tickets.assigneeId, schema.users.id))
      .where(and(ne(schema.tickets.status, "Closed"), isNull(schema.tickets.firstResponseAt), lte(schema.tickets.slaDueAt, new Date(Date.now() + g.ticketSlaWarnMinutes * 60_000)), mScope)).orderBy(asc(schema.tickets.slaDueAt)).limit(6) : [],
    db.select({ act: schema.activities, dba: schema.merchants.dbaName, owner: schema.users.name, color: schema.users.avatarColor, photo: schema.users.avatarKey })
      .from(schema.activities).innerJoin(schema.merchants, eq(schema.activities.merchantId, schema.merchants.id)).leftJoin(schema.users, eq(schema.merchants.ownerId, schema.users.id))
      .where(and(dsql`${schema.activities.title} ilike 'High-risk%'`, gte(schema.activities.occurredAt, new Date(Date.now() - 7 * 86_400_000)), mScope)).orderBy(desc(schema.activities.occurredAt)).limit(3),
  ]);

  type Att = { key: string; href: string; icon: typeof Clock; tone: string; title: string; sub: string; status: string; statusLabel: string; owner?: string | null; color?: string | null; photo?: string | null };
  const att: Att[] = [
    ...cbDue.map((r) => { const d = daysUntil(r.c.respondBy); return { key: "cb" + r.c.id, href: `/ase/chargebacks?cb=${r.c.id}`, icon: RotateCcw, tone: "t-red", title: `Chargeback ${d !== null && d <= 0 ? "due today" : `due in ${d} day${d === 1 ? "" : "s"}`} — ${r.dba ?? "Unknown merchant"}`, sub: `${r.c.caseId} · ${usd(r.c.amount)} · ${r.c.reason ?? ""} · respond by ${fmtDate(r.c.respondBy)}`, status: "Overdue", statusLabel: "Due soon", owner: r.owner, color: r.color, photo: r.photo }; }),
    ...slaBreach.map((r) => { const mins = Math.round(((r.t.slaDueAt?.getTime() ?? 0) - Date.now()) / 60000); return { key: "t" + r.t.id, href: `/ase/support?t=${r.t.id}`, icon: MessageCircle, tone: mins < 0 ? "t-red" : "t-amber", title: `Ticket ${mins < 0 ? "breaching SLA" : "at risk"} — ${r.dba ?? r.t.subject}`, sub: `${r.t.number} · ${r.t.subject} · first response ${mins < 0 ? `${minutesLabel(mins)} overdue` : `due in ${minutesLabel(mins)}`}`, status: mins < 0 ? "SLA breached" : "On Hold", statusLabel: mins < 0 ? "SLA breached" : "At risk", owner: r.owner, color: r.color, photo: r.photo }; }),
    ...failedChecks.map((r) => ({ key: "fc" + r.a.id, href: `/ase/applications/${r.a.id}`, icon: XCircle, tone: "t-red", title: `${r.dba} — underwriting check failed`, sub: `${r.a.number} · ${r.check}${r.detail ? ` · ${r.detail}` : ""}`, status: "Failed", statusLabel: "Failed", owner: r.owner, color: r.color, photo: r.photo })),
    ...stuck.map((r) => ({ key: "st" + r.a.id, href: `/ase/applications/${r.a.id}`, icon: Clock, tone: "t-amber", title: `${r.dba} — ${r.a.status} ${daysSince(r.a.statusChangedAt)} days`, sub: `${r.a.number} · over the ${g.stuckApplicationDays}-day target · signature ${r.a.signatureStatus.toLowerCase()}`, status: r.a.status, statusLabel: r.a.status, owner: r.owner, color: r.color, photo: r.photo })),
    ...riskEvents.map((r) => ({ key: "r" + r.act.id, href: `/ase/merchants/${r.act.merchantId}?tab=activity`, icon: ShieldAlert, tone: "t-amber", title: `High-risk authorization warning — ${r.dba}`, sub: r.act.title, status: "On Hold", statusLabel: "Review", owner: r.owner, color: r.color, photo: r.photo })),
  ];

  // ── Tasks ───────────────────────────────────────────────────────────────────
  const endOfDay = new Date(); endOfDay.setHours(23, 59, 59, 999);
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const tasks = await db.select({ t: schema.tasks, dba: schema.merchants.dbaName }).from(schema.tasks).leftJoin(schema.merchants, eq(schema.tasks.merchantId, schema.merchants.id))
    .where(and(eq(schema.tasks.assigneeId, user.id), lte(schema.tasks.dueAt, endOfDay), or(isNull(schema.tasks.completedAt), gte(schema.tasks.completedAt, startOfDay))))
    .orderBy(asc(schema.tasks.dueAt)).limit(12);

  // ── Pipeline + volume ────────────────────────────────────────────────────────
  const pipeRows = can(user.role, "deals.view") ? await db.select({ stage: schema.deals.stage, amt: dsql<number>`coalesce(sum(${schema.deals.amount}),0)::float`, n: count() })
    .from(schema.deals).where(and(notInArray(schema.deals.stage, ["won", "lost"]), owners ? inArray(schema.deals.ownerId, owners) : undefined)).groupBy(schema.deals.stage) : [];
  const stages = ["new_lead", "contacted", "qualified", "proposal", "application_sent"] as const;
  const pipe = stages.map((s) => { const r = pipeRows.find((p) => p.stage === s); const a = r?.amt ?? 0; return { s, label: STAGE_LABEL[s]!, prob: STAGE_PROB[s]!, amount: a, weighted: a * STAGE_PROB[s]!, n: r?.n ?? 0 }; });
  const pipeMax = Math.max(1, ...pipe.map((p) => p.amount));
  const pipeW = pipe.reduce((a, p) => a + p.weighted, 0), pipeU = pipe.reduce((a, p) => a + p.amount, 0);
  const months = await volumeByMonth(owners, 12);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const projected = volCur.amount && now.getDate() > 1 ? (volCur.amount / (now.getDate() - 1)) * daysInMonth : null;
  const trend = months.map((m, i) => ({ label: m.label, value: i === months.length - 1 ? null : m.amount, projected: i === months.length - 2 ? m.amount : i === months.length - 1 ? projected : null }));

  // ── Team performance (managers) ─────────────────────────────────────────────
  const team = !owners && can(user.role, "reports.view") ? await db.select({
    id: schema.users.id, name: schema.users.name, color: schema.users.avatarColor, photo: schema.users.avatarKey, role: schema.users.role, parent: schema.users.parentAgentId,
    merchants: dsql<number>`(select count(*)::int from merchants m where m.owner_id = "users"."id" and m.status = 'live')`,
    volume: dsql<number>`(select coalesce(sum(dm.sales_amount),0)::float from daily_metrics dm join merchant_accounts ma on ma.id = dm.merchant_account_id join merchants m on m.id = ma.merchant_id where m.owner_id = "users"."id" and dm.day >= ${mStart.toISOString().slice(0, 10)})`,
    apps: dsql<number>`(select count(*)::int from applications a join merchants m on m.id = a.merchant_id where m.owner_id = "users"."id" and a.created_at >= ${mStart.toISOString()})`,
    deals: dsql<number>`(select count(*)::int from deals d where d.owner_id = "users"."id" and d.stage not in ('won','lost'))`,
    residual: dsql<number>`(select coalesce(sum(r.profit),0)::float from residual_lines r where r.agent_id = "users"."id" and r.period = ${lastPeriod})`,
  }).from(schema.users).where(and(eq(schema.users.role, "agent"), ne(schema.users.status, "disabled"))).orderBy(asc(schema.users.name)) : [];

  const hello = now.getHours() < 12 ? "Good morning" : now.getHours() < 18 ? "Good afternoon" : "Good evening";
  return (
    <div className="content">
      {sp.denied && <Banner tone="amber" title="You don’t have access to that page" icon={AlertTriangle}>Your role ({ROLE_LABEL[user.role]}) doesn’t include it. Ask an admin if you need it.</Banner>}
      <div className="ph">
        <div>
          <h1>{hello}, {user.name.split(" ")[0]}</h1>
          <div className="sub">{fmtDate(now)} · {owners ? "Your book of merchants" : "Whole portfolio"}</div>
        </div>
      </div>

      <section className="kpis" aria-label="Key metrics">
        <Kpi label={owners ? "My active merchants" : "Active merchants"} value={num(activeRow[0]?.n ?? 0)} delta={`${newLiveRow[0]?.n ?? 0}`} deltaDir={(newLiveRow[0]?.n ?? 0) > 0 ? "up" : "flat"} sub="went live this month" href="/ase/merchants?status=live" />
        <Kpi label={`Volume · ${monthName(mStart)} MTD`} value={short(volCur.amount)} delta={vDelta === null ? undefined : pct(Math.abs(vDelta))} deltaDir={vDelta === null ? "flat" : vDelta >= 0 ? "up" : "dn"} sub={`vs ${short(volPrev.amount)} ${monthName(prevStart)} MTD`} href="/ase/reports" />
        <Kpi label="New applications" value={num(appsCur[0]?.n ?? 0)} delta={`${Math.abs(appsDelta)}`} deltaDir={appsDelta > 0 ? "up" : appsDelta < 0 ? "dn" : "flat"} sub={`vs ${appsPrev[0]?.n ?? 0} in ${monthName(prevStart)}`} href="/ase/applications" />
        <Kpi label="Approval rate · 90 days" value={approvalRate === null ? "—" : pct(approvalRate)} sub={`${approved} approved · ${declined} declined`} href="/ase/reports?tab=pipeline" />
        <Kpi label="Open tickets" value={num(ticketsOpen[0]?.n ?? 0)} delta={`${ticketsRisk[0]?.n ?? 0}`} deltaDir={(ticketsRisk[0]?.n ?? 0) > 0 ? "dn" : "flat"} sub="at SLA risk" href="/ase/support" />
        <Kpi label="Open chargebacks" value={num(cbOpen[0]?.n ?? 0)} sub={`${usd(cbOpen[0]?.amt ?? 0)} disputed`} href="/ase/chargebacks" />
        <Kpi label={`Residuals · ${monthName(prevStart)}`} value={usd(resLast.profit)} delta={rDelta === null ? undefined : pct(Math.abs(rDelta))} deltaDir={rDelta === null ? "flat" : rDelta >= 0 ? "up" : "dn"} sub="vs prior month" href="/ase/residuals" />
      </section>

      <div className="g-main">
        <Card title={<>Needs attention <span className="ct">{att.length}</span></>} id="att-h">
          {att.length === 0 && <div className="card-b subtle">Nothing needs attention right now.</div>}
          {att.map((a) => (
            <Link key={a.key} className="att" href={a.href}>
              <span className={`ai ${a.tone}`}><a.icon size={14} aria-hidden="true" /></span>
              <span style={{ minWidth: 0 }}><span className="t1" style={{ display: "block" }}>{a.title}</span><span className="t2" style={{ display: "block" }}>{a.sub}</span></span>
              <span className="row" style={{ gap: 10 }}><Pill status={a.status} label={a.statusLabel} />{a.owner && <Avatar initials={initialsOf(a.owner)} color={a.color} avatarKey={a.photo} title={a.owner} />}</span>
            </Link>
          ))}
        </Card>
        <TasksCard openNew={sp.task === "new"} tasks={tasks.map((r) => ({ id: r.t.id, title: r.t.title, detail: r.t.detail ?? r.dba ?? "", due: r.t.dueAt?.toISOString() ?? null, done: !!r.t.completedAt }))} />
      </div>

      <div className="grid2">
        {can(user.role, "deals.view") && (
          <Card title="Weighted pipeline" actions={<span className="subtle sm">Est. monthly volume × stage probability</span>} bodyClass="card-b">
            <div className="row" style={{ gap: 24, marginBottom: 12 }}>
              <div><div className="subtle sm">Weighted total</div><div className="num" style={{ fontSize: 18, fontWeight: 600 }}>{short(pipeW)}</div></div>
              <div><div className="subtle sm">Unweighted</div><div className="num" style={{ fontSize: 18, fontWeight: 600, color: "var(--ink-2)" }}>{short(pipeU)}</div></div>
              <span className="sp" />
              <div className="legend"><span><i className="lg0" />Amount</span><span><i className="lg1" />Weighted</span></div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }} role="img" aria-label={`Weighted pipeline ${short(pipeW)} of ${short(pipeU)}`}>
              {pipe.map((p) => (
                <Link href="/ase/deals" key={p.s} className="hbar" style={{ textDecoration: "none", color: "var(--ink)" }}>
                  <div><div style={{ fontWeight: 500, fontSize: 12 }}>{p.label}</div><div className="subtle" style={{ fontSize: 11 }}>{Math.round(p.prob * 100)}% · {p.n} deal{p.n === 1 ? "" : "s"}</div></div>
                  <div className="tr2"><div className="bk" style={{ width: `${(p.amount / pipeMax) * 58}%` }}><div className="fg" style={{ width: `${p.prob * 100}%` }} /></div>
                    <span className="sm num"><b style={{ fontWeight: 600 }}>{short(p.weighted)}</b> <span className="subtle">of {short(p.amount)}</span></span></div>
                </Link>
              ))}
            </div>
          </Card>
        )}
        <Card title="Monthly processing volume" actions={<span className="subtle sm">{owners ? "Your book" : "Portfolio"} · current month projected</span>} bodyClass="card-b">
          <TrendChart data={trend} label="Volume" />
        </Card>
      </div>

      {team.length > 0 && (
        <Card title={`Team performance · ${monthName(mStart)}`} actions={<Link className="lnk" href="/ase/reports">Open report</Link>} className="lv">
          <div className="tblw">
            <table className="tbl">
              <thead><tr><th>Agent</th><th>Role</th><th className="r">Active merchants</th><th className="r">Volume MTD</th><th className="r">New apps</th><th className="r">Open deals</th><th className="r">Residuals ({monthName(prevStart)})</th></tr></thead>
              <tbody>
                {team.map((t) => (
                  <tr key={t.id}><td><Who name={t.name} color={t.color} avatarKey={t.photo} /></td><td className="muted">{t.parent ? "Sub-agent" : "Agent"}</td><td className="r">{t.merchants}</td><td className="r">{short(t.volume)}</td><td className="r">{t.apps}</td><td className="r">{t.deals}</td><td className="r">{usd(t.residual)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
