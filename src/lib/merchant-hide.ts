/**
 * Hiding a merchant: for boarding records that never went anywhere (one application, cancelled,
 * no MIDs, no chargebacks). Hidden merchants drop out of lists, search, pickers and exports, but nothing
 * is deleted, so they can be unhidden at any time. Nothing changes in Maverick.
 */
import { and, count, eq, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";

export type HideEligibility = { ok: true } | { ok: false; reason: string };

export async function hideEligibility(merchantId: string): Promise<HideEligibility> {
  const m = await db.query.merchants.findFirst({ where: eq(schema.merchants.id, merchantId), columns: { status: true, hiddenAt: true } });
  if (!m) return { ok: false, reason: "Merchant not found." };
  if (m.hiddenAt) return { ok: false, reason: "Already hidden." };
  if (m.status !== "boarding") return { ok: false, reason: "Only merchants that are still boarding can be hidden." };
  const apps = await db.select({ status: schema.applications.status }).from(schema.applications).where(eq(schema.applications.merchantId, merchantId));
  if (apps.length !== 1) return { ok: false, reason: apps.length ? "It has more than one application." : "It has no application." };
  if (apps[0]!.status !== "Cancelled") return { ok: false, reason: "Its application isn’t cancelled." };
  const [[mids], [cbs]] = await Promise.all([
    db.select({ n: count() }).from(schema.merchantAccounts).where(eq(schema.merchantAccounts.merchantId, merchantId)),
    db.select({ n: count() }).from(schema.chargebacks).where(eq(schema.chargebacks.merchantId, merchantId)),
  ]);
  if (mids!.n) return { ok: false, reason: "It has a MID." };
  if (cbs!.n) return { ok: false, reason: "It has chargebacks." };
  return { ok: true };
}

/** A hidden merchant comes back automatically if Maverick moves its application out of Cancelled. */
export async function unhideIfReactivated(merchantId: string, appStatus: string) {
  if (appStatus === "Cancelled") return;
  const rows = await db.update(schema.merchants).set({ hiddenAt: null, hiddenById: null })
    .where(and(eq(schema.merchants.id, merchantId), isNotNull(schema.merchants.hiddenAt))).returning({ id: schema.merchants.id });
  if (rows.length) await db.insert(schema.activities).values({ type: "system", title: `Unhidden automatically: application moved to ${appStatus} in Maverick`, merchantId, source: "maverick" });
}
