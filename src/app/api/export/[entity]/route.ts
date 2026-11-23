/** CSV export for list views. Respects role permissions and agent scoping; every export is audited. */
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCurrentUser, scopeOwnerIds } from "@/lib/dal";
import { can, type Permission } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { requestIp } from "@/lib/session";
import { fmtDate, MERCHANT_STATUS_LABEL, SOURCE_LABEL, STAGE_LABEL, toCsv } from "@/lib/format";

const NEED: Record<string, Permission> = { merchants: "merchants.view", leads: "leads.view", deals: "deals.view", chargebacks: "chargebacks.view", tickets: "tickets.view", residuals: "residuals.view", applications: "applications.view" };

export async function GET(req: Request, ctx: { params: Promise<{ entity: string }> }) {
  const { entity } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const need = NEED[entity];
  if (!need || !can(user.role, need) || !can(user.role, "export")) return new Response("Forbidden", { status: 403 });
  const owners = await scopeOwnerIds(user);
  const mScope = owners ? inArray(schema.merchants.ownerId, owners) : undefined;
  const sp = new URL(req.url).searchParams;
  let headers: string[] = [], rows: unknown[][] = [];

  if (entity === "merchants") {
    const status = sp.get("status");
    const data = await db.select({ m: schema.merchants, owner: schema.users.name, legal: schema.legalEntities.legalName }).from(schema.merchants)
      .leftJoin(schema.users, eq(schema.merchants.ownerId, schema.users.id)).leftJoin(schema.legalEntities, eq(schema.merchants.legalEntityId, schema.legalEntities.id))
      .where(and(mScope, isNull(schema.merchants.hiddenAt), status && status in MERCHANT_STATUS_LABEL ? eq(schema.merchants.status, status as "live") : undefined)).orderBy(schema.merchants.dbaName);
    headers = ["DBA", "Legal name", "Status", "MCC", "City", "State", "Owner", "CS phone", "CS email"];
    rows = data.map((r) => [r.m.dbaName, r.legal, MERCHANT_STATUS_LABEL[r.m.status], r.m.mcc, r.m.city, r.m.state, r.owner, r.m.csPhone, r.m.csEmail]);
  } else if (entity === "leads") {
    const data = await db.select({ l: schema.leads, owner: schema.users.name }).from(schema.leads).leftJoin(schema.users, eq(schema.leads.ownerId, schema.users.id))
      .where(owners ? inArray(schema.leads.ownerId, owners) : undefined).orderBy(desc(schema.leads.createdAt));
    headers = ["Business", "Contact", "Email", "Phone", "Source", "MCC", "Industry", "Est. monthly volume", "Current processor", "Score", "Owner", "Status"];
    rows = data.map((r) => [r.l.businessName, r.l.contactName, r.l.email, r.l.phone, SOURCE_LABEL[r.l.source], r.l.mcc, r.l.industry, r.l.estMonthlyVolume, r.l.currentProcessor, r.l.scoreFit + r.l.scoreVolume + r.l.scoreEngagement + r.l.scoreSource, r.owner, r.l.status]);
  } else if (entity === "deals") {
    const data = await db.select({ d: schema.deals, owner: schema.users.name }).from(schema.deals).leftJoin(schema.users, eq(schema.deals.ownerId, schema.users.id))
      .where(owners ? inArray(schema.deals.ownerId, owners) : undefined);
    headers = ["Deal", "Stage", "Est. monthly volume", "Owner", "In stage since"];
    rows = data.map((r) => [r.d.name, STAGE_LABEL[r.d.stage], r.d.amount, r.owner, fmtDate(r.d.stageChangedAt)]);
  } else if (entity === "chargebacks") {
    const data = await db.select({ c: schema.chargebacks, dba: schema.merchants.dbaName, mid: schema.merchantAccounts.mid }).from(schema.chargebacks)
      .leftJoin(schema.merchants, eq(schema.chargebacks.merchantId, schema.merchants.id)).leftJoin(schema.merchantAccounts, eq(schema.chargebacks.merchantAccountId, schema.merchantAccounts.id))
      .where(mScope).orderBy(desc(schema.chargebacks.receivedAt));
    headers = ["Merchant", "MID", "Case ID", "Amount", "Reason code", "Reason", "Received", "Respond by", "Status"];
    rows = data.map((r) => [r.dba, r.mid, r.c.caseId, r.c.amount, r.c.reasonCode, r.c.reason, r.c.receivedAt, r.c.respondBy, r.c.status]);
  } else if (entity === "tickets") {
    const data = await db.select({ t: schema.tickets, dba: schema.merchants.dbaName, assignee: schema.users.name }).from(schema.tickets)
      .leftJoin(schema.merchants, eq(schema.tickets.merchantId, schema.merchants.id)).leftJoin(schema.users, eq(schema.tickets.assigneeId, schema.users.id)).where(mScope).orderBy(desc(schema.tickets.createdAt));
    headers = ["Ticket", "Merchant", "Subject", "Source", "Status", "Priority", "Assignee", "Created"];
    rows = data.map((r) => [r.t.number, r.dba, r.t.subject, r.t.source, r.t.status, r.t.priority, r.assignee, fmtDate(r.t.createdAt)]);
  } else if (entity === "applications") {
    const data = await db.select({ a: schema.applications, dba: schema.merchants.dbaName }).from(schema.applications)
      .innerJoin(schema.merchants, eq(schema.applications.merchantId, schema.merchants.id)).where(and(mScope, isNull(schema.merchants.hiddenAt))).orderBy(desc(schema.applications.createdAt));
    headers = ["Application", "Merchant", "Status", "Conditional", "Signature", "Created", "Status since"];
    rows = data.map((r) => [r.a.number, r.dba, r.a.status, r.a.conditional ? "Yes" : "No", r.a.signatureStatus, fmtDate(r.a.createdAt), fmtDate(r.a.statusChangedAt)]);
  } else if (entity === "residuals") {
    const period = sp.get("period") ?? "";
    const data = await db.select({ r: schema.residualLines, mid: schema.merchantAccounts.mid, agent: schema.users.name, dba: schema.merchants.dbaName }).from(schema.residualLines)
      .leftJoin(schema.merchantAccounts, eq(schema.residualLines.merchantAccountId, schema.merchantAccounts.id))
      .leftJoin(schema.merchants, eq(schema.merchantAccounts.merchantId, schema.merchants.id)).leftJoin(schema.users, eq(schema.residualLines.agentId, schema.users.id))
      .where(and(period ? eq(schema.residualLines.period, period) : undefined, owners ? inArray(schema.residualLines.agentId, owners) : undefined));
    headers = ["Period", "Agent", "Merchant", "MID", "Sales count", "Sales volume", "Revenue", "Expense", "Split %", "Adjustments", "Profit", "Held", "Held note"];
    rows = data.map((x) => [x.r.period, x.agent, x.dba ?? x.r.label, x.mid, x.r.salesCount, x.r.salesAmount, x.r.revenue, x.r.expense, x.r.splitPct, x.r.adjustment, x.r.profit, x.r.held, x.r.heldNote]);
  }

  await audit({ id: user.id, email: user.email, ip: await requestIp() }, "export.csv", entity, undefined, { rows: rows.length });
  return new Response(toCsv(headers, rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${entity}-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" },
  });
}
