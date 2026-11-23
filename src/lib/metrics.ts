/**
 * Scoped portfolio metrics computed from stored snapshots (daily_metrics, residual_lines …).
 * `owners` = null means whole portfolio; otherwise only merchants owned by those users.
 */
import { and, eq, gte, inArray, lt, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";

export type Owners = string[] | null;

const ownerFilter = (owners: Owners) => (owners ? inArray(schema.merchants.ownerId, owners) : undefined);
const iso = (d: Date) => d.toISOString().slice(0, 10);

export function monthStart(d = new Date(), offset = 0) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, 1));
}

export async function volumeBetween(owners: Owners, from: Date, to: Date) {
  const [r] = await db.select({ amt: dsql<number>`coalesce(sum(${schema.dailyMetrics.salesAmount}),0)::float`, cnt: dsql<number>`coalesce(sum(${schema.dailyMetrics.salesCount}),0)::int` })
    .from(schema.dailyMetrics)
    .innerJoin(schema.merchantAccounts, eq(schema.dailyMetrics.merchantAccountId, schema.merchantAccounts.id))
    .innerJoin(schema.merchants, eq(schema.merchantAccounts.merchantId, schema.merchants.id))
    .where(and(gte(schema.dailyMetrics.day, iso(from)), lt(schema.dailyMetrics.day, iso(to)), ownerFilter(owners)));
  return { amount: r?.amt ?? 0, count: r?.cnt ?? 0 };
}

export async function volumeByMonth(owners: Owners, months: number, extraWhere?: ReturnType<typeof eq>) {
  const start = monthStart(new Date(), -(months - 1));
  const rows = await db.select({ m: dsql<string>`to_char(date_trunc('month', ${schema.dailyMetrics.day}), 'YYYY-MM')`, amt: dsql<number>`sum(${schema.dailyMetrics.salesAmount})::float`, cnt: dsql<number>`sum(${schema.dailyMetrics.salesCount})::int` })
    .from(schema.dailyMetrics)
    .innerJoin(schema.merchantAccounts, eq(schema.dailyMetrics.merchantAccountId, schema.merchantAccounts.id))
    .innerJoin(schema.merchants, eq(schema.merchantAccounts.merchantId, schema.merchants.id))
    .where(and(gte(schema.dailyMetrics.day, iso(start)), ownerFilter(owners), extraWhere))
    .groupBy(dsql`1`).orderBy(dsql`1`);
  const map = new Map(rows.map((r) => [r.m, r]));
  return Array.from({ length: months }, (_, i) => {
    const d = monthStart(new Date(), -(months - 1) + i);
    const key = d.toISOString().slice(0, 7);
    return { key, label: d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }), amount: map.get(key)?.amt ?? 0, count: map.get(key)?.cnt ?? 0 };
  });
}

export async function volumeByMerchant(owners: Owners, from: Date, to: Date) {
  return db.select({ merchantId: schema.merchants.id, amount: dsql<number>`sum(${schema.dailyMetrics.salesAmount})::float`, count: dsql<number>`sum(${schema.dailyMetrics.salesCount})::int` })
    .from(schema.dailyMetrics)
    .innerJoin(schema.merchantAccounts, eq(schema.dailyMetrics.merchantAccountId, schema.merchantAccounts.id))
    .innerJoin(schema.merchants, eq(schema.merchantAccounts.merchantId, schema.merchants.id))
    .where(and(gte(schema.dailyMetrics.day, iso(from)), lt(schema.dailyMetrics.day, iso(to)), ownerFilter(owners)))
    .groupBy(schema.merchants.id);
}

export async function residualTotals(owners: Owners, period: string) {
  const [r] = await db.select({
    revenue: dsql<number>`coalesce(sum(${schema.residualLines.revenue}),0)::float`, expense: dsql<number>`coalesce(sum(${schema.residualLines.expense}),0)::float`,
    adjustment: dsql<number>`coalesce(sum(${schema.residualLines.adjustment}),0)::float`, profit: dsql<number>`coalesce(sum(${schema.residualLines.profit}),0)::float`,
    held: dsql<number>`coalesce(sum(${schema.residualLines.held}),0)::float`, volume: dsql<number>`coalesce(sum(${schema.residualLines.salesAmount}),0)::float`,
  }).from(schema.residualLines).where(and(eq(schema.residualLines.period, period), owners ? inArray(schema.residualLines.agentId, owners) : undefined));
  return r!;
}

export const pctChange = (cur: number, prev: number) => (prev ? ((cur - prev) / prev) * 100 : null);
