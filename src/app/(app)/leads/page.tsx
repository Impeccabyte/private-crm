import Link from "next/link";
import { and, asc, count, desc, eq, ilike, inArray, isNull, lt, or, sql as dsql, type SQL } from "drizzle-orm";
import { Columns3, Download, FileText, Plus, UserPlus } from "lucide-react";
import { db, schema } from "@/db";
import { requirePage, scopeOwnerIds, initialsOf } from "@/lib/dal";
import { can } from "@/lib/rbac";
import { getSetting } from "@/lib/settings";
import { fmtDate, relTime, SOURCE_LABEL, usd } from "@/lib/format";
import { Avatar, Empty, PageHeader } from "@/components/ui";
import { BulkBar, ColumnChooser, DensityToggle, KeyNavTable, SavedViews, SelectAll } from "@/components/list";
import { bulkAssignLeads } from "./actions";
import { NewLeadSheet } from "./NewLeadSheet";
import { LeadSheet } from "./LeadSheet";

export const metadata = { title: "Leads" };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePage("leads.view");
  const sp = await searchParams;
  const owners = await scopeOwnerIds(user);
  const g = await getSetting("general");
  const staleBefore = new Date(Date.now() - g.staleLeadDays * 86_400_000);
  const score = dsql<number>`(${schema.leads.scoreFit} + ${schema.leads.scoreVolume} + ${schema.leads.scoreEngagement} + ${schema.leads.scoreSource})`;
  const nextTask = dsql<string | null>`(select t.title || ' · ' || to_char(t.due_at, 'Mon DD') from tasks t where t.lead_id = "leads"."id" and t.completed_at is null order by t.due_at limit 1)`;
  const q = sp.q?.trim();

  const base: (SQL | undefined)[] = [owners ? inArray(schema.leads.ownerId, owners) : undefined];
  const where = and(...base,
    sp.view === "disqualified" ? eq(schema.leads.status, "disqualified") : sp.view === "converted" ? eq(schema.leads.status, "converted") : eq(schema.leads.status, "open"),
    sp.view === "mine" ? eq(schema.leads.ownerId, user.id) : undefined,
    sp.view === "hot" ? dsql`${score} >= 70` : undefined,
    sp.view === "stale" ? or(lt(schema.leads.lastActivityAt, staleBefore), isNull(schema.leads.lastActivityAt)) : undefined,
    sp.source && sp.source in SOURCE_LABEL ? eq(schema.leads.source, sp.source as "referral") : undefined,
    q ? or(ilike(schema.leads.businessName, `%${q}%`), ilike(schema.leads.contactName, `%${q}%`), ilike(schema.leads.email, `%${q}%`)) : undefined,
  );
  const sort = sp.sort === "score" ? desc(score) : sp.sort === "volume" ? desc(schema.leads.estMonthlyVolume) : desc(schema.leads.updatedAt);
  const rows = await db.select({ l: schema.leads, owner: schema.users.name, color: schema.users.avatarColor, photo: schema.users.avatarKey, score, nextTask })
    .from(schema.leads).leftJoin(schema.users, eq(schema.leads.ownerId, schema.users.id)).where(where).orderBy(sort).limit(200);

  const vc = async (w?: SQL) => (await db.select({ n: count() }).from(schema.leads).where(and(...base, eq(schema.leads.status, "open"), w)))[0]!.n;
  const [cAll, cMine, cHot, cStale] = await Promise.all([vc(), vc(eq(schema.leads.ownerId, user.id)), vc(dsql`${score} >= 70`), vc(or(lt(schema.leads.lastActivityAt, staleBefore), isNull(schema.leads.lastActivityAt)))]);
  const agents = owners ? [] : await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(eq(schema.users.role, "agent")).orderBy(asc(schema.users.name));
  const canEdit = can(user.role, "leads.edit");
  const qs = (extra: Record<string, string | undefined>) => `?${new URLSearchParams(Object.entries({ ...sp, ...extra }).filter(([, v]) => v) as [string, string][])}`;
  const COLS = [{ key: "contact", label: "Contact" }, { key: "source", label: "Source" }, { key: "mcc", label: "Industry / MCC" }, { key: "vol", label: "Est. monthly volume" }, { key: "proc", label: "Current processor" }, { key: "score", label: "Lead score" }, { key: "owner", label: "Owner" }, { key: "last", label: "Last activity" }, { key: "next", label: "Next task" }];

  return (
    <div className="content">
      <PageHeader title="Leads" sub={owners ? "Your leads and your sub-agents’ leads" : `${cAll} open leads`}
        actions={<>
          {can(user.role, "leadforms.manage") && <Link className="btn" href="/leads/forms"><FileText size={14} aria-hidden="true" />Forms</Link>}
          <Link className="btn" href="/deals"><Columns3 size={14} aria-hidden="true" />Pipeline</Link>
          {canEdit && <Link className="btn pri" href={qs({ new: "1", lead: undefined })} scroll={false}><Plus size={16} aria-hidden="true" />New lead</Link>}
        </>} />
      <section className="card lv" aria-label="Leads list">
        <div className="lt">
          <SavedViews id="leads" base="/leads" views={[
            { label: "All open", query: "", count: cAll }, { label: "My leads", query: "view=mine", count: cMine },
            { label: "Hot · score 70+", query: "view=hot", count: cHot }, { label: `No activity ${g.staleLeadDays}+ days`, query: "view=stale", count: cStale },
            { label: "Disqualified", query: "view=disqualified" },
          ]} />
          <span className="sp" />
          <form method="get" className="row" style={{ gap: 6 }}>
            {sp.view && <input type="hidden" name="view" value={sp.view} />}
            <label className="inpw" style={{ width: 200 }}><span className="sr">Search leads</span><input name="q" defaultValue={q ?? ""} placeholder="Search leads" /></label>
            <select name="source" className="inp" defaultValue={sp.source ?? ""} aria-label="Source"><option value="">Any source</option>{Object.entries(SOURCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <select name="sort" className="inp" defaultValue={sp.sort ?? ""} aria-label="Sort"><option value="">Recently updated</option><option value="score">Highest score</option><option value="volume">Highest volume</option></select>
            <button className="btn" type="submit">Apply</button>
          </form>
          <ColumnChooser tableId="leads-table" columns={COLS} />
          <DensityToggle />
          {can(user.role, "export") && <a className="btn" href="/api/export/leads"><Download size={14} aria-hidden="true" />Export CSV</a>}
        </div>
        {!owners && canEdit && (
          <BulkBar form="bulk-leads">
            <form id="bulk-leads" action={bulkAssignLeads} className="row" style={{ gap: 6 }}>
              <select name="ownerId" className="inp" defaultValue="" aria-label="Assign owner" style={{ height: 26 }}><option value="" disabled>Assign owner…</option>{agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
              <button className="btn sm" type="submit">Assign</button>
            </form>
          </BulkBar>
        )}
        {rows.length === 0 ? (
          <Empty icon={UserPlus} title={q || sp.view || sp.source ? "No leads match" : "No leads yet"} actions={canEdit ? <Link className="btn pri" href={qs({ new: "1" })}>New lead</Link> : undefined}>
            {q || sp.view || sp.source ? "Try another view or clear the filters." : "Add leads by hand, or post web-form leads to the intake API."}
          </Empty>
        ) : (
          <KeyNavTable>
            <table className="tbl" id="leads-table">
              <thead><tr>
                {!owners && canEdit && <th className="w0"><SelectAll form="bulk-leads" label="Select all leads" /></th>}
                <th>Business</th><th className="col-contact">Contact</th><th className="col-source">Source</th><th className="col-mcc">Industry / MCC</th><th className="r col-vol">Est. monthly volume</th>
                <th className="col-proc">Current processor</th><th className="col-score">Lead score</th><th className="col-owner">Owner</th><th className="col-last">Last activity</th><th className="col-next">Next task</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.l.id} className={sp.lead === r.l.id ? "sel" : ""}>
                    {!owners && canEdit && <td><input type="checkbox" name="ids" value={r.l.id} form="bulk-leads" aria-label={`Select ${r.l.businessName}`} /></td>}
                    <td><span className="row" style={{ gap: 6 }}><Link className="rl" data-nav href={qs({ lead: r.l.id, new: undefined })} scroll={false}>{r.l.businessName}</Link>{r.l.merchantId && <span className="tag acc">Existing merchant</span>}</span></td>
                    <td className="col-contact">{r.l.contactName ?? "—"}</td>
                    <td className="col-source"><span className="tag">{SOURCE_LABEL[r.l.source]}</span></td>
                    <td className="col-mcc"><span className="muted">{r.l.industry ?? "—"}</span> <span className="subtle mono">{r.l.mcc}</span></td>
                    <td className="r col-vol">{usd(r.l.estMonthlyVolume)}</td>
                    <td className="muted col-proc">{r.l.currentProcessor ?? "—"}</td>
                    <td className="col-score">
                      <span className="tipw">
                        <button type="button" className="score" aria-describedby={`tip-${r.l.id}`}><span className="bar"><i style={{ width: `${r.score}%` }} /></span>{r.score}</button>
                        <span className="tip right" role="tooltip" id={`tip-${r.l.id}`}>
                          <b style={{ display: "block", marginBottom: 6 }}>Lead score {r.score} / 100</b>
                          <span className="tr"><span className="muted">Industry fit (MCC)</span><span>+{r.l.scoreFit}</span></span>
                          <span className="tr"><span className="muted">Est. volume</span><span>+{r.l.scoreVolume}</span></span>
                          <span className="tr"><span className="muted">Engagement</span><span>+{r.l.scoreEngagement}</span></span>
                          <span className="tr"><span className="muted">Source quality</span><span>+{r.l.scoreSource}</span></span>
                        </span>
                      </span>
                    </td>
                    <td className="col-owner">{r.owner ? <span className="who"><Avatar initials={initialsOf(r.owner)} color={r.color} avatarKey={r.photo} />{r.owner}</span> : "—"}</td>
                    <td className="muted col-last">{r.l.lastActivityNote ? `${r.l.lastActivityNote} · ` : ""}{relTime(r.l.lastActivityAt)}</td>
                    <td className="col-next">{r.nextTask ?? <span className="subtle">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </KeyNavTable>
        )}
        <div className="lfoot"><span>Showing {rows.length} lead{rows.length === 1 ? "" : "s"} · ↑/↓ moves between rows</span><span>Updated {fmtDate(new Date())}</span></div>
      </section>
      {sp.new && canEdit && <NewLeadSheet closeHref={qs({ new: undefined })} agents={agents} />}
      {sp.lead && <LeadSheet id={sp.lead} closeHref={qs({ lead: undefined })} />}
    </div>
  );
}
