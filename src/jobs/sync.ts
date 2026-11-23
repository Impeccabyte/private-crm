/**
 * Reconciliation sync: pages through the processor API (50 per page) and upserts by (connection, external id).
 * Webhooks are the primary signal; this catches anything missed and stores daily snapshots for history.
 */
import { unhideIfReactivated } from "@/lib/merchant-hide";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { encrypt, last4 } from "@/lib/crypto";
import { adapterFor, configOf, getConnection } from "@/lib/integrations";
import { audit } from "@/lib/audit";
import type { NMerchant, Page, ProcessorAdapter } from "@/processors/types";
import type { SyncKind } from "./queue";

type Conn = NonNullable<Awaited<ReturnType<typeof getConnection>>>;
const MAX_PAGES = 200;

async function eachPage<T>(fetchPage: (p: number) => Promise<Page<T>>, fn: (item: T) => Promise<void>) {
  let p = 1, n = 0;
  while (p <= MAX_PAGES) {
    const page = await fetchPage(p);
    for (const item of page.items) { await fn(item); n++; }
    if (p >= page.pageCount || page.items.length === 0) break;
    p++;
  }
  return n;
}

async function upsertMerchant(conn: Conn, m: NMerchant) {
  let row = await db.query.merchants.findFirst({ where: and(eq(schema.merchants.connectionId, conn.id), eq(schema.merchants.externalId, m.externalId)) });
  const einL4 = last4(m.ein);
  let leId = row?.legalEntityId ?? null;
  if (!leId) {
    const le = einL4
      ? await db.query.legalEntities.findFirst({ where: and(eq(schema.legalEntities.legalName, m.legalName), eq(schema.legalEntities.einLast4, einL4)) })
      : await db.query.legalEntities.findFirst({ where: eq(schema.legalEntities.legalName, m.legalName) });
    leId = le?.id ?? (await db.insert(schema.legalEntities).values({ legalName: m.legalName, einEnc: m.ein ? encrypt(m.ein) : null, einLast4: einL4 }).returning())[0]!.id;
  }
  const live = m.accounts.some((a) => !/closed/i.test(a.status));
  const values = {
    legalEntityId: leId, dbaName: m.dbaName, mcc: m.mcc, street: m.address.street, city: m.address.city, state: m.address.state, zip: m.address.zip,
    csPhone: m.csPhone, csEmail: m.csEmail, website: m.website,
    status: (m.accounts.length === 0 ? (row?.status ?? "boarding") : live ? "live" : "closed") as "boarding" | "live" | "closed" | "prospect",
  };
  if (row) await db.update(schema.merchants).set(values).where(eq(schema.merchants.id, row.id));
  else {
    row = (await db.insert(schema.merchants).values({ ...values, connectionId: conn.id, processor: conn.processor, externalId: m.externalId }).returning())[0]!;
    for (const p of m.principals) {
      await db.insert(schema.contacts).values({
        merchantId: row.id, legalEntityId: leId, firstName: p.firstName || "—", lastName: p.lastName || "", email: p.email, phone: p.phone, title: p.title,
        ownershipPct: p.ownershipPct ?? null, labels: ["Owner", ...(p.isSigner ? ["Signer"] : []), ...(p.isGuarantor ? ["Guarantor"] : [])],
      });
    }
  }
  for (const a of m.accounts) {
    await db.insert(schema.merchantAccounts).values({
      merchantId: row.id, connectionId: conn.id, processor: conn.processor, externalId: a.externalId ?? null, mid: a.mid, processingMethod: a.processingMethod,
      status: /closed/i.test(a.status) ? "Closed" : "Live", riskLevel: a.riskLevel ?? null, bankName: a.bankName ?? null,
      bankAccountEnc: a.bankAccount ? encrypt(a.bankAccount) : null, bankAccountLast4: last4(a.bankAccount), routingLast4: last4(a.routing),
      openedAt: a.openedAt ?? null, closedAt: a.closedAt ?? null,
    }).onConflictDoUpdate({
      target: [schema.merchantAccounts.processor, schema.merchantAccounts.mid],
      set: { status: /closed/i.test(a.status) ? "Closed" : "Live", riskLevel: a.riskLevel ?? null, closedAt: a.closedAt ?? null, updatedAt: new Date() },
    });
  }
}

async function merchantIdFor(conn: Conn, dbaExternalId?: string | null) {
  if (!dbaExternalId) return null;
  const m = await db.query.merchants.findFirst({ where: and(eq(schema.merchants.connectionId, conn.id), eq(schema.merchants.externalId, dbaExternalId)), columns: { id: true } });
  return m?.id ?? null;
}

async function run(conn: Conn, adapter: ProcessorAdapter, kind: SyncKind) {
  const cfg = configOf(conn);
  const stats: Record<string, number> = {};
  const want = (k: SyncKind, flag: boolean) => (kind === "full" ? flag : kind === k);

  if (want("merchants", cfg.syncMerchants)) {
    stats.merchants = await eachPage((p) => adapter.listMerchants(p), (m) => upsertMerchant(conn, m));
    stats.terminals = await eachPage((p) => adapter.listTerminals(p), async (t) => {
      const mId = await merchantIdFor(conn, t.dbaExternalId);
      if (!mId) return;
      const acct = await db.query.merchantAccounts.findFirst({ where: eq(schema.merchantAccounts.merchantId, mId) });
      if (!acct) return;
      const ex = await db.query.terminals.findFirst({ where: and(eq(schema.terminals.merchantAccountId, acct.id), eq(schema.terminals.externalId, t.externalId)) });
      const v = { tid: t.tid, name: t.name ?? null, model: t.model ?? null, status: t.status };
      if (ex) await db.update(schema.terminals).set(v).where(eq(schema.terminals.id, ex.id));
      else await db.insert(schema.terminals).values({ ...v, merchantAccountId: acct.id, externalId: t.externalId });
    });
  }

  if (want("applications", cfg.syncApplications)) {
    stats.applications = await eachPage((p) => adapter.listApplications(p), async (a) => {
      // Look the application up first: boarding applications have no DBA id yet, so matching on DBA alone
      // would create a new, empty merchant on every sync.
      const ex = await db.query.applications.findFirst({ where: and(eq(schema.applications.connectionId, conn.id), eq(schema.applications.externalId, a.externalId)) });
      let mId = ex?.merchantId ?? (await merchantIdFor(conn, a.dbaExternalId));
      if (!mId) {
        mId = (await db.insert(schema.merchants).values({ dbaName: a.dbaName ?? a.legalName ?? `Application ${a.externalId}`, status: "boarding", connectionId: conn.id, processor: conn.processor, externalId: a.dbaExternalId ?? null, mcc: a.mcc ?? null }).onConflictDoNothing().returning())[0]?.id
          ?? (await merchantIdFor(conn, a.dbaExternalId));
      }
      if (!mId) return;
      if (ex) {
        if (ex.status !== a.status) await db.insert(schema.applicationStatusHistory).values({ applicationId: ex.id, status: a.status });
        if (ex.status !== a.status) await unhideIfReactivated(ex.merchantId, a.status);
        await db.update(schema.applications).set({ status: a.status, signatureStatus: a.signatureStatus, conditional: a.conditional, campaign: a.campaign ?? ex.campaign }).where(eq(schema.applications.id, ex.id));
      } else {
        const [row] = await db.insert(schema.applications).values({
          number: `MAV-${a.externalId}`, merchantId: mId, connectionId: conn.id, processor: conn.processor, externalId: a.externalId, status: a.status,
          signatureStatus: a.signatureStatus, conditional: a.conditional, campaign: a.campaign, createdAt: a.createdAt ? new Date(a.createdAt.replace(" ", "T") + "Z") : new Date(),
        }).onConflictDoNothing().returning();
        if (row) await db.insert(schema.applicationStatusHistory).values({ applicationId: row.id, status: a.status });
      }
    });
    // Refresh underwriting checks for applications still in flight.
    const open = await db.select().from(schema.applications).where(and(eq(schema.applications.connectionId, conn.id), inArray(schema.applications.status, ["Pending", "Underwriting"])));
    for (const app of open) {
      if (!app.externalId) continue;
      const checks = await adapter.getApplicationChecks(app.externalId).catch(() => []);
      if (!checks.length) continue;
      await db.delete(schema.applicationChecks).where(eq(schema.applicationChecks.applicationId, app.id));
      await db.insert(schema.applicationChecks).values(checks.map((c) => ({ applicationId: app.id, name: c.name, status: c.status, detail: c.detail ?? null })));
    }
  }

  if (want("tickets", cfg.syncTickets)) {
    stats.tickets = await eachPage((p) => adapter.listTickets(p), async (t) => {
      const mId = await merchantIdFor(conn, t.dbaExternalId);
      const ex = await db.query.tickets.findFirst({ where: and(eq(schema.tickets.connectionId, conn.id), eq(schema.tickets.externalId, t.externalId)) });
      if (ex) { await db.update(schema.tickets).set({ status: t.status, subject: t.subject }).where(eq(schema.tickets.id, ex.id)); return; }
      const [row] = await db.insert(schema.tickets).values({
        number: `MAV-${t.externalId}`, merchantId: mId, connectionId: conn.id, source: "maverick", externalId: t.externalId, subject: t.subject, status: t.status,
        category: t.category ?? null, createdAt: t.createdAt ? new Date(t.createdAt.replace(" ", "T") + "Z") : new Date(),
      }).onConflictDoNothing().returning();
      if (row && t.text) await db.insert(schema.ticketMessages).values({ ticketId: row.id, kind: "inbound", authorName: "Maverick help desk", body: t.text });
    });
  }

  if (want("chargebacks", cfg.syncChargebacks)) {
    stats.chargebacks = await eachPage((p) => adapter.listChargebacks(p), async (c) => {
      const mId = await merchantIdFor(conn, c.dbaExternalId);
      const acct = mId ? await db.query.merchantAccounts.findFirst({ where: eq(schema.merchantAccounts.merchantId, mId) }) : null;
      await db.insert(schema.chargebacks).values({
        connectionId: conn.id, externalId: c.externalId, caseId: c.caseId, merchantId: mId, merchantAccountId: acct?.id ?? null, amount: c.amount, reasonCode: c.reasonCode,
        reason: c.reason, cardBrand: c.cardBrand, cardLast4: c.cardLast4, receivedAt: c.receivedAt, respondBy: c.respondBy ?? null, status: c.status,
      }).onConflictDoUpdate({ target: [schema.chargebacks.connectionId, schema.chargebacks.externalId], set: { status: c.status, amount: c.amount, updatedAt: new Date() } });
    });
  }

  if (want("residuals", cfg.syncResiduals)) {
    stats.residuals = await eachPage((p) => adapter.listResiduals(p), async (r) => {
      const acct = await db.query.merchantAccounts.findFirst({ where: and(eq(schema.merchantAccounts.processor, conn.processor), eq(schema.merchantAccounts.mid, r.mid)) });
      const m = acct ? await db.query.merchants.findFirst({ where: eq(schema.merchants.id, acct.merchantId), columns: { ownerId: true } }) : null;
      const v = {
        merchantAccountId: acct?.id ?? null, period: r.period, agentId: m?.ownerId ?? null, salesCount: r.salesCount, salesAmount: r.salesAmount, revenue: r.revenue,
        expense: r.expense, splitPct: r.splitPct, adjustment: r.adjustment, adjustmentNote: r.adjustmentNote ?? null, profit: r.profit, held: r.held, heldNote: r.heldNote ?? null,
        publishedAt: r.publishedAt ? new Date(r.publishedAt.replace(" ", "T") + "Z") : null, label: acct ? null : `MID ${r.mid} (not in CRM)`,
      };
      await db.insert(schema.residualLines).values({ ...v, connectionId: conn.id, processor: conn.processor, externalId: r.externalId })
        .onConflictDoUpdate({ target: [schema.residualLines.connectionId, schema.residualLines.externalId], set: v });
    });
  }

  if (want("payouts", cfg.syncPayouts)) {
    const to = new Date(), from = new Date(Date.now() - cfg.payoutLookbackDays * 86_400_000);
    const merchants = await db.select().from(schema.merchants).where(and(eq(schema.merchants.connectionId, conn.id), eq(schema.merchants.status, "live")));
    let n = 0;
    for (const m of merchants) {
      if (!m.externalId) continue;
      const acct = await db.query.merchantAccounts.findFirst({ where: and(eq(schema.merchantAccounts.merchantId, m.id), eq(schema.merchantAccounts.status, "Live")) });
      if (!acct) continue;
      const pays = await adapter.listPayouts(m.externalId, from.toISOString().slice(0, 10), to.toISOString().slice(0, 10)).catch(() => []);
      for (const p of pays) {
        await db.insert(schema.payouts).values({ merchantAccountId: acct.id, depositDate: p.depositDate, batches: p.batches, gross: p.gross, fees: p.fees, chargebacks: p.chargebacks, reserve: p.reserve, net: p.net })
          .onConflictDoUpdate({ target: [schema.payouts.merchantAccountId, schema.payouts.depositDate], set: { gross: p.gross, fees: p.fees, chargebacks: p.chargebacks, reserve: p.reserve, net: p.net } });
        // Daily snapshot: payout gross is the best documented proxy for that day's settled volume.
        await db.insert(schema.dailyMetrics).values({ merchantAccountId: acct.id, day: p.depositDate, salesAmount: p.gross, salesCount: 0 })
          .onConflictDoUpdate({ target: [schema.dailyMetrics.merchantAccountId, schema.dailyMetrics.day], set: { salesAmount: p.gross } });
        n++;
      }
    }
    stats.payouts = n;
  }
  return stats;
}

export async function runSync(connectionId: string, kind: SyncKind, triggeredBy?: string | null) {
  const conn = await getConnection(connectionId);
  if (!conn) throw new Error("Connection not found");
  if (!conn.enabled) return { skipped: "connection disabled" };
  const [runRow] = await db.insert(schema.syncRuns).values({ connectionId, kind, triggeredBy: triggeredBy ?? null }).returning();
  try {
    const stats = await run(conn, adapterFor(conn), kind);
    await db.update(schema.syncRuns).set({ status: "succeeded", stats, finishedAt: new Date() }).where(eq(schema.syncRuns.id, runRow!.id));
    await db.update(schema.processorConnections).set({ lastSyncAt: new Date(), lastSyncStatus: "succeeded", lastSyncError: null }).where(eq(schema.processorConnections.id, connectionId));
    await audit({ id: triggeredBy ?? null }, "integration.sync", "processor_connection", connectionId, { kind, stats });
    return stats;
  } catch (err) {
    const msg = (err as Error).message.slice(0, 1000);
    await db.update(schema.syncRuns).set({ status: "failed", error: msg, finishedAt: new Date() }).where(eq(schema.syncRuns.id, runRow!.id));
    await db.update(schema.processorConnections).set({ lastSyncStatus: "failed", lastSyncError: msg }).where(eq(schema.processorConnections.id, connectionId));
    throw err;
  }
}
