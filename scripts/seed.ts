/**
 * Idempotent seed.
 *  1. Admin account from SEED_ADMIN_* (created once; never overwrites an existing password).
 *  2. Default settings rows (only missing keys).
 *  3. The "Maverick" processor connection (sandbox, disabled until a token and webhook secret are added).
 * There is no sample data: records arrive from the Maverick sync and webhooks, or are entered in the CRM.
 */
import { eq } from "drizzle-orm";
import { db, schema, sql } from "../src/db";
import { hashPassword } from "../src/lib/password";
import { DEFAULTS } from "../src/lib/settings";
import { DEFAULT_CONFIG, MAVERICK_HOSTS, newWebhookPath } from "../src/lib/integrations";

const S = schema;

async function seedAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) { console.log("[seed] SEED_ADMIN_EMAIL/PASSWORD not set — skipping admin"); return null; }
  const existing = await db.query.users.findFirst({ where: eq(S.users.email, email) });
  if (existing) {
    if (existing.role !== "admin" || existing.status !== "active") {
      await db.update(S.users).set({ role: "admin", status: "active" }).where(eq(S.users.id, existing.id));
    }
    console.log("[seed] admin account already exists — password left unchanged");
    return existing.id;
  }
  const [u] = await db.insert(S.users).values({
    email, name: process.env.SEED_ADMIN_NAME?.trim() || "Admin", role: "admin", status: "active",
    passwordHash: await hashPassword(password), avatarColor: "av-6",
  }).returning();
  console.log("[seed] created admin account", email);
  return u!.id;
}

async function seedSettings() {
  for (const [key, value] of Object.entries(DEFAULTS)) {
    await db.insert(S.settings).values({ key, value }).onConflictDoNothing();
  }
}

async function seedConnections() {
  const existing = await db.select().from(S.processorConnections);
  if (existing.length) return;
  await db.insert(S.processorConnections).values({
    name: "Maverick", processor: "maverick", mode: "sandbox", enabled: false, dashboardBaseUrl: MAVERICK_HOSTS.sandbox,
    tokenType: "agent", webhookPath: newWebhookPath(), config: DEFAULT_CONFIG,
  });
  console.log("[seed] created Maverick connection (disabled)");
}

async function main() {
  await seedAdmin();
  await seedSettings();
  await seedConnections();
  await sql().end();
}

main().catch(async (err) => {
  console.error("[seed] failed:", err);
  await sql().end().catch(() => {});
  process.exit(1);
});
