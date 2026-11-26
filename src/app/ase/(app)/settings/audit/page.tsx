import Link from "next/link";
import { and, desc, eq, ilike, lt } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePage } from "@/lib/dal";
import { fmtDateTime } from "@/lib/format";

export const metadata = { title: "Settings · Audit log" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ q?: string; before?: string }> }) {
  await requirePage("audit.view");
  const sp = await searchParams;
  const rows = await db.select().from(schema.auditLog)
    .where(and(sp.q ? ilike(schema.auditLog.action, `%${sp.q}%`) : undefined, sp.before ? lt(schema.auditLog.id, Number(sp.before)) : undefined))
    .orderBy(desc(schema.auditLog.id)).limit(100);
  void eq;
  return (
    <section className="card lv">
      <div className="card-h"><h2>Audit log</h2><span className="subtle sm">Append-only: entries can’t be edited or deleted</span></div>
      <form className="lt" method="get">
        <label className="inpw" style={{ width: 280 }}><span className="sr">Filter by action</span><input name="q" defaultValue={sp.q ?? ""} placeholder="Filter by action, e.g. sensitive or auth" /></label>
        <button className="btn" type="submit">Filter</button>
        {sp.q && <Link className="btn ghost" href="/ase/settings/audit">Clear</Link>}
      </form>
      <div className="tblw">
        <table className="tbl compact">
          <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th><th>IP</th><th>Details</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="muted">{fmtDateTime(r.at)}</td>
                <td>{r.actorEmail ?? <span className="subtle">system</span>}</td>
                <td className="mono">{r.action}</td>
                <td className="muted">{r.entityType ? `${r.entityType}${r.entityId ? ` · ${r.entityId.slice(0, 8)}` : ""}` : "—"}</td>
                <td className="muted mono">{r.ip ?? "—"}</td>
                <td className="muted"><span className="trunc" title={JSON.stringify(r.details)}>{Object.keys(r.details as object).length ? JSON.stringify(r.details) : ""}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 100 && <div className="lfoot"><span /><Link className="btn sm" href={`?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), before: String(rows[rows.length - 1]!.id) })}`}>Older entries</Link></div>}
    </section>
  );
}
