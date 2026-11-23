import Link from "next/link";
import { and, asc, desc, eq, gte, inArray, or, sql as dsql, isNull } from "drizzle-orm";
import { AlertTriangle, CheckCircle2, Clock, Download, Info } from "lucide-react";
import { db, schema } from "@/db";
import { requirePage, scopeOwnerIds, initialsOf } from "@/lib/dal";
import { can } from "@/lib/rbac";
import { getSetting } from "@/lib/settings";
import { daysSince } from "@/lib/format";
import { PageHeader, Pill } from "@/components/ui";

export const metadata = { title: "Applications" };
const STATUSES = ["New", "Pending", "Underwriting", "Approved", "Declined", "Cancelled"] as const;
const SUB: Record<string, string> = { New: "Not yet sent to merchant", Pending: "Collecting signatures & documents", Underwriting: "With the processor’s risk team", Approved: "Last 30 days", Declined: "Last 30 days", Cancelled: "Last 30 days" };

export default async function ApplicationsBoard({ searchParams }: { searchParams: Promise<{ view?: string; mine?: string }> }) {
  const user = await requirePage("applications.view");
  const sp = await searchParams;
  const owners = await scopeOwnerIds(user);
  const g = await getSetting("general");
  const recent = new Date(Date.now() - 30 * 86_400_000);
  const failed = dsql<number>`(select count(*)::int from application_checks c where c.application_id = "applications"."id" and c.status = 'Failed')`;
  const missingDocs = dsql<number>`(select count(*)::int from application_documents d where d.application_id = "applications"."id" and d.required and not d.uploaded)`;
  const openConds = dsql<number>`(select count(*)::int from application_conditions c where c.application_id = "applications"."id" and not c.met)`;
  const spec = db.$with("spec").as(db.select({ id: schema.users.id, name: schema.users.name, color: schema.users.avatarColor }).from(schema.users));
  const rows = await db.with(spec).select({ a: schema.applications, dba: schema.merchants.dbaName, mcc: schema.merchants.mcc, agent: schema.users.name, agentColor: schema.users.avatarColor, specName: spec.name, specColor: spec.color, failed, missingDocs, openConds })
    .from(schema.applications).innerJoin(schema.merchants, eq(schema.applications.merchantId, schema.merchants.id))
    .leftJoin(schema.users, eq(schema.merchants.ownerId, schema.users.id)).leftJoin(spec, eq(spec.id, schema.applications.specialistId))
    .where(and(owners ? inArray(schema.merchants.ownerId, owners) : undefined, isNull(schema.merchants.hiddenAt), sp.mine ? eq(schema.applications.specialistId, user.id) : undefined,
      or(inArray(schema.applications.status, ["New", "Pending", "Underwriting"]), gte(schema.applications.statusChangedAt, recent))))
    .orderBy(asc(schema.applications.statusChangedAt));
  const open = rows.filter((r) => ["New", "Pending", "Underwriting"].includes(r.a.status));
  const stuckN = open.filter((r) => (daysSince(r.a.statusChangedAt) ?? 0) > g.stuckApplicationDays).length;
  const sigN = open.filter((r) => r.a.signatureStatus !== "Signed").length;
  const failN = open.filter((r) => r.failed > 0).length;
  const view = sp.view;
  const filtered = rows.filter((r) => view === "stuck" ? ["New", "Pending", "Underwriting"].includes(r.a.status) && (daysSince(r.a.statusChangedAt) ?? 0) > g.stuckApplicationDays
    : view === "signature" ? ["New", "Pending", "Underwriting"].includes(r.a.status) && r.a.signatureStatus !== "Signed"
    : view === "failed" ? r.failed > 0 : true);
  void desc;

  return (
    <div className="content">
      <PageHeader title="Applications" sub={`Boarding pipeline · flagged when a card sits more than ${g.stuckApplicationDays} days in one status`}
        actions={<>
          {user.role === "onboarding" && <Link className={`btn ${sp.mine ? "pri" : ""}`} href={sp.mine ? "/applications" : "/applications?mine=1"}>{sp.mine ? "Showing mine" : "Only mine"}</Link>}
          {can(user.role, "export") && <a className="btn" href="/api/export/applications"><Download size={14} aria-hidden="true" />Export CSV</a>}
          {(can(user.role, "applications.edit") || can(user.role, "deals.edit")) && <Link className="btn pri" href="/applications/new">New application</Link>}
        </>} />
      <div className="views" role="tablist" aria-label="Saved views">
        {[["All open", "", open.length], [`Stuck over ${g.stuckApplicationDays} days`, "stuck", stuckN], ["Waiting on signature", "signature", sigN], ["Failed checks", "failed", failN]].map(([l, v, n]) => (
          <Link key={l as string} href={v ? `/applications?view=${v}` : "/applications"} className={`vt ${(view ?? "") === v ? "on" : ""}`} role="tab" aria-selected={(view ?? "") === v}>{l}<span className="c">{n}</span></Link>
        ))}
      </div>
      <div className="kb" role="list" aria-label="Application statuses" style={{ gridAutoColumns: "minmax(180px, 1fr)" }}>
        {STATUSES.map((st) => {
          const cards = filtered.filter((r) => r.a.status === st);
          return (
            <section key={st} className="col" role="listitem" aria-label={`${st}, ${cards.length} applications`} style={{ minHeight: 560 }}>
              <div className="col-h"><div className="t"><Pill status={st} /><span className="ct">{cards.length}</span></div><div className="m">{SUB[st]}</div></div>
              {cards.map((r) => {
                const days = daysSince(r.a.statusChangedAt) ?? 0;
                const isOpen = ["New", "Pending", "Underwriting"].includes(st);
                const issue = r.failed ? { cls: "tx-red", icon: AlertTriangle, t: `${r.failed} check${r.failed > 1 ? "s" : ""} failed` }
                  : r.openConds ? { cls: "tx-amber", icon: Clock, t: `${r.openConds} open condition${r.openConds > 1 ? "s" : ""}` }
                  : isOpen && r.missingDocs ? { cls: "tx-amber", icon: Clock, t: `${r.missingDocs} document${r.missingDocs > 1 ? "s" : ""} missing` }
                  : st === "Approved" && r.a.firstBatchAt ? { cls: "tx-green", icon: CheckCircle2, t: "First batch received" } : null;
                return (
                  <Link key={r.a.id} className="kc" href={`/applications/${r.a.id}`}>
                    <div><div className="n">{r.dba}</div><div className="subtle sm mono">{r.a.number}{r.mcc ? ` · MCC ${r.mcc}` : ""}</div></div>
                    <div className="row w" style={{ gap: 4 }}><Pill status={r.a.signatureStatus} />{r.a.conditional && <Pill status="Conditional" />}</div>
                    {issue && <div className={issue.cls} style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 12 }}><issue.icon size={12} aria-hidden="true" />{issue.t}</div>}
                    {!issue && r.a.forLabel && r.a.forLabel !== "New merchant" && <div className="muted" style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 12 }}><Info size={12} aria-hidden="true" />{r.a.forLabel}</div>}
                    <div className="meta">
                      {r.agent && <span className={`av ${r.agentColor}`} title={`Agent: ${r.agent}`}>{initialsOf(r.agent)}</span>}
                      {r.specName && <span className={`av ${r.specColor}`} title={`Specialist: ${r.specName}`}>{initialsOf(r.specName)}</span>}
                      <span className="sp" />
                      <span className={isOpen && days > g.stuckApplicationDays ? "over" : isOpen && days > 3 ? "stale" : ""}><Clock size={12} aria-hidden="true" style={{ verticalAlign: -2 }} /> {days === 0 ? "Today" : `${days}d`}</span>
                    </div>
                  </Link>
                );
              })}
              {cards.length === 0 && <div className="subtle sm" style={{ padding: "8px 4px" }}>None</div>}
            </section>
          );
        })}
      </div>
    </div>
  );
}
