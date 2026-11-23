/**
 * Impeccabyte CRM data model.
 * Every processor-sourced row carries `connectionId` + `processor` + the processor's own id (`externalId`),
 * so a second payment partner can be added without a rewrite.
 * Sensitive values (EIN, bank account/routing) are stored encrypted (`*Enc`) with a separate last-4 for display/search.
 */
import {
  pgTable, pgEnum, uuid, text, timestamp, boolean, integer, numeric, jsonb, date, bigserial,
  index, uniqueIndex, primaryKey, type AnyPgColumn,
} from "drizzle-orm/pg-core";

const money = (name: string) => numeric(name, { precision: 14, scale: 2, mode: "number" });
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const created = () => ts("created_at").notNull().defaultNow();
const updated = () => ts("updated_at").notNull().defaultNow().$onUpdate(() => new Date());

// ── Enums ─────────────────────────────────────────────────────────────────────
export const roleEnum = pgEnum("role", ["admin", "manager", "agent", "onboarding", "support"]);
export const userStatusEnum = pgEnum("user_status", ["active", "invited", "disabled"]);
export const merchantStatusEnum = pgEnum("merchant_status", ["prospect", "boarding", "live", "closed"]);
export const leadSourceEnum = pgEnum("lead_source", ["web_form", "referral", "import", "partner", "manual"]);
export const leadStatusEnum = pgEnum("lead_status", ["open", "converted", "disqualified"]);
export const dealStageEnum = pgEnum("deal_stage", ["new_lead", "contacted", "qualified", "proposal", "application_sent", "won", "lost"]);
export const appStatusEnum = pgEnum("application_status", ["New", "Pending", "Underwriting", "Approved", "Declined", "Cancelled"]);
export const signatureStatusEnum = pgEnum("signature_status", ["Unsigned", "Partially Signed", "Signed", "Rejected"]);
export const checkStatusEnum = pgEnum("check_status", ["Passed", "Failed", "Pending"]);
export const ticketStatusEnum = pgEnum("ticket_status", ["New", "In Progress", "On Hold", "Closed"]);
export const ticketSourceEnum = pgEnum("ticket_source", ["internal", "maverick"]);
export const ticketPriorityEnum = pgEnum("ticket_priority", ["low", "normal", "high"]);
export const messageKindEnum = pgEnum("message_kind", ["inbound", "outbound", "internal", "system"]);
export const chargebackStatusEnum = pgEnum("chargeback_status", ["Processed", "Won", "Lost"]);
export const disputeStatusEnum = pgEnum("dispute_status", ["none", "draft", "submitted", "accepted"]);
export const activityTypeEnum = pgEnum("activity_type", ["call", "email", "note", "task", "meeting", "system"]);
export const connectionModeEnum = pgEnum("connection_mode", ["sandbox", "production"]);
export const webhookStatusEnum = pgEnum("webhook_status", ["received", "processed", "failed", "retrying", "rejected", "ignored"]);
export const syncStatusEnum = pgEnum("sync_status", ["running", "succeeded", "failed"]);

// ── Users, sessions, auth ─────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  role: roleEnum("role").notNull().default("agent"),
  /** Sub-agents roll up to an agent. */
  parentAgentId: uuid("parent_agent_id").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
  passwordHash: text("password_hash"),
  status: userStatusEnum("status").notNull().default("active"),
  failedLoginCount: integer("failed_login_count").notNull().default(0),
  lockedUntil: ts("locked_until"),
  lastLoginAt: ts("last_login_at"),
  avatarColor: text("avatar_color").notNull().default("av-6"),
  createdAt: created(),
  updatedAt: updated(),
}, (t) => [uniqueIndex("users_email_uq").on(t.email)]);

export const sessions = pgTable("sessions", {
  /** sha256 of the opaque cookie token; the raw token is never stored. */
  id: text("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: ts("expires_at").notNull(),
  ip: text("ip"),
  userAgent: text("user_agent"),
  createdAt: created(),
}, (t) => [index("sessions_user_idx").on(t.userId)]);

export const passwordTokens = pgTable("password_tokens", {
  id: text("id").primaryKey(), // sha256 of token
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  purpose: text("purpose").notNull().default("reset"), // reset | invite
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  createdAt: created(),
});

// ── Settings & integrations ───────────────────────────────────────────────────
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: updated(),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
});

export const processorConnections = pgTable("processor_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  processor: text("processor").notNull().default("maverick"),
  name: text("name").notNull(),
  mode: connectionModeEnum("mode").notNull().default("sandbox"),
  enabled: boolean("enabled").notNull().default(false),
  /** e.g. https://sandbox-dashboard.maverickpayments.com */
  dashboardBaseUrl: text("dashboard_base_url"),
  tokenType: text("token_type").notNull().default("agent"),
  tokenEnc: text("token_enc"),
  tokenLast4: text("token_last4"),
  webhookSecretEnc: text("webhook_secret_enc"),
  /** Public, unguessable path segment for this connection's webhook URL. */
  webhookPath: text("webhook_path").notNull(),
  /** Sync toggles, page size, schedule etc. See src/lib/integrations.ts */
  config: jsonb("config").notNull().default({}),
  lastSyncAt: ts("last_sync_at"),
  lastSyncStatus: syncStatusEnum("last_sync_status"),
  lastSyncError: text("last_sync_error"),
  lastTestAt: ts("last_test_at"),
  lastTestOk: boolean("last_test_ok"),
  lastTestMessage: text("last_test_message"),
  createdAt: created(),
  updatedAt: updated(),
}, (t) => [uniqueIndex("conn_webhook_path_uq").on(t.webhookPath)]);

export const webhookEvents = pgTable("webhook_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  connectionId: uuid("connection_id").notNull().references(() => processorConnections.id, { onDelete: "cascade" }),
  externalId: text("external_id"),
  module: text("module"),
  action: text("action"),
  eventDate: text("event_date"),
  signatureValid: boolean("signature_valid").notNull().default(false),
  status: webhookStatusEnum("status").notNull().default("received"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  payload: jsonb("payload").notNull(),
  receivedAt: ts("received_at").notNull().defaultNow(),
  processedAt: ts("processed_at"),
}, (t) => [
  uniqueIndex("webhook_dedupe_uq").on(t.connectionId, t.externalId),
  index("webhook_status_idx").on(t.status, t.receivedAt),
]);

export const syncRuns = pgTable("sync_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  connectionId: uuid("connection_id").notNull().references(() => processorConnections.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  status: syncStatusEnum("status").notNull().default("running"),
  stats: jsonb("stats").notNull().default({}),
  error: text("error"),
  triggeredBy: uuid("triggered_by").references(() => users.id, { onDelete: "set null" }),
  startedAt: ts("started_at").notNull().defaultNow(),
  finishedAt: ts("finished_at"),
});

// ── Merchant hierarchy: legal entity → DBA → MID → terminal ─────────────────
export const legalEntities = pgTable("legal_entities", {
  id: uuid("id").primaryKey().defaultRandom(),
  legalName: text("legal_name").notNull(),
  entityType: text("entity_type"),
  stateOfFormation: text("state_of_formation"),
  einEnc: text("ein_enc"),
  einLast4: text("ein_last4"),
  createdAt: created(),
  updatedAt: updated(),
}, (t) => [index("le_ein_last4_idx").on(t.einLast4)]);

export const merchants = pgTable("merchants", {
  id: uuid("id").primaryKey().defaultRandom(),
  legalEntityId: uuid("legal_entity_id").references(() => legalEntities.id, { onDelete: "set null" }),
  connectionId: uuid("connection_id").references(() => processorConnections.id, { onDelete: "set null" }),
  processor: text("processor"),
  externalId: text("external_id"), // processor DBA id
  dbaName: text("dba_name").notNull(),
  status: merchantStatusEnum("status").notNull().default("prospect"),
  mcc: text("mcc"),
  industry: text("industry"),
  street: text("street"),
  city: text("city"),
  state: text("state"),
  zip: text("zip"),
  mailingAddress: text("mailing_address"),
  csPhone: text("cs_phone"),
  csEmail: text("cs_email"),
  website: text("website"),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
  liveSince: date("live_since"),
  reserveBalance: money("reserve_balance"),
  reserveTarget: money("reserve_target"),
  /** Hidden from lists and search (inactive, incomplete boarding records). Null = visible. Reversible. */
  hiddenAt: ts("hidden_at"),
  hiddenById: uuid("hidden_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: created(),
  updatedAt: updated(),
}, (t) => [
  index("merchants_owner_idx").on(t.ownerId),
  index("merchants_status_idx").on(t.status),
  uniqueIndex("merchants_ext_uq").on(t.connectionId, t.externalId),
]);

export const merchantAccounts = pgTable("merchant_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  connectionId: uuid("connection_id").references(() => processorConnections.id, { onDelete: "set null" }),
  processor: text("processor").notNull().default("maverick"),
  externalId: text("external_id"),
  mid: text("mid").notNull(),
  processingMethod: text("processing_method").notNull().default("Acquiring"),
  channel: text("channel").notNull().default("Card present"),
  status: text("status").notNull().default("Live"),
  riskLevel: text("risk_level"),
  bankName: text("bank_name"),
  bankAccountEnc: text("bank_account_enc"),
  bankAccountLast4: text("bank_account_last4"),
  routingLast4: text("routing_last4"),
  openedAt: date("opened_at"),
  closedAt: date("closed_at"),
  createdAt: created(),
  updatedAt: updated(),
}, (t) => [
  uniqueIndex("ma_processor_mid_uq").on(t.processor, t.mid),
  index("ma_merchant_idx").on(t.merchantId),
]);

export const terminals = pgTable("terminals", {
  id: uuid("id").primaryKey().defaultRandom(),
  merchantAccountId: uuid("merchant_account_id").notNull().references(() => merchantAccounts.id, { onDelete: "cascade" }),
  externalId: text("external_id"),
  tid: text("tid").notNull(),
  name: text("name"),
  model: text("model"),
  location: text("location"),
  status: text("status").notNull().default("Active"),
  lastBatchAt: ts("last_batch_at"),
  createdAt: created(),
}, (t) => [index("terminals_ma_idx").on(t.merchantAccountId)]);

export const contacts = pgTable("contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  merchantId: uuid("merchant_id").references(() => merchants.id, { onDelete: "cascade" }),
  legalEntityId: uuid("legal_entity_id").references(() => legalEntities.id, { onDelete: "cascade" }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  title: text("title"),
  email: text("email"),
  phone: text("phone"),
  ownershipPct: integer("ownership_pct"),
  /** Association labels: Owner, Signer, Guarantor, Billing, Technical, Primary */
  labels: text("labels").array().notNull().default([]),
  lastContactedAt: ts("last_contacted_at"),
  createdAt: created(),
}, (t) => [index("contacts_merchant_idx").on(t.merchantId)]);

// ── Sales pipeline ────────────────────────────────────────────────────────────
export const leads = pgTable("leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessName: text("business_name").notNull(),
  contactName: text("contact_name"),
  email: text("email"),
  phone: text("phone"),
  website: text("website"),
  source: leadSourceEnum("source").notNull().default("manual"),
  mcc: text("mcc"),
  industry: text("industry"),
  estMonthlyVolume: money("est_monthly_volume"),
  currentProcessor: text("current_processor"),
  einLast4: text("ein_last4"),
  /** Transparent score parts (0–100 total). */
  scoreFit: integer("score_fit").notNull().default(0),
  scoreVolume: integer("score_volume").notNull().default(0),
  scoreEngagement: integer("score_engagement").notNull().default(0),
  scoreSource: integer("score_source").notNull().default(0),
  status: leadStatusEnum("status").notNull().default("open"),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
  merchantId: uuid("merchant_id").references(() => merchants.id, { onDelete: "set null" }),
  lastActivityAt: ts("last_activity_at"),
  lastActivityNote: text("last_activity_note"),
  /** The lead form that created this lead, if any. */
  formId: uuid("form_id").references((): AnyPgColumn => leadForms.id, { onDelete: "set null" }),
  createdAt: created(),
  updatedAt: updated(),
}, (t) => [index("leads_owner_idx").on(t.ownerId)]);

// ── Lead forms (embeddable on external sites) ─────────────────────────────────
/** Field definitions and settings are JSON; their shapes live in src/lib/lead-forms/types.ts. */
export const leadForms = pgTable("lead_forms", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Public id used in the hosted URL and embed snippet (not guessable from the uuid). */
  publicId: text("public_id").notNull(),
  name: text("name").notNull(),
  status: text("status").notNull().default("draft"), // draft | published
  fields: jsonb("fields").notNull().default([]),
  settings: jsonb("settings").notNull().default({}),
  publishedAt: ts("published_at"),
  archivedAt: ts("archived_at"),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: created(),
  updatedAt: updated(),
}, (t) => [uniqueIndex("lead_forms_public_uq").on(t.publicId)]);

export const leadFormSubmissions = pgTable("lead_form_submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  formId: uuid("form_id").notNull().references(() => leadForms.id, { onDelete: "cascade" }),
  leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
  /** created = new lead; matched = added to an existing open lead with the same email or phone. */
  outcome: text("outcome").notNull(),
  data: jsonb("data").notNull().default({}),
  /** sha256 of IP + app key, for rate limiting only. */
  ipHash: text("ip_hash"),
  userAgent: text("user_agent"),
  /** Page the form was embedded on, as reported by the embed script. */
  pageUrl: text("page_url"),
  createdAt: created(),
}, (t) => [index("lfs_form_idx").on(t.formId, t.createdAt), index("lfs_ip_idx").on(t.ipHash, t.createdAt)]);

/** Uploaded files (encrypted on disk; see src/lib/files.ts). Currently attached to leads via lead forms. */
export const files = pgTable("files", {
  id: uuid("id").primaryKey().defaultRandom(),
  leadId: uuid("lead_id").references(() => leads.id, { onDelete: "cascade" }),
  submissionId: uuid("submission_id").references(() => leadFormSubmissions.id, { onDelete: "set null" }),
  formId: uuid("form_id").references(() => leadForms.id, { onDelete: "set null" }),
  /** The form field and its label at upload time, e.g. "Recent merchant statements". */
  fieldId: text("field_id"),
  fieldLabel: text("field_label"),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  sha256: text("sha256").notNull(),
  storageKey: text("storage_key").notNull(),
  /**
   * pending = waiting for the scanner (it was unreachable at upload; the worker retries), clean, infected
   * (content deleted, kept as a record), unscanned = uploaded while scanning wasn't configured.
   */
  scanStatus: text("scan_status").notNull().default("pending"),
  scanResult: text("scan_result"),
  scannedAt: ts("scanned_at"),
  scanAttempts: integer("scan_attempts").notNull().default(0),
  createdAt: created(),
}, (t) => [index("files_lead_idx").on(t.leadId), index("files_scan_idx").on(t.scanStatus)]);

export const deals = pgTable("deals", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
  merchantId: uuid("merchant_id").references(() => merchants.id, { onDelete: "set null" }),
  stage: dealStageEnum("stage").notNull().default("new_lead"),
  amount: money("amount").notNull().default(0), // est. monthly volume
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
  stageChangedAt: ts("stage_changed_at").notNull().defaultNow(),
  lostReason: text("lost_reason"),
  closedAt: ts("closed_at"),
  createdAt: created(),
  updatedAt: updated(),
}, (t) => [index("deals_stage_idx").on(t.stage), index("deals_owner_idx").on(t.ownerId)]);

export const dealStageHistory = pgTable("deal_stage_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  dealId: uuid("deal_id").notNull().references(() => deals.id, { onDelete: "cascade" }),
  stage: dealStageEnum("stage").notNull(),
  enteredAt: ts("entered_at").notNull().defaultNow(),
});

// ── Boarding applications ─────────────────────────────────────────────────────
export const applications = pgTable("applications", {
  id: uuid("id").primaryKey().defaultRandom(),
  number: text("number").notNull(),
  merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  dealId: uuid("deal_id").references(() => deals.id, { onDelete: "set null" }),
  connectionId: uuid("connection_id").references(() => processorConnections.id, { onDelete: "set null" }),
  processor: text("processor").notNull().default("maverick"),
  externalId: text("external_id"),
  campaign: text("campaign"),
  forLabel: text("for_label"),
  status: appStatusEnum("status").notNull().default("New"),
  conditional: boolean("conditional").notNull().default(false),
  signatureStatus: signatureStatusEnum("signature_status").notNull().default("Unsigned"),
  /** Checklist section → state ("complete" | "partial" | "missing") and summary text. */
  sections: jsonb("sections").notNull().default({}),
  estMonthlyVolume: money("est_monthly_volume"),
  avgTicket: money("avg_ticket"),
  highTicket: money("high_ticket"),
  specialistId: uuid("specialist_id").references(() => users.id, { onDelete: "set null" }),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
  completionUrl: text("completion_url"),
  statusChangedAt: ts("status_changed_at").notNull().defaultNow(),
  approvedAt: ts("approved_at"),
  firstBatchAt: ts("first_batch_at"),
  createdAt: created(),
  updatedAt: updated(),
}, (t) => [
  uniqueIndex("app_number_uq").on(t.number),
  uniqueIndex("app_ext_uq").on(t.connectionId, t.externalId),
  index("app_status_idx").on(t.status),
]);

export const applicationStatusHistory = pgTable("application_status_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  applicationId: uuid("application_id").notNull().references(() => applications.id, { onDelete: "cascade" }),
  status: appStatusEnum("status").notNull(),
  at: ts("at").notNull().defaultNow(),
});

export const applicationChecks = pgTable("application_checks", {
  id: uuid("id").primaryKey().defaultRandom(),
  applicationId: uuid("application_id").notNull().references(() => applications.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  status: checkStatusEnum("status").notNull().default("Pending"),
  detail: text("detail"),
  checkedAt: ts("checked_at").notNull().defaultNow(),
});

export const applicationConditions = pgTable("application_conditions", {
  id: uuid("id").primaryKey().defaultRandom(),
  applicationId: uuid("application_id").notNull().references(() => applications.id, { onDelete: "cascade" }),
  externalId: text("external_id"),
  content: text("content").notNull(),
  detail: text("detail"),
  met: boolean("met").notNull().default(false),
  metAt: ts("met_at"),
});

export const applicationSigners = pgTable("application_signers", {
  id: uuid("id").primaryKey().defaultRandom(),
  applicationId: uuid("application_id").notNull().references(() => applications.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email"),
  role: text("role"),
  ownershipPct: integer("ownership_pct"),
  status: signatureStatusEnum("status").notNull().default("Unsigned"),
  lastEvent: text("last_event"),
  signedAt: ts("signed_at"),
});

export const applicationDocuments = pgTable("application_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  applicationId: uuid("application_id").notNull().references(() => applications.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  required: boolean("required").notNull().default(true),
  uploaded: boolean("uploaded").notNull().default(false),
  uploadedAt: ts("uploaded_at"),
});

// ── Support ───────────────────────────────────────────────────────────────────
export const tickets = pgTable("tickets", {
  id: uuid("id").primaryKey().defaultRandom(),
  number: text("number").notNull(),
  merchantId: uuid("merchant_id").references(() => merchants.id, { onDelete: "set null" }),
  connectionId: uuid("connection_id").references(() => processorConnections.id, { onDelete: "set null" }),
  source: ticketSourceEnum("source").notNull().default("internal"),
  externalId: text("external_id"),
  subject: text("subject").notNull(),
  category: text("category"),
  status: ticketStatusEnum("status").notNull().default("New"),
  priority: ticketPriorityEnum("priority").notNull().default("normal"),
  assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  slaDueAt: ts("sla_due_at"),
  firstResponseAt: ts("first_response_at"),
  closedAt: ts("closed_at"),
  createdAt: created(),
  updatedAt: updated(),
}, (t) => [
  uniqueIndex("tickets_number_uq").on(t.number),
  uniqueIndex("tickets_ext_uq").on(t.connectionId, t.externalId),
  index("tickets_status_idx").on(t.status),
]);

export const ticketMessages = pgTable("ticket_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  ticketId: uuid("ticket_id").notNull().references(() => tickets.id, { onDelete: "cascade" }),
  externalId: text("external_id"),
  kind: messageKindEnum("kind").notNull(),
  authorName: text("author_name"),
  authorUserId: uuid("author_user_id").references(() => users.id, { onDelete: "set null" }),
  body: text("body").notNull(),
  notifyMerchant: boolean("notify_merchant").notNull().default(false),
  createdAt: created(),
}, (t) => [index("tm_ticket_idx").on(t.ticketId)]);

// ── Risk & money ──────────────────────────────────────────────────────────────
export const chargebacks = pgTable("chargebacks", {
  id: uuid("id").primaryKey().defaultRandom(),
  merchantId: uuid("merchant_id").references(() => merchants.id, { onDelete: "set null" }),
  merchantAccountId: uuid("merchant_account_id").references(() => merchantAccounts.id, { onDelete: "set null" }),
  connectionId: uuid("connection_id").references(() => processorConnections.id, { onDelete: "set null" }),
  externalId: text("external_id"),
  caseId: text("case_id").notNull(),
  amount: money("amount").notNull(),
  reasonCode: text("reason_code"),
  reason: text("reason"),
  cardBrand: text("card_brand"),
  cardLast4: text("card_last4"),
  transactionDate: date("transaction_date"),
  receivedAt: date("received_at").notNull(),
  respondBy: date("respond_by"),
  status: chargebackStatusEnum("status").notNull().default("Processed"),
  disputeStatus: disputeStatusEnum("dispute_status").notNull().default("none"),
  disputeNotes: text("dispute_notes"),
  createdAt: created(),
  updatedAt: updated(),
}, (t) => [uniqueIndex("cb_ext_uq").on(t.connectionId, t.externalId), index("cb_merchant_idx").on(t.merchantId)]);

export const payouts = pgTable("payouts", {
  id: uuid("id").primaryKey().defaultRandom(),
  merchantAccountId: uuid("merchant_account_id").notNull().references(() => merchantAccounts.id, { onDelete: "cascade" }),
  depositDate: date("deposit_date").notNull(),
  batches: integer("batches").notNull().default(1),
  gross: money("gross").notNull(),
  fees: money("fees").notNull().default(0),
  chargebacks: money("chargebacks").notNull().default(0),
  reserve: money("reserve").notNull().default(0),
  net: money("net").notNull(),
  status: text("status").notNull().default("Deposited"),
}, (t) => [uniqueIndex("payout_day_uq").on(t.merchantAccountId, t.depositDate)]);

/** Stored daily snapshots: Maverick only returns ~5 days of batches by default, so history lives here. */
export const dailyMetrics = pgTable("daily_metrics", {
  merchantAccountId: uuid("merchant_account_id").notNull().references(() => merchantAccounts.id, { onDelete: "cascade" }),
  day: date("day").notNull(),
  salesCount: integer("sales_count").notNull().default(0),
  salesAmount: money("sales_amount").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.merchantAccountId, t.day] })]);

export const residualLines = pgTable("residual_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  connectionId: uuid("connection_id").references(() => processorConnections.id, { onDelete: "set null" }),
  processor: text("processor").notNull().default("maverick"),
  externalId: text("external_id"),
  merchantAccountId: uuid("merchant_account_id").references(() => merchantAccounts.id, { onDelete: "set null" }),
  /** Free-text label for book-level rows that aren't tied to one MID (e.g. legacy portfolio). */
  label: text("label"),
  period: date("period").notNull(), // first day of month
  agentId: uuid("agent_id").references(() => users.id, { onDelete: "set null" }),
  salesCount: integer("sales_count").notNull().default(0),
  salesAmount: money("sales_amount").notNull().default(0),
  revenue: money("revenue").notNull().default(0),
  expense: money("expense").notNull().default(0),
  splitPct: numeric("split_pct", { precision: 5, scale: 2, mode: "number" }).notNull().default(100),
  adjustment: money("adjustment").notNull().default(0),
  adjustmentNote: text("adjustment_note"),
  profit: money("profit").notNull().default(0),
  held: money("held").notNull().default(0),
  heldNote: text("held_note"),
  publishedAt: ts("published_at"),
}, (t) => [index("res_period_idx").on(t.period), uniqueIndex("res_ext_uq").on(t.connectionId, t.externalId)]);

// ── Activity, tasks, audit ────────────────────────────────────────────────────
export const activities = pgTable("activities", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: activityTypeEnum("type").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  merchantId: uuid("merchant_id").references(() => merchants.id, { onDelete: "cascade" }),
  leadId: uuid("lead_id").references(() => leads.id, { onDelete: "cascade" }),
  dealId: uuid("deal_id").references(() => deals.id, { onDelete: "cascade" }),
  applicationId: uuid("application_id").references(() => applications.id, { onDelete: "cascade" }),
  actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  /** internal | maverick */
  source: text("source").notNull().default("internal"),
  tag: text("tag"),
  internal: boolean("internal").notNull().default(false),
  occurredAt: ts("occurred_at").notNull().defaultNow(),
}, (t) => [
  index("act_merchant_idx").on(t.merchantId, t.occurredAt),
  index("act_app_idx").on(t.applicationId),
]);

export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  detail: text("detail"),
  dueAt: ts("due_at"),
  assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
  merchantId: uuid("merchant_id").references(() => merchants.id, { onDelete: "cascade" }),
  leadId: uuid("lead_id").references(() => leads.id, { onDelete: "cascade" }),
  dealId: uuid("deal_id").references(() => deals.id, { onDelete: "cascade" }),
  completedAt: ts("completed_at"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: created(),
}, (t) => [index("tasks_assignee_idx").on(t.assigneeId, t.dueAt)]);

/** Append-only: UPDATE and DELETE are blocked by a trigger (see drizzle/0001_audit_append_only.sql). */
export const auditLog = pgTable("audit_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  at: ts("at").notNull().defaultNow(),
  actorUserId: uuid("actor_user_id"),
  actorEmail: text("actor_email"),
  action: text("action").notNull(),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  ip: text("ip"),
  details: jsonb("details").notNull().default({}),
}, (t) => [index("audit_at_idx").on(t.at), index("audit_entity_idx").on(t.entityType, t.entityId)]);
