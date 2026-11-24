import Link from "next/link";
import { and, asc, count, desc, eq, ilike, inArray, isNotNull, isNull, or, sql as dsql, type SQL } from "drizzle-orm";
import { Download, Plus, Store } from "lucide-react";
import { db, schema } from "@/db";
import { requirePage, scopeOwnerIds, initialsOf } from "@/lib/dal";
import { can } from "@/lib/rbac";
import { MERCHANT_STATUS_LABEL, num, signedPct, usd } from "@/lib/format";
import { Avatar, Banner, Empty, PageHeader, Pill, Proc } from "@/components/ui";
import { BulkBar, ColumnChooser, DensityToggle, KeyNavTable, SavedViews, SelectAll } from "@/components/list";
import { bulkReassign } from "./actions";
import { BulkHide } from "./BulkHide";
import { NewMerchantSheet } from "./NewMerchantSheet";

export const metadata = { title: "Merchants" };
const PER = 50;

export default async function MerchantsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePage("merchants.view");
  const sp = await searchParams;
  const owners = await scopeOwnerIds(user);
  const page = Math.max(1, Number(sp.page) || 1);
  const status = sp.status && sp.status in MERCHANT_STATUS_LABEL ? (sp.status as "live") : undefined;
  const q = sp.q?.trim();

  const d30 = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const d60 = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);
  const d90 = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const vol30 = dsql<number>`(select coalesce(sum(dm.sales_amount),0)::float from daily_metrics dm join merchant_accounts ma on ma.id = dm.merchant_account_id where ma.merchant_id = "merchants"."id" and dm.day >= ${d30})`;
  const prev30 = dsql<number>`(select coalesce(sum(dm.sales_amount),0)::float from daily_metrics dm join merchant_accounts ma on ma.id = dm.merchant_account_id where ma.merchant_id = "merchants"."id" and dm.day >= ${d60} and dm.day < ${d30})`;
  const txn30 = dsql<number>`(select coalesce(sum(dm.sales_count),0)::int from daily_metrics dm join merchant_accounts ma on ma.id = dm.merchant_account_id where ma.merchant_id = "merchants"."id" and dm.day >= ${d30})`;
  const cb90 = dsql<number>`(select count(*)::int from chargebacks c where c.merchant_id = "merchants"."id" and c.received_at >= ${d90})`;
  const txn90 = dsql<number>`(select coalesce(sum(dm.sales_count),0)::int from daily_metrics dm join merchant_accounts ma on ma.id = dm.merchant_account_id where ma.merchant_id = "merchants"."id" and dm.day >= ${d90})`;
  const mid = dsql<string | null>`(select ma.mid from merchant_accounts ma where ma.merchant_id = "merchants"."id" order by ma.created_at limit 1)`;
  const midCount = dsql<number>`(select count(*)::int from merchant_accounts ma where ma.merchant_id = "merchants"."id")`;

  const hiddenView = sp.view === "hidden";
  const inactiveSql = dsql`${schema.merchants.status} = 'boarding' and (select count(*) from applications a where a.merchant_id = "merchants"."id") = 1 and exists (select 1 from applications a where a.merchant_id = "merchants"."id" and a.status = 'Cancelled') and not exists (select 1 from merchant_accounts ma where ma.merchant_id = "merchants"."id") and not exists (select 1 from chargebacks c where c.merchant_id = "merchants"."id")`;
  const filters: (SQL | undefined)[] = [
    owners ? inArray(schema.merchants.ownerId, owners) : undefined,
    hiddenView ? isNotNull(schema.merchants.hiddenAt) : isNull(schema.merchants.hiddenAt),
    sp.view === "inactive" ? inactiveSql : undefined,
    status ? eq(schema.merchants.status, status) : undefined,
    sp.owner ? eq(schema.merchants.ownerId, sp.owner) : undefined,
    sp.mcc ? eq(schema.merchants.mcc, sp.mcc) : undefined,
    sp.view === "cb" ? dsql`${cb90} > 0` : undefined,
    sp.view === "down" ? dsql`${prev30} > 0 and ${vol30} < ${prev30} * 0.9` : undefined,
    q ? or(ilike(schema.merchants.dbaName, `%${q}%`), ilike(schema.merchants.city, `%${q}%`), dsql`exists (select 1 from merchant_accounts ma where ma.merchant_id = "merchants"."id" and ma.mid like ${`%${q.replace(/\D/g, "") || "~"}%`})`) : undefined,
  ];
  const where = and(...filters);
  const sortCol = { volume: desc(vol30), name: asc(schema.merchants.dbaName), status: asc(schema.merchants.status) }[sp.sort ?? "name"] ?? asc(schema.merchants.dbaName);

  let rows: Awaited<ReturnType<typeof load>> = [];
  let total = 0, loadError: string | null = null;
  async function load() {
    return db.select({ m: schema.merchants, legal: schema.legalEntities.legalName, owner: schema.users.name, ownerColor: schema.users.avatarColor, ownerPhoto: schema.users.avatarKey, vol30, prev30, txn30, cb90, txn90, mid, midCount })
      .from(schema.merchants).leftJoin(schema.legalEntities, eq(schema.merchants.legalEntityId, schema.legalEntities.id)).leftJoin(schema.users, eq(schema.merchants.ownerId, schema.users.id))
      .where(where).orderBy(sortCol).limit(PER).offset((page - 1) * PER);
  }
  try {
    [rows, [{ n: total }]] = await Promise.all([load(), db.select({ n: count() }).from(schema.merchants).where(where) as Promise<{ n: number }[]>]);
  } catch (e) {
    loadError = (e as Error).message;
  }

  const ownerScope = owners ? inArray(schema.merchants.ownerId, owners) : undefined;
  const [counts, [hiddenCount], [inactiveCount]] = await Promise.all([
    db.select({ status: schema.merchants.status, n: count() }).from(schema.merchants).where(and(ownerScope, isNull(schema.merchants.hiddenAt))).groupBy(schema.merchants.status),
    db.select({ n: count() }).from(schema.merchants).where(and(ownerScope, isNotNull(schema.merchants.hiddenAt))),
    db.select({ n: count() }).from(schema.merchants).where(and(ownerScope, isNull(schema.merchants.hiddenAt), inactiveSql)),
  ]);
  const c = (s: string) => counts.find((x) => x.status === s)?.n ?? 0;
  const agents = owners ? [] : await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(eq(schema.users.role, "agent")).orderBy(asc(schema.users.name));
  const canEdit = can(user.role, "merchants.edit");
  const canHide = can(user.role, "merchants.hide");
  const qs = (extra: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...extra }).filter(([, v]) => v !== undefined && v !== "") as [string, string][]);
    return `?${p}`;
  };
  const pages = Math.max(1, Math.ceil(total / PER));
  const COLS = [{ key: "status", label: "Status" }, { key: "mid", label: "MID" }, { key: "mcc", label: "MCC" }, { key: "loc", label: "Location" }, { key: "owner", label: "Owner" }, { key: "vol", label: "30-day volume" }, { key: "delta", label: "vs prior 30" }, { key: "txn", label: "Transactions" }, { key: "cbr", label: "CB ratio" }];

  return (
    <div className="content">
      <PageHeader title="Merchants" sub={`${num(c("live"))} live · ${num(c("boarding"))} boarding · ${num(c("prospect"))} prospects · ${num(c("closed"))} closed${owners ? " · your book" : ""}`}
        actions={canEdit ? <Link className="btn pri" href={qs({ new: "1" })} scroll={false}><Plus size={16} aria-hidden="true" />New merchant</Link> : undefined} />
      {hiddenView && <Banner tone="blue" title="Hidden merchants">Inactive boarding records kept out of lists, search, pickers and exports. Nothing is deleted. Select any to unhide them.</Banner>}
      <section className="card lv" aria-label="Merchants list" aria-busy={false}>
        <div className="lt">
          <SavedViews id="merchants" base="/merchants" views={[
            { label: "All merchants", query: "", count: c("live") + c("boarding") + c("prospect") + c("closed") },
            { label: "Live", query: "status=live", count: c("live") },
            { label: "Boarding", query: "status=boarding", count: c("boarding") },
            { label: "Prospects", query: "status=prospect", count: c("prospect") },
            { label: "Chargebacks · 90d", query: "view=cb" },
            { label: "Volume down 10%+", query: "view=down" },
            ...(canHide ? [{ label: "Cancelled boarding", query: "view=inactive", count: inactiveCount!.n }, { label: "Hidden", query: "view=hidden", count: hiddenCount!.n }] : []),
          ]} />
          <span className="sp" />
          <form method="get" className="row" style={{ gap: 6 }}>
            {status && <input type="hidden" name="status" value={status} />}
            <label className="inpw" style={{ width: 220 }}><span className="sr">Search merchants</span><input name="q" defaultValue={q ?? ""} placeholder="DBA, MID, city…" /></label>
            {!owners && (
              <select name="owner" className="inp" defaultValue={sp.owner ?? ""} aria-label="Filter by owner">
                <option value="">Any owner</option>{agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            )}
            <select name="sort" className="inp" defaultValue={sp.sort ?? "name"} aria-label="Sort"><option value="name">Sort: name</option><option value="volume">Sort: 30-day volume</option><option value="status">Sort: status</option></select>
            <button className="btn" type="submit">Apply</button>
          </form>
          <ColumnChooser tableId="merchants-table" columns={COLS} />
          <DensityToggle />
          {can(user.role, "export") && <a className="btn" href={`/api/export/merchants${status ? `?status=${status}` : ""}`}><Download size={14} aria-hidden="true" />Export CSV</a>}
        </div>
        {(q || sp.owner || sp.mcc) && (
          <div className="chips">
            {q && <span className="chip">Search <b>“{q}”</b><Link href={qs({ q: undefined, page: undefined })} aria-label="Remove search">×</Link></span>}
            {sp.owner && <span className="chip">Owner <b>{agents.find((a) => a.id === sp.owner)?.name ?? "selected"}</b><Link href={qs({ owner: undefined, page: undefined })} aria-label="Remove owner filter">×</Link></span>}
            {sp.mcc && <span className="chip">MCC <b>{sp.mcc}</b><Link href={qs({ mcc: undefined, page: undefined })} aria-label="Remove MCC filter">×</Link></span>}
          </div>
        )}
        {!owners && canEdit && (
          <BulkBar form="bulk-merchants">
            <form id="bulk-merchants" action={bulkReassign} className="row" style={{ gap: 6 }}>
              <select name="ownerId" className="inp" aria-label="Reassign to" defaultValue="" style={{ height: 26 }}><option value="" disabled>Reassign to…</option>{agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
              <button className="btn sm" type="submit">Reassign</button>
            </form>
            {canHide && <BulkHide form="bulk-merchants" mode={hiddenView ? "unhide" : "hide"} />}
          </BulkBar>
        )}

        {loadError ? (
          <Empty icon={Store} title="Couldn’t load merchants" actions={<Link className="btn pri" href={qs({})}>Try again</Link>}>The database query failed. Your filters are kept. Nothing was changed. ({loadError.slice(0, 120)})</Empty>
        ) : rows.length === 0 ? (
          <Empty icon={Store} title={q || status || sp.view ? "No merchants match these filters" : "No merchants yet"}
            actions={<>{(q || status || sp.view) && <Link className="btn" href="/merchants">Clear filters</Link>}{canEdit && <Link className="btn pri" href={qs({ new: "1" })}>New merchant</Link>}</>}>
            {q || status || sp.view ? "Try a different search or clear a filter." : "Add a merchant, or connect Maverick in Settings → Integrations and run a sync to import your portfolio."}
          </Empty>
        ) : (
          <KeyNavTable>
            <table className="tbl" id="merchants-table">
              <thead><tr>
                {!owners && canEdit && <th className="w0"><SelectAll form="bulk-merchants" label="Select all merchants" /></th>}
                <th>DBA</th><th className="col-status">Status</th><th className="col-mid">MID</th><th className="col-mcc">MCC</th><th className="col-loc">Location</th><th className="col-owner">Owner</th>
                <th className="r col-vol">30-day volume</th><th className="r col-delta">vs prior 30</th><th className="r col-txn">Transactions</th><th className="r col-cbr">CB ratio</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => {
                  const d = r.prev30 ? ((r.vol30 - r.prev30) / r.prev30) * 100 : null;
                  const cbr = r.txn90 ? (r.cb90 / r.txn90) * 100 : null;
                  return (
                    <tr key={r.m.id}>
                      {!owners && canEdit && <td><input type="checkbox" name="ids" value={r.m.id} form="bulk-merchants" aria-label={`Select ${r.m.dbaName}`} /></td>}
                      <td style={{ paddingTop: 6, paddingBottom: 6 }}><Link className="rl" data-nav href={`/merchants/${r.m.id}`}>{r.m.dbaName}</Link><div className="subtle sm">{r.legal}</div></td>
                      <td className="col-status"><Pill status={MERCHANT_STATUS_LABEL[r.m.status]!} /></td>
                      <td className="col-mid">{r.mid ? <span className="row" style={{ gap: 6 }}><span className="mono">{r.mid}</span><Proc />{r.midCount > 1 && <span className="subtle sm">+{r.midCount - 1}</span>}</span> : <span className="subtle">—</span>}</td>
                      <td className="mono muted col-mcc"><Link href={qs({ mcc: r.m.mcc ?? undefined, page: undefined })} style={{ color: "inherit", textDecoration: "none" }}>{r.m.mcc ?? "—"}</Link></td>
                      <td className="muted col-loc">{[r.m.city, r.m.state].filter(Boolean).join(", ") || "—"}</td>
                      <td className="col-owner">{r.owner ? <Avatar initials={initialsOf(r.owner)} color={r.ownerColor} avatarKey={r.ownerPhoto} title={r.owner} /> : <span className="subtle">—</span>}</td>
                      <td className="r col-vol">{r.vol30 ? usd(r.vol30) : "—"}</td>
                      <td className="r col-delta"><span className={d === null ? "subtle" : d >= 0 ? "tx-green" : "tx-red"}>{d === null ? "—" : signedPct(d)}</span></td>
                      <td className="r col-txn">{r.txn30 ? num(r.txn30) : "—"}</td>
                      <td className="r col-cbr"><span className={cbr === null ? "subtle" : cbr >= 0.65 ? "tx-red" : cbr >= 0.25 ? "tx-amber" : ""}>{cbr === null ? "—" : `${cbr.toFixed(2)}%`}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </KeyNavTable>
        )}
        <div className="lfoot">
          <span>{total ? `Showing ${(page - 1) * PER + 1}–${Math.min(total, page * PER)} of ${num(total)} · ↑/↓ moves between rows, Enter opens` : ""}</span>
          <span className="row" style={{ gap: 6 }}>
            {page > 1 && <Link className="btn sm" href={qs({ page: page - 1 })}>Previous</Link>}
            <span>Page {page} of {pages}</span>
            {page < pages && <Link className="btn sm" href={qs({ page: page + 1 })}>Next</Link>}
          </span>
        </div>
      </section>
      {sp.new && canEdit && <NewMerchantSheet closeHref={qs({ new: undefined })} agents={agents} />}
    </div>
  );
}
