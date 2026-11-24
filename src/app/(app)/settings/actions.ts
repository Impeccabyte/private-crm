"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, ne, sql as dsql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { actorFor, requirePermission } from "@/lib/dal";
import { audit } from "@/lib/audit";
import { encrypt, last4, randomToken } from "@/lib/crypto";
import { getSetting, nextSecret, setSetting } from "@/lib/settings";
import { adapterFor, configOf, DEFAULT_CONFIG, getConnection, MAVERICK_HOSTS, newWebhookPath } from "@/lib/integrations";
import { issuePasswordLink } from "@/lib/password-links";
import { destroyAllSessions } from "@/lib/session";
import { enqueueSync, enqueueWebhook, type SyncKind } from "@/jobs/queue";

export type ActionState = { ok?: string; error?: string; fieldErrors?: Record<string, string> };

const bool = (f: FormData, k: string) => f.get(k) === "on" || f.get(k) === "true";
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const int = (f: FormData, k: string) => Number(f.get(k) ?? NaN);

function fail(e: unknown): ActionState {
  if (e instanceof z.ZodError) {
    return { error: "Check the highlighted fields.", fieldErrors: Object.fromEntries(e.issues.map((i) => [String(i.path[0]), i.message])) };
  }
  return { error: (e as Error).message };
}

// ── General ───────────────────────────────────────────────────────────────────
const generalSchema = z.object({
  companyName: z.string().min(1, "Required").max(80),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #5B5BD6"),
  timezone: z.string().min(1),
  stuckApplicationDays: z.number().int().min(1).max(60),
  chargebackUrgentDays: z.number().int().min(1).max(30),
  ticketFirstResponseMinutes: z.number().int().min(5).max(10080),
  ticketSlaWarnMinutes: z.number().int().min(1).max(10080),
  staleLeadDays: z.number().int().min(1).max(90),
});

export async function saveGeneral(_p: ActionState, f: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("settings.manage");
    const v = generalSchema.parse({
      companyName: str(f, "companyName"), accentColor: str(f, "accentColor"), timezone: str(f, "timezone"),
      stuckApplicationDays: int(f, "stuckApplicationDays"), chargebackUrgentDays: int(f, "chargebackUrgentDays"),
      ticketFirstResponseMinutes: int(f, "ticketFirstResponseMinutes"), ticketSlaWarnMinutes: int(f, "ticketSlaWarnMinutes"), staleLeadDays: int(f, "staleLeadDays"),
    });
    await setSetting("general", v, user.id);
    await audit(await actorFor(user), "settings.update", "settings", "general", v);
    revalidatePath("/", "layout");
    return { ok: "General settings saved." };
  } catch (e) { return fail(e); }
}

// ── Security ──────────────────────────────────────────────────────────────────
const securitySchema = z.object({
  sessionHours: z.number().int().min(1).max(168),
  rememberMeDays: z.number().int().min(1).max(90),
  lockoutAttempts: z.number().int().min(3).max(20),
  lockoutMinutes: z.number().int().min(1).max(1440),
  passwordMinLength: z.number().int().min(8).max(64),
  resetTokenMinutes: z.number().int().min(5).max(1440),
  inviteTokenHours: z.number().int().min(1).max(336),
});

export async function saveSecurity(_p: ActionState, f: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("settings.manage");
    const v = securitySchema.parse(Object.fromEntries(Object.keys(securitySchema.shape).map((k) => [k, int(f, k)])));
    await setSetting("security", v, user.id);
    await audit(await actorFor(user), "settings.update", "settings", "security", v);
    return { ok: "Security settings saved." };
  } catch (e) { return fail(e); }
}

// ── Email ─────────────────────────────────────────────────────────────────────
export async function saveEmail(_p: ActionState, f: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("settings.manage");
    const cur = await getSetting("email");
    const v = z.object({
      enabled: z.boolean(), host: z.string().min(1, "Required"), port: z.number().int().min(1).max(65535), secure: z.boolean(),
      username: z.string(), fromAddress: z.string().email("Enter a valid email"), fromName: z.string().min(1, "Required"),
      replyTo: z.string().refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Enter a valid email"),
      postalAddress: z.string().max(300), sendsPerMinute: z.number().int().min(1, "At least 1").max(600, "600 at most"),
    }).parse({ enabled: bool(f, "enabled"), host: str(f, "host"), port: int(f, "port"), secure: bool(f, "secure"), username: str(f, "username"), fromAddress: str(f, "fromAddress"), fromName: str(f, "fromName"),
      replyTo: str(f, "replyTo"), postalAddress: str(f, "postalAddress"), sendsPerMinute: int(f, "sendsPerMinute") });
    await setSetting("email", { ...v, passwordEnc: nextSecret(str(f, "password"), cur.passwordEnc) }, user.id);
    await audit(await actorFor(user), "settings.update", "settings", "email", { ...v, passwordChanged: !!str(f, "password") });
    return { ok: "Email settings saved." };
  } catch (e) { return fail(e); }
}

export async function sendTestEmail(): Promise<ActionState> {
  try {
    const user = await requirePermission("settings.manage");
    const { sendMail } = await import("@/lib/mail");
    const r = await sendMail(user.email, "Impeccabyte CRM test email", "This is a test email from Settings → Email. If you can read this, email sending works.");
    return r.ok ? { ok: `Test email sent to ${user.email}.` } : { error: r.error ?? "Send failed" };
  } catch (e) { return fail(e); }
}

// ── SSO ───────────────────────────────────────────────────────────────────────
export async function saveSso(_p: ActionState, f: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("settings.manage");
    const cur = await getSetting("sso");
    const v = z.object({
      enabled: z.boolean(), providerName: z.string().min(1).max(60), issuerUrl: z.string().refine((s) => s === "" || /^https:\/\//.test(s), "Must start with https://"),
      clientId: z.string(), allowedDomains: z.string(), autoProvision: z.boolean(), defaultRole: z.enum(["agent", "onboarding", "support", "manager"]), allowPasswordLogin: z.boolean(),
    }).parse({
      enabled: bool(f, "enabled"), providerName: str(f, "providerName"), issuerUrl: str(f, "issuerUrl").replace(/\/$/, ""), clientId: str(f, "clientId"),
      allowedDomains: str(f, "allowedDomains"), autoProvision: bool(f, "autoProvision"), defaultRole: str(f, "defaultRole"), allowPasswordLogin: bool(f, "allowPasswordLogin"),
    });
    const secretEnc = nextSecret(str(f, "clientSecret"), cur.clientSecretEnc);
    if (v.enabled && (!v.issuerUrl || !v.clientId || !secretEnc)) return { error: "To turn on SSO, fill in the issuer URL, client ID and client secret." };
    await setSetting("sso", { ...v, clientSecretEnc: secretEnc }, user.id);
    await audit(await actorFor(user), "settings.update", "settings", "sso", { ...v, secretChanged: !!str(f, "clientSecret") });
    return { ok: "Single sign-on settings saved." };
  } catch (e) { return fail(e); }
}

// ── Users & roles ─────────────────────────────────────────────────────────────
const AVATARS = ["av-1", "av-2", "av-3", "av-4", "av-5", "av-6", "av-7", "av-8"];

export async function inviteUser(_p: ActionState, f: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("users.manage");
    const v = z.object({
      name: z.string().min(1, "Required").max(80), email: z.string().email("Enter a valid email"),
      role: z.enum(["admin", "manager", "agent", "onboarding", "support"]), parentAgentId: z.string().uuid().optional().or(z.literal("")),
    }).parse({ name: str(f, "name"), email: str(f, "email").toLowerCase(), role: str(f, "role"), parentAgentId: str(f, "parentAgentId") });
    if (v.role === "admin" && user.role !== "admin") return { error: "Only admins can create admins." };
    const exists = await db.query.users.findFirst({ where: eq(schema.users.email, v.email) });
    if (exists) return { fieldErrors: { email: "A user with this email already exists." } };
    const [u] = await db.insert(schema.users).values({
      name: v.name, email: v.email, role: v.role, status: "invited", parentAgentId: v.parentAgentId || null, avatarColor: AVATARS[Math.floor(Math.random() * AVATARS.length)]!,
    }).returning();
    const mail = await issuePasswordLink(u!.id, u!.email, "invite");
    await audit(await actorFor(user), "user.invite", "user", u!.id, { email: v.email, role: v.role });
    revalidatePath("/settings/users");
    return mail.ok ? { ok: `Invite sent to ${v.email}.` } : { ok: `User created, but the invite email failed: ${mail.error}` };
  } catch (e) { return fail(e); }
}

export async function updateUser(_p: ActionState, f: FormData): Promise<ActionState> {
  try {
    const actor = await requirePermission("users.manage");
    const id = str(f, "id");
    const role = z.enum(["admin", "manager", "agent", "onboarding", "support"]).parse(str(f, "role"));
    const status = z.enum(["active", "invited", "disabled"]).parse(str(f, "status"));
    const parent = str(f, "parentAgentId");
    const target = await db.query.users.findFirst({ where: eq(schema.users.id, id) });
    if (!target) return { error: "User not found." };
    if ((role === "admin" || target.role === "admin") && actor.role !== "admin") return { error: "Only admins can change admin accounts." };
    if (id === actor.id && (role !== actor.role || status !== "active")) return { error: "You can't change your own role or disable yourself." };
    if (target.role === "admin" && (role !== "admin" || status !== "active")) {
      const [{ n }] = await db.select({ n: dsql<number>`count(*)::int` }).from(schema.users).where(and(eq(schema.users.role, "admin"), eq(schema.users.status, "active"), ne(schema.users.id, id)));
      if (n === 0) return { error: "Keep at least one active admin." };
    }
    await db.update(schema.users).set({ role, status, parentAgentId: parent && parent !== id ? parent : null }).where(eq(schema.users.id, id));
    if (status === "disabled") await destroyAllSessions(id);
    await audit(await actorFor(actor), "user.update", "user", id, { role, status, parentAgentId: parent || null });
    revalidatePath("/settings/users");
    return { ok: `Saved ${target.name}.` };
  } catch (e) { return fail(e); }
}

export async function sendPasswordLink(_p: ActionState, f: FormData): Promise<ActionState> {
  try {
    const actor = await requirePermission("users.manage");
    const target = await db.query.users.findFirst({ where: eq(schema.users.id, str(f, "id")) });
    if (!target) return { error: "User not found." };
    const r = await issuePasswordLink(target.id, target.email, target.passwordHash ? "reset" : "invite");
    await audit(await actorFor(actor), "user.password_link", "user", target.id);
    return r.ok ? { ok: `Password link sent to ${target.email}.` } : { error: r.error ?? "Email failed" };
  } catch (e) { return fail(e); }
}

// ── Integrations ──────────────────────────────────────────────────────────────
export async function saveConnection(_p: ActionState, f: FormData): Promise<ActionState> {
  try {
    const user = await requirePermission("integrations.manage");
    const id = str(f, "id");
    const conn = await getConnection(id);
    if (!conn) return { error: "Connection not found." };
    const mode = z.enum(["sandbox", "production"]).parse(str(f, "mode"));
    const base = str(f, "dashboardBaseUrl").replace(/\/$/, "");
    if (base && !/^https:\/\//.test(base)) return { fieldErrors: { dashboardBaseUrl: "Must start with https://" } };
    const cfgIn = {
      syncMerchants: bool(f, "syncMerchants"), syncApplications: bool(f, "syncApplications"), syncTickets: bool(f, "syncTickets"),
      syncChargebacks: bool(f, "syncChargebacks"), syncResiduals: bool(f, "syncResiduals"), syncPayouts: bool(f, "syncPayouts"),
      nightlySyncHourUtc: int(f, "nightlySyncHourUtc"), payoutLookbackDays: int(f, "payoutLookbackDays"), maxEventAgeHours: int(f, "maxEventAgeHours"),
      confirmWrites: mode === "production" ? true : bool(f, "confirmWrites"),
    };
    const cfg = z.object({
      nightlySyncHourUtc: z.number().int().min(0).max(23), payoutLookbackDays: z.number().int().min(1).max(365),
      maxEventAgeHours: z.number().int().min(0).max(8760),
    }).passthrough().parse(cfgIn);
    const token = str(f, "token");
    const tokenEnc = nextSecret(token, conn.tokenEnc);
    const enabled = bool(f, "enabled");
    if (enabled && !tokenEnc) return { fieldErrors: { token: "Add an API token before enabling this connection." } };
    await db.update(schema.processorConnections).set({
      name: str(f, "name") || conn.name, mode, enabled,
      dashboardBaseUrl: base || MAVERICK_HOSTS[mode],
      tokenType: z.enum(["agent", "appConnect", "merchant"]).parse(str(f, "tokenType") || "agent"),
      tokenEnc, tokenLast4: token ? last4(token) ?? token.slice(-4) : tokenEnc ? conn.tokenLast4 : null,
      webhookSecretEnc: nextSecret(str(f, "webhookSecret"), conn.webhookSecretEnc),
      config: { ...DEFAULT_CONFIG, ...configOf(conn), ...cfg },
    }).where(eq(schema.processorConnections.id, id));
    await audit(await actorFor(user), "integration.update", "processor_connection", id, { mode, enabled, tokenChanged: !!token, webhookSecretChanged: !!str(f, "webhookSecret"), config: cfg });
    revalidatePath(`/settings/integrations/${id}`);
    return { ok: "Connection saved. Changes apply to the next sync and webhook." };
  } catch (e) { return fail(e); }
}

export async function generateWebhookSecret(id: string): Promise<ActionState & { secret?: string }> {
  try {
    const user = await requirePermission("integrations.manage");
    const secret = randomToken(24);
    await db.update(schema.processorConnections).set({ webhookSecretEnc: encrypt(secret) }).where(eq(schema.processorConnections.id, id));
    await audit(await actorFor(user), "integration.webhook_secret_rotated", "processor_connection", id);
    revalidatePath(`/settings/integrations/${id}`);
    return { ok: "New webhook secret generated. Copy it into the Maverick Dashboard now — it won’t be shown again.", secret };
  } catch (e) { return fail(e); }
}

export async function rotateWebhookPath(id: string): Promise<ActionState> {
  try {
    const user = await requirePermission("integrations.manage");
    await db.update(schema.processorConnections).set({ webhookPath: newWebhookPath() }).where(eq(schema.processorConnections.id, id));
    await audit(await actorFor(user), "integration.webhook_url_rotated", "processor_connection", id);
    revalidatePath(`/settings/integrations/${id}`);
    return { ok: "Webhook URL changed. Update it in the Maverick Dashboard." };
  } catch (e) { return fail(e); }
}

export async function testConnection(id: string): Promise<ActionState & { detail?: string }> {
  try {
    const user = await requirePermission("integrations.manage");
    const conn = await getConnection(id);
    if (!conn) return { error: "Connection not found." };
    let result: { ok: boolean; message: string; detail?: string };
    try { result = await adapterFor(conn).testConnection(); } catch (err) { result = { ok: false, message: (err as Error).message }; }
    await db.update(schema.processorConnections).set({ lastTestAt: new Date(), lastTestOk: result.ok, lastTestMessage: result.message.slice(0, 500) }).where(eq(schema.processorConnections.id, id));
    await audit(await actorFor(user), "integration.test", "processor_connection", id, { ok: result.ok });
    revalidatePath(`/settings/integrations/${id}`);
    return result.ok ? { ok: result.message } : { error: result.message, detail: result.detail };
  } catch (e) { return fail(e); }
}

export async function resyncNow(id: string, kind: SyncKind): Promise<ActionState> {
  try {
    const user = await requirePermission("integrations.manage");
    const conn = await getConnection(id);
    if (!conn) return { error: "Connection not found." };
    if (!conn.enabled) return { error: "Enable the connection first." };
    await enqueueSync(id, kind, user.id);
    await audit(await actorFor(user), "integration.resync_requested", "processor_connection", id, { kind });
    return { ok: `Re-sync (${kind}) queued. The worker picks it up within a few seconds.` };
  } catch (e) { return fail(e); }
}

export async function retryEvent(eventId: string): Promise<ActionState> {
  try {
    const user = await requirePermission("integrations.manage");
    const ev = await db.query.webhookEvents.findFirst({ where: eq(schema.webhookEvents.id, eventId) });
    if (!ev) return { error: "Event not found." };
    if (ev.status === "rejected") return { error: "Rejected events (bad signature or envelope) can't be retried." };
    await db.update(schema.webhookEvents).set({ status: "retrying", attempts: 0, lastError: null }).where(eq(schema.webhookEvents.id, eventId));
    await enqueueWebhook(eventId);
    await audit(await actorFor(user), "integration.event_retry", "webhook_event", eventId);
    revalidatePath(`/settings/integrations/${ev.connectionId}`);
    return { ok: "Event queued for retry." };
  } catch (e) { return fail(e); }
}

export async function addConnection(): Promise<void> {
  const user = await requirePermission("integrations.manage");
  const [c] = await db.insert(schema.processorConnections).values({
    name: "Maverick (new)", processor: "maverick", mode: "sandbox", enabled: false, dashboardBaseUrl: MAVERICK_HOSTS.sandbox, webhookPath: newWebhookPath(), config: DEFAULT_CONFIG,
  }).returning();
  await audit(await actorFor(user), "integration.create", "processor_connection", c!.id);
  redirect(`/settings/integrations/${c!.id}`);
}
