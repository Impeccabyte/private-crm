/**
 * DEVELOPMENT ONLY. Two fictional demo merchants with portal sign-ins, for building and testing the merchant portal.
 * Refuses to run against production (NODE_ENV=production or an https APP_URL). Re-running replaces the demo data.
 *
 *   npx tsx scripts/seed-portal-demo.ts
 *
 * Sign-ins (local test values only): demo-coffee@example.test and demo-auto@example.test.
 * Set PORTAL_DEMO_PASSWORD (12 characters or more) before running; there is no default.
 * Merchant and terminal IDs, tax ID, bank and routing numbers are random digits made up on each run.
 * The merchants are marked processor "demo" so they are easy to find and remove.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db, schema as S, sql } from "../src/db";
import { hashPassword } from "../src/lib/password";
import { encrypt } from "../src/lib/crypto";

if (process.env.NODE_ENV === "production" || (process.env.APP_URL ?? "").startsWith("https://")) {
  console.error("[portal-demo] refusing to seed demo merchants outside local development");
  process.exit(1);
}

const PASSWORD = process.env.PORTAL_DEMO_PASSWORD ?? "";
if (PASSWORD.length < 12) {
  console.error("[portal-demo] set PORTAL_DEMO_PASSWORD (12 characters or more) to choose the demo sign-in password");
  process.exit(1);
}
const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
/** Random digits for made-up tax ID, bank and routing numbers. Never real, never fixed in the repo. */
const digits = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join("");

type Spec = {
  email: string; person: string; dba: string; legal: string; type: string; industry: string; mcc: string; street: string; zip: string;
  phone: string; csEmail: string; bank: string; base: number; avg: number; weekend: number; feeRate: number;
  terminals: { name: string; model: string; location: string }[];
};

const SPECS: Spec[] = [
  { email: "demo-coffee@example.test", person: "Maya Torres", dba: "Harbor Street Coffee Co.", legal: "Harbor Street Coffee LLC", type: "LLC", industry: "Restaurants & Bars", mcc: "5814",
    street: "1801 E Cesar Chavez St", zip: "78702", phone: "(512) 555-0142", csEmail: "hello@harborstreet.example", bank: "Chase", base: 1500, avg: 14.2, weekend: 1.7, feeRate: 0.027,
    terminals: [{ name: "Front counter", model: "Clover Flex", location: "Harbor Street" }, { name: "Patio", model: "Clover Go", location: "Harbor Street" }] },
  { email: "demo-auto@example.test", person: "Luis Ortega", dba: "Mesa Verde Auto Repair", legal: "Ortega Automotive Inc.", type: "Corporation", industry: "Auto Repair", mcc: "7538",
    street: "9400 N Lamar Blvd", zip: "78753", phone: "(512) 555-0187", csEmail: "service@mesaverde.example", bank: "Frost Bank", base: 3200, avg: 410, weekend: 0.35, feeRate: 0.024,
    terminals: [{ name: "Service desk", model: "Dejavoo P8", location: "Main shop" }] },
];

async function main() {
  // Remove earlier demo data (tickets first: they only set null on merchant delete).
  const old = await db.select({ id: S.merchants.id }).from(S.merchants).where(eq(S.merchants.processor, "demo"));
  if (old.length) {
    const ids = old.map((o) => o.id);
    await db.delete(S.tickets).where(inArray(S.tickets.merchantId, ids));
    await db.delete(S.chargebacks).where(inArray(S.chargebacks.merchantId, ids));
    await db.delete(S.merchants).where(inArray(S.merchants.id, ids));
  }
  await db.delete(S.portalUsers).where(inArray(S.portalUsers.email, SPECS.map((s) => s.email)));

  const manager = await db.query.users.findFirst({ where: and(eq(S.users.status, "active"), inArray(S.users.role, ["admin", "manager", "agent"])) });
  const hash = await hashPassword(PASSWORD);

  for (const [i, sp] of SPECS.entries()) {
    const ein = digits(9);
    const bankAccount = digits(10);
    const [le] = await db.insert(S.legalEntities).values({ legalName: `(Demo) ${sp.legal}`, entityType: sp.type, stateOfFormation: "TX", einEnc: encrypt(ein), einLast4: ein.slice(-4) }).returning();
    const [m] = await db.insert(S.merchants).values({
      legalEntityId: le!.id, processor: "demo", dbaName: sp.dba, status: "live", mcc: sp.mcc, industry: sp.industry, street: sp.street, city: "Austin", state: "TX", zip: sp.zip,
      csPhone: sp.phone, csEmail: sp.csEmail, ownerId: manager?.id ?? null, liveSince: iso(daysAgo(400)), reserveBalance: 0,
    }).returning();
    const [a] = await db.insert(S.merchantAccounts).values({
      merchantId: m!.id, processor: "demo", mid: digits(12), bankName: sp.bank, bankAccountEnc: encrypt(bankAccount), bankAccountLast4: bankAccount.slice(-4), routingLast4: digits(4), openedAt: iso(daysAgo(400)),
    }).returning();
    for (const t of sp.terminals) await db.insert(S.terminals).values({ merchantAccountId: a!.id, tid: digits(8), name: t.name, model: t.model, location: t.location, createdAt: daysAgo(i ? 200 : 3) });
    await db.insert(S.contacts).values({ merchantId: m!.id, firstName: sp.person.split(" ")[0]!, lastName: sp.person.split(" ")[1]!, title: "Owner", email: sp.email, phone: sp.phone, ownershipPct: 100, labels: ["Owner", "Signer", "Primary"] });

    // ~13 months of daily sales, with weekly rhythm and gentle growth; deposits next business day.
    const metrics: (typeof S.dailyMetrics.$inferInsert)[] = [];
    const payouts: (typeof S.payouts.$inferInsert)[] = [];
    let pending = { gross: 0, count: 0, batches: 0 };
    for (let d = 395; d >= 1; d--) {
      const day = daysAgo(d);
      const dow = day.getUTCDay();
      const wk = dow === 0 || dow === 6;
      const growth = 1 + (395 - d) / 395 * 0.18;
      const amt = Math.round(sp.base * growth * (wk ? sp.weekend : 1) * (0.8 + rnd() * 0.4) * 100) / 100;
      const count = Math.max(1, Math.round(amt / sp.avg));
      metrics.push({ merchantAccountId: a!.id, day: iso(day), salesCount: count, salesAmount: amt });
      pending = { gross: pending.gross + amt, count: pending.count + count, batches: pending.batches + 1 };
      const next = daysAgo(d - 1);
      if (next.getUTCDay() !== 0 && next.getUTCDay() !== 6 && d - 1 >= 0) {
        const fees = Math.round(pending.gross * sp.feeRate * 100) / 100;
        payouts.push({ merchantAccountId: a!.id, depositDate: iso(next), batches: pending.batches, gross: Math.round(pending.gross * 100) / 100, fees, net: Math.round((pending.gross - fees) * 100) / 100 });
        pending = { gross: 0, count: 0, batches: 0 };
      }
    }
    for (let k = 0; k < metrics.length; k += 200) await db.insert(S.dailyMetrics).values(metrics.slice(k, k + 200));
    for (let k = 0; k < payouts.length; k += 200) await db.insert(S.payouts).values(payouts.slice(k, k + 200));

    const [pu] = await db.insert(S.portalUsers).values({ merchantId: m!.id, email: sp.email, name: sp.person, passwordHash: hash, status: "active", invitedById: manager?.id ?? null }).returning();

    if (i === 0) {
      // One open dispute that needs a response, one decided last month.
      await db.insert(S.chargebacks).values([
        { merchantId: m!.id, merchantAccountId: a!.id, caseId: "CB-58213", amount: 64.5, reasonCode: "13.1", reason: "Customer says the order never arrived", cardBrand: "Visa", cardLast4: "0193",
          transactionDate: iso(daysAgo(19)), receivedAt: iso(daysAgo(4)), respondBy: iso(daysAgo(-6)), status: "Processed" },
        { merchantId: m!.id, merchantAccountId: a!.id, caseId: "CB-55102", amount: 38.25, reasonCode: "12.6", reason: "Charged twice", cardBrand: "Mastercard", cardLast4: "7720",
          transactionDate: iso(daysAgo(70)), receivedAt: iso(daysAgo(55)), respondBy: iso(daysAgo(45)), status: "Won", disputeStatus: "submitted" },
      ]);
      // A request with a reply waiting on the merchant, and a finished one.
      const newAccount = digits(10);
      const [t1] = await db.insert(S.tickets).values({ number: "TCK-9101", merchantId: m!.id, source: "portal", subject: "Change deposit bank account", category: "Account change", portalKind: "account_change",
        portalDetails: { "What to change": "Deposit bank account", "New bank": "Texas Capital Bank", "New account ends in": newAccount.slice(-4) }, portalSensitiveEnc: encrypt(JSON.stringify({ bankName: "Texas Capital Bank", routing: digits(9), account: newAccount })),
        portalUserId: pu!.id, assigneeId: manager?.id ?? null, contactName: sp.person, contactEmail: sp.email, status: "In Progress", createdAt: daysAgo(5), firstResponseAt: daysAgo(4) }).returning();
      await db.insert(S.ticketMessages).values([
        { ticketId: t1!.id, kind: "inbound", authorName: sp.person, authorPortalUserId: pu!.id, body: "We moved our business banking to Texas Capital. Can deposits go there starting next week?", createdAt: daysAgo(5) },
        { ticketId: t1!.id, kind: "internal", authorName: manager?.name ?? "Staff", authorUserId: manager?.id ?? null, body: "Internal: confirm by phone before submitting to Maverick.", createdAt: daysAgo(4) },
        { ticketId: t1!.id, kind: "outbound", authorName: manager?.name ?? "Impeccabyte", authorUserId: manager?.id ?? null, body: "Happy to set that up. Could you reply with a photo of a voided check for the new account? Once we have it, I'll call you to confirm and submit the change.", createdAt: daysAgo(1) },
      ]);
      const [t2] = await db.insert(S.tickets).values({ number: "TCK-9102", merchantId: m!.id, source: "portal", subject: "Paper rolls", category: "Equipment & supplies", portalKind: "equipment",
        portalDetails: { "What you need": "Paper rolls", "How many": "2", "Ship to": "The business address on file" }, portalUserId: pu!.id, assigneeId: manager?.id ?? null, contactName: sp.person, contactEmail: sp.email,
        status: "Closed", createdAt: daysAgo(18), firstResponseAt: daysAgo(18), closedAt: daysAgo(15) }).returning();
      await db.insert(S.ticketMessages).values([
        { ticketId: t2!.id, kind: "inbound", authorName: sp.person, authorPortalUserId: pu!.id, body: "Running low on receipt paper for the Flex.", createdAt: daysAgo(18) },
        { ticketId: t2!.id, kind: "outbound", authorName: manager?.name ?? "Impeccabyte", authorUserId: manager?.id ?? null, body: "Two boxes are on the way. No charge.", createdAt: daysAgo(17) },
      ]);
    }
    console.log(`[portal-demo] ${sp.dba}: ${metrics.length} days, ${payouts.length} deposits, sign-in ${sp.email}`);
  }
  void sql;
  console.log(`[portal-demo] done. Sign in with the PORTAL_DEMO_PASSWORD you set.`);
  process.exit(0);
}

main().catch((e) => { console.error("[portal-demo] failed:", e); process.exit(1); });
