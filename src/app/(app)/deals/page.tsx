import Link from "next/link";
import { and, asc, eq, inArray, gte, or, notInArray } from "drizzle-orm";
import { Download, Table2 } from "lucide-react";
import { db, schema } from "@/db";
import { requirePage, scopeOwnerIds, initialsOf } from "@/lib/dal";
import { can } from "@/lib/rbac";
import { daysSince, short, STAGE_PROB } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { Kanban } from "./Kanban";

export const metadata = { title: "Deals" };

export default async function DealsPage({ searchParams }: { searchParams: Promise<{ owner?: string }> }) {
  const user = await requirePage("deals.view");
  const sp = await searchParams;
  const owners = await scopeOwnerIds(user);
  const recent = new Date(Date.now() - 30 * 86_400_000);
  const rows = await db.select({ d: schema.deals, owner: schema.users.name, color: schema.users.avatarColor,
    app: schema.applications.number, appId: schema.applications.id, appStatus: schema.applications.status })
    .from(schema.deals).leftJoin(schema.users, eq(schema.deals.ownerId, schema.users.id)).leftJoin(schema.applications, eq(schema.applications.dealId, schema.deals.id))
    .where(and(owners ? inArray(schema.deals.ownerId, owners) : undefined, sp.owner ? eq(schema.deals.ownerId, sp.owner) : undefined,
      or(notInArray(schema.deals.stage, ["won", "lost"]), gte(schema.deals.stageChangedAt, recent))))
    .orderBy(asc(schema.deals.stageChangedAt));
  const agents = owners ? [] : await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(eq(schema.users.role, "agent")).orderBy(asc(schema.users.name));
  const open = rows.filter((r) => !["won", "lost"].includes(r.d.stage));
  const openU = open.reduce((a, r) => a + r.d.amount, 0), openW = open.reduce((a, r) => a + r.d.amount * STAGE_PROB[r.d.stage]!, 0);
  const won = rows.filter((r) => r.d.stage === "won").reduce((a, r) => a + r.d.amount, 0);

  return (
    <div className="content">
      <PageHeader title="Deals" sub={owners ? "Your deals and your sub-agents’" : "All agents · amounts are estimated monthly volume"}
        actions={<>
          <Link className="btn" href="/leads"><Table2 size={14} aria-hidden="true" />Leads table</Link>
          {!owners && (
            <form method="get" className="row" style={{ gap: 6 }}>
              <select name="owner" className="inp" defaultValue={sp.owner ?? ""} aria-label="Owner"><option value="">Everyone</option>{agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
              <button className="btn" type="submit">Filter</button>
            </form>
          )}
          {can(user.role, "export") && <a className="btn" href="/api/export/deals"><Download size={14} aria-hidden="true" />Export CSV</a>}
        </>} />
      <div className="row w" style={{ gap: 20 }}>
        <div><span className="subtle sm">Open pipeline</span> <b className="num">{short(openU)}</b></div>
        <div><span className="subtle sm">Weighted</span> <b className="num">{short(openW)}</b></div>
        <div><span className="subtle sm">Won · last 30 days</span> <b className="num">{short(won)}</b></div>
        <span className="sp" />
        <span className="subtle sm">Drag cards between stages, or use a card’s Move menu. Cards over 14 days in a stage are flagged.</span>
      </div>
      <Kanban canEdit={can(user.role, "deals.edit")} deals={rows.map((r) => ({
        id: r.d.id, name: r.d.name, amount: r.d.amount, stage: r.d.stage, owner: r.owner, ownerIni: r.owner ? initialsOf(r.owner) : "—", color: r.color,
        days: daysSince(r.d.stageChangedAt) ?? 0, lostReason: r.d.lostReason, merchantId: r.d.merchantId, app: r.app ? { id: r.appId!, number: r.app, status: r.appStatus! } : null,
      }))} />
    </div>
  );
}
