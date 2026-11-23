/**
 * Applies a stored Maverick webhook event to CRM records. Unknown module/action pairs are marked "ignored"
 * (the raw payload stays in webhook_events). Errors mark the event failed/retrying; the queue retries with backoff.
 */
import { unhideIfReactivated } from "@/lib/merchant-hide";
import { and, eq, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";
import { encrypt, last4 } from "@/lib/crypto";
import { mapApplication, mapChargeback, mapTicketStatus } from "@/processors/maverick/adapter";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
type Conn = typeof schema.processorConnections.$inferSelect;

async function merchantByDba(conn: Conn, dbaId: unknown) {
  if (dbaId == null) return null;
  return db.query.merchants.findFirst({ where: and(eq(schema.merchants.connectionId, conn.id), eq(schema.merchants.externalId, String(dbaId))) })
    ?? null;
}

async function appByExt(conn: Conn, id: unknown) {
  if (id == null) return null;
  return (await db.query.applications.findFirst({ where: and(eq(schema.applications.connectionId, conn.id), eq(schema.applications.externalId, String(id))) })) ?? null;
}

async function timeline(merchantId: string | null | undefined, title: string, tag?: string | null, extra: Partial<typeof schema.activities.$inferInsert> = {}) {
  if (!merchantId) return;
  await db.insert(schema.activities).values({ type: "system", title, merchantId, source: "maverick", tag: tag ?? null, ...extra });
}

class SkipError extends Error {}

export async function processWebhookEvent(eventId: string): Promise<"processed" | "ignored"> {
  const ev = await db.query.webhookEvents.findFirst({ where: eq(schema.webhookEvents.id, eventId) });
  if (!ev) throw new SkipError("event not found");
  if (ev.status === "processed" || ev.status === "ignored" || ev.status === "rejected") return ev.status === "processed" ? "processed" : "ignored";
  const conn = await db.query.processorConnections.findFirst({ where: eq(schema.processorConnections.id, ev.connectionId) });
  if (!conn) throw new SkipError("connection not found");

  await db.update(schema.webhookEvents).set({ attempts: dsql`${schema.webhookEvents.attempts} + 1` }).where(eq(schema.webhookEvents.id, eventId));
  try {
    const result = await apply(conn, `${ev.module}.${ev.action}`, (ev.payload as Any)?.data ?? {});
    await db.update(schema.webhookEvents).set({ status: result, processedAt: new Date(), lastError: null }).where(eq(schema.webhookEvents.id, eventId));
    return result;
  } catch (err) {
    const fresh = await db.query.webhookEvents.findFirst({ where: eq(schema.webhookEvents.id, eventId), columns: { attempts: true } });
    await db.update(schema.webhookEvents).set({ status: (fresh?.attempts ?? 0) >= 5 ? "failed" : "retrying", lastError: (err as Error).message.slice(0, 500) })
      .where(eq(schema.webhookEvents.id, eventId));
    throw err;
  }
}

async function apply(conn: Conn, key: string, d: Any): Promise<"processed" | "ignored"> {
  switch (key) {
    // ── Boarding applications ────────────────────────────────────────────────
    case "boardingApplication.statusChanged":
    case "boardingApplication.created": {
      const n = mapApplication(d);
      const app = await appByExt(conn, n.externalId);
      if (!app) throw new Error(`Unknown boarding application ${n.externalId} (run a sync to import it)`);
      if (app.status !== n.status) {
        await db.insert(schema.applicationStatusHistory).values({ applicationId: app.id, status: n.status });
        await timeline(app.merchantId, `Application ${app.number} moved to ${n.status}`, app.number, { applicationId: app.id });
      }
      await db.update(schema.applications).set({
        status: n.status, signatureStatus: n.signatureStatus, conditional: n.conditional || app.conditional,
        statusChangedAt: app.status !== n.status ? new Date() : app.statusChangedAt, approvedAt: n.status === "Approved" ? (app.approvedAt ?? new Date()) : app.approvedAt,
      }).where(eq(schema.applications.id, app.id));
      if (app.status !== n.status) await unhideIfReactivated(app.merchantId, n.status);
      if (n.status === "Approved") await db.update(schema.merchants).set({ status: "boarding" }).where(and(eq(schema.merchants.id, app.merchantId), eq(schema.merchants.status, "prospect")));
      return "processed";
    }
    case "boardingApplication.failedCheck": {
      const app = await appByExt(conn, d?.boardingApplication?.id);
      if (!app) throw new Error(`Unknown boarding application ${d?.boardingApplication?.id}`);
      const name = String(d?.check?.type ?? "Underwriting check");
      await db.insert(schema.applicationChecks).values({ applicationId: app.id, name, status: "Failed", detail: d?.check?.status ? `Status: ${d.check.status}` : null });
      await timeline(app.merchantId, `Underwriting check failed: ${name}`, app.number, { applicationId: app.id });
      return "processed";
    }
    case "boardingApplication.checkCompleted": {
      const app = await appByExt(conn, d?.boardingApplication?.id);
      if (!app) throw new Error(`Unknown boarding application ${d?.boardingApplication?.id}`);
      await timeline(app.merchantId, `All underwriting checks completed for ${app.number}`, app.number, { applicationId: app.id });
      return "processed";
    }
    case "boardingApplication.noteAdded":
    case "boardingApplication.noteUpdated": {
      const app = await appByExt(conn, d?.boardingApplication?.id);
      if (!app) throw new Error(`Unknown boarding application ${d?.boardingApplication?.id}`);
      await db.insert(schema.activities).values({ type: "note", title: "Note from Maverick", body: String(d?.note?.text ?? ""), merchantId: app.merchantId, applicationId: app.id, source: "maverick", internal: true });
      return "processed";
    }
    case "boardingApplication.signedCompleted": {
      const app = await appByExt(conn, d?.application?.id ?? d?.boardingApplication?.id);
      if (!app) throw new Error("Unknown boarding application");
      await db.update(schema.applications).set({ signatureStatus: "Signed" }).where(eq(schema.applications.id, app.id));
      await db.update(schema.applicationSigners).set({ status: "Signed", signedAt: new Date() }).where(eq(schema.applicationSigners.applicationId, app.id));
      await timeline(app.merchantId, `Signature completed for ${app.number}`, app.number, { applicationId: app.id });
      return "processed";
    }
    case "boardingApplication.conditionalApproval": {
      const ca = d?.conditionallyApproved ?? d;
      const app = await appByExt(conn, ca?.application?.id);
      if (!app) throw new Error("Unknown boarding application");
      await db.update(schema.applications).set({ status: "Approved", conditional: true, approvedAt: app.approvedAt ?? new Date() }).where(eq(schema.applications.id, app.id));
      for (const c of [...(ca?.conditions?.acq ?? []), ...(ca?.conditions?.ach ?? [])]) {
        await db.insert(schema.applicationConditions).values({ applicationId: app.id, externalId: String(c.id), content: String(c.content), met: c.approved === "Yes", metAt: c.approvedOn ? new Date(c.approvedOn) : null });
      }
      await timeline(app.merchantId, `Conditionally approved: ${app.number}`, app.number, { applicationId: app.id });
      return "processed";
    }

    // ── Merchant accounts & terminals ────────────────────────────────────────
    case "merchant.acqCreate": {
      const m = await merchantByDba(conn, d?.dba?.id);
      if (!m) throw new Error(`Unknown DBA ${d?.dba?.id} (run a sync to import it)`);
      const acct = String(d?.bank?.accountNumber ?? d?.banks?.[0]?.bankAccountNumber ?? "");
      await db.insert(schema.merchantAccounts).values({
        merchantId: m.id, connectionId: conn.id, processor: conn.processor, externalId: String(d.id), mid: String(d.mid), status: "Live",
        riskLevel: d?.riskLevel ?? null, bankName: d?.bank?.name ?? null, bankAccountEnc: acct ? encrypt(acct) : null, bankAccountLast4: last4(acct),
        routingLast4: last4(d?.bank?.routingNumber ?? d?.banks?.[0]?.bankRoutingNumber), openedAt: d?.boardedOn ? String(d.boardedOn).slice(0, 10) : null,
      }).onConflictDoUpdate({ target: [schema.merchantAccounts.processor, schema.merchantAccounts.mid], set: { status: "Live", externalId: String(d.id) } });
      await db.update(schema.merchants).set({ status: "live", liveSince: m.liveSince ?? new Date().toISOString().slice(0, 10) }).where(eq(schema.merchants.id, m.id));
      await timeline(m.id, `Merchant account created — MID ••${String(d.mid).slice(-4)}`, "Account");
      return "processed";
    }
    case "merchant.acqClosed": {
      const acct = await db.query.merchantAccounts.findFirst({ where: and(eq(schema.merchantAccounts.processor, conn.processor), eq(schema.merchantAccounts.mid, String(d?.mid))) });
      if (!acct) throw new Error(`Unknown MID ${d?.mid}`);
      if (acct.status === "Closed") throw new Error(`Merchant account ${d?.mid} is already closed`);
      await db.update(schema.merchantAccounts).set({ status: "Closed", closedAt: new Date().toISOString().slice(0, 10) }).where(eq(schema.merchantAccounts.id, acct.id));
      await timeline(acct.merchantId, `Merchant account closed — MID ••${String(d.mid).slice(-4)}`, "Account");
      return "processed";
    }
    case "merchantTerminal.create":
    case "merchantTerminal.update":
    case "merchantTerminal.delete": {
      const m = await merchantByDba(conn, d?.dba?.id);
      if (!m) throw new Error(`Unknown DBA ${d?.dba?.id}`);
      const acct = await db.query.merchantAccounts.findFirst({ where: eq(schema.merchantAccounts.merchantId, m.id) });
      if (!acct) throw new Error(`DBA ${d?.dba?.id} has no merchant account yet`);
      const existing = await db.query.terminals.findFirst({ where: and(eq(schema.terminals.merchantAccountId, acct.id), eq(schema.terminals.externalId, String(d.id))) });
      const values = { tid: String(d.tid ?? d.id), name: d.name ?? null, model: d?.equipment?.equipmentType ?? null, status: key.endsWith("delete") ? "Deactivated" : "Active" };
      if (existing) await db.update(schema.terminals).set(values).where(eq(schema.terminals.id, existing.id));
      else await db.insert(schema.terminals).values({ ...values, merchantAccountId: acct.id, externalId: String(d.id) });
      await timeline(m.id, `Terminal ${key.endsWith("create") ? "added" : key.endsWith("delete") ? "removed" : "updated"} — TID ${values.tid}`, `MID ••${acct.mid.slice(-4)}`);
      return "processed";
    }

    // ── Tickets (mirrored from Maverick's help desk) ─────────────────────────
    case "ticket.created": {
      const t = d?.ticket ?? {};
      const m = await merchantByDba(conn, d?.dba?.id);
      const [{ next }] = await db.execute<{ next: number }>(dsql`select coalesce(max(substring(number from 5)::int), 3000) + 1 as next from tickets`) as unknown as { next: number }[];
      await db.insert(schema.tickets).values({
        number: `TCK-${next}`, merchantId: m?.id ?? null, connectionId: conn.id, source: "maverick", externalId: String(t.id), subject: String(t.subject ?? t.title ?? "Maverick ticket"),
        status: mapTicketStatus(t.status), slaDueAt: new Date(Date.now() + 3_600_000),
      }).onConflictDoNothing();
      const row = await db.query.tickets.findFirst({ where: and(eq(schema.tickets.connectionId, conn.id), eq(schema.tickets.externalId, String(t.id))) });
      if (row && t.text) await db.insert(schema.ticketMessages).values({ ticketId: row.id, kind: "inbound", authorName: "Maverick help desk", body: String(t.text) });
      return "processed";
    }
    case "ticket.statusChanged":
    case "ticket.responseAdded":
    case "ticket.responseUpdated":
    case "ticket.noteAdded":
    case "ticket.noteUpdated": {
      const t = d?.ticket ?? {};
      const row = await db.query.tickets.findFirst({ where: and(eq(schema.tickets.connectionId, conn.id), eq(schema.tickets.externalId, String(t.id))) });
      if (!row) throw new Error(`Unknown ticket id ${t.id} (not yet synced)`);
      if (key === "ticket.statusChanged") {
        const status = mapTicketStatus(t.status);
        await db.update(schema.tickets).set({ status, closedAt: status === "Closed" ? new Date() : null }).where(eq(schema.tickets.id, row.id));
        await db.insert(schema.ticketMessages).values({ ticketId: row.id, kind: "system", authorName: "Maverick", body: `Status changed to ${status} in Maverick` });
      } else {
        const part = d?.response ?? d?.note ?? {};
        const kind = key.startsWith("ticket.note") ? "internal" : "inbound";
        const exists = part.id ? await db.query.ticketMessages.findFirst({ where: and(eq(schema.ticketMessages.ticketId, row.id), eq(schema.ticketMessages.externalId, String(part.id))) }) : null;
        if (exists) await db.update(schema.ticketMessages).set({ body: String(part.text ?? "") }).where(eq(schema.ticketMessages.id, exists.id));
        else await db.insert(schema.ticketMessages).values({ ticketId: row.id, externalId: part.id ? String(part.id) : null, kind, authorName: "Maverick help desk", body: String(part.text ?? "") });
        await db.update(schema.tickets).set({ updatedAt: new Date() }).where(eq(schema.tickets.id, row.id));
      }
      return "processed";
    }

    // ── Chargebacks ──────────────────────────────────────────────────────────
    case "chargeback.create":
    case "chargeback.update": {
      const n = mapChargeback(d);
      const m = await merchantByDba(conn, n.dbaExternalId);
      const acct = m ? await db.query.merchantAccounts.findFirst({ where: eq(schema.merchantAccounts.merchantId, m.id) }) : null;
      await db.insert(schema.chargebacks).values({
        connectionId: conn.id, externalId: n.externalId, caseId: n.caseId, merchantId: m?.id ?? null, merchantAccountId: acct?.id ?? null, amount: n.amount,
        reasonCode: n.reasonCode, reason: n.reason, cardBrand: n.cardBrand, cardLast4: n.cardLast4, receivedAt: n.receivedAt,
        respondBy: n.respondBy ?? new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10), status: n.status,
      }).onConflictDoUpdate({ target: [schema.chargebacks.connectionId, schema.chargebacks.externalId], set: { status: n.status, amount: n.amount, updatedAt: new Date() } });
      if (key === "chargeback.create") await timeline(m?.id, `New chargeback $${n.amount.toFixed(2)}`, n.caseId);
      return "processed";
    }

    // ── Card payments: only the risk warning matters to the CRM ──────────────
    case "payment.highRiskAuthorizationWarning":
    case "cardPayment.highRiskAuthorizationWarning": {
      const m = await merchantByDba(conn, d?.dba?.id);
      await timeline(m?.id, "High-risk authorization warning", "Risk");
      return "processed";
    }
    default:
      return "ignored";
  }
}

export { SkipError };
