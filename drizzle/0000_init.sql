CREATE TYPE "public"."activity_type" AS ENUM('call', 'email', 'note', 'task', 'meeting', 'system');--> statement-breakpoint
CREATE TYPE "public"."application_status" AS ENUM('New', 'Pending', 'Underwriting', 'Approved', 'Declined', 'Cancelled');--> statement-breakpoint
CREATE TYPE "public"."chargeback_status" AS ENUM('Processed', 'Won', 'Lost');--> statement-breakpoint
CREATE TYPE "public"."check_status" AS ENUM('Passed', 'Failed', 'Pending');--> statement-breakpoint
CREATE TYPE "public"."connection_mode" AS ENUM('simulator', 'sandbox', 'production');--> statement-breakpoint
CREATE TYPE "public"."deal_stage" AS ENUM('new_lead', 'contacted', 'qualified', 'proposal', 'application_sent', 'won', 'lost');--> statement-breakpoint
CREATE TYPE "public"."dispute_status" AS ENUM('none', 'draft', 'submitted', 'accepted');--> statement-breakpoint
CREATE TYPE "public"."lead_source" AS ENUM('web_form', 'referral', 'import', 'partner', 'manual');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('open', 'converted', 'disqualified');--> statement-breakpoint
CREATE TYPE "public"."merchant_status" AS ENUM('prospect', 'boarding', 'live', 'closed');--> statement-breakpoint
CREATE TYPE "public"."message_kind" AS ENUM('inbound', 'outbound', 'internal', 'system');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('admin', 'manager', 'agent', 'onboarding', 'support');--> statement-breakpoint
CREATE TYPE "public"."signature_status" AS ENUM('Unsigned', 'Partially Signed', 'Signed', 'Rejected');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."ticket_priority" AS ENUM('low', 'normal', 'high');--> statement-breakpoint
CREATE TYPE "public"."ticket_source" AS ENUM('internal', 'maverick');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('New', 'In Progress', 'On Hold', 'Closed');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'invited', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."webhook_status" AS ENUM('received', 'processed', 'failed', 'retrying', 'rejected', 'ignored');--> statement-breakpoint
CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "activity_type" NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"merchant_id" uuid,
	"lead_id" uuid,
	"deal_id" uuid,
	"application_id" uuid,
	"actor_user_id" uuid,
	"source" text DEFAULT 'internal' NOT NULL,
	"tag" text,
	"internal" boolean DEFAULT false NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" "check_status" DEFAULT 'Pending' NOT NULL,
	"detail" text,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_conditions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"external_id" text,
	"content" text NOT NULL,
	"detail" text,
	"met" boolean DEFAULT false NOT NULL,
	"met_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "application_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"name" text NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"uploaded" boolean DEFAULT false NOT NULL,
	"uploaded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "application_signers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"role" text,
	"ownership_pct" integer,
	"status" "signature_status" DEFAULT 'Unsigned' NOT NULL,
	"last_event" text,
	"signed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "application_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"status" "application_status" NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"merchant_id" uuid NOT NULL,
	"deal_id" uuid,
	"connection_id" uuid,
	"processor" text DEFAULT 'maverick' NOT NULL,
	"external_id" text,
	"campaign" text,
	"for_label" text,
	"status" "application_status" DEFAULT 'New' NOT NULL,
	"conditional" boolean DEFAULT false NOT NULL,
	"signature_status" "signature_status" DEFAULT 'Unsigned' NOT NULL,
	"sections" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"est_monthly_volume" numeric(14, 2),
	"avg_ticket" numeric(14, 2),
	"high_ticket" numeric(14, 2),
	"specialist_id" uuid,
	"owner_id" uuid,
	"completion_url" text,
	"status_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone,
	"first_batch_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_user_id" uuid,
	"actor_email" text,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"ip" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chargebacks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid,
	"merchant_account_id" uuid,
	"connection_id" uuid,
	"external_id" text,
	"case_id" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"reason_code" text,
	"reason" text,
	"card_brand" text,
	"card_last4" text,
	"transaction_date" date,
	"received_at" date NOT NULL,
	"respond_by" date,
	"status" chargeback_status DEFAULT 'Processed' NOT NULL,
	"dispute_status" "dispute_status" DEFAULT 'none' NOT NULL,
	"dispute_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid,
	"legal_entity_id" uuid,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"title" text,
	"email" text,
	"phone" text,
	"ownership_pct" integer,
	"labels" text[] DEFAULT '{}' NOT NULL,
	"last_contacted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_metrics" (
	"merchant_account_id" uuid NOT NULL,
	"day" date NOT NULL,
	"sales_count" integer DEFAULT 0 NOT NULL,
	"sales_amount" numeric(14, 2) DEFAULT 0 NOT NULL,
	CONSTRAINT "daily_metrics_merchant_account_id_day_pk" PRIMARY KEY("merchant_account_id","day")
);
--> statement-breakpoint
CREATE TABLE "deal_stage_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_id" uuid NOT NULL,
	"stage" "deal_stage" NOT NULL,
	"entered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"lead_id" uuid,
	"merchant_id" uuid,
	"stage" "deal_stage" DEFAULT 'new_lead' NOT NULL,
	"amount" numeric(14, 2) DEFAULT 0 NOT NULL,
	"owner_id" uuid,
	"stage_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lost_reason" text,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_name" text NOT NULL,
	"contact_name" text,
	"email" text,
	"phone" text,
	"website" text,
	"source" "lead_source" DEFAULT 'manual' NOT NULL,
	"mcc" text,
	"industry" text,
	"est_monthly_volume" numeric(14, 2),
	"current_processor" text,
	"ein_last4" text,
	"score_fit" integer DEFAULT 0 NOT NULL,
	"score_volume" integer DEFAULT 0 NOT NULL,
	"score_engagement" integer DEFAULT 0 NOT NULL,
	"score_source" integer DEFAULT 0 NOT NULL,
	"status" "lead_status" DEFAULT 'open' NOT NULL,
	"owner_id" uuid,
	"merchant_id" uuid,
	"last_activity_at" timestamp with time zone,
	"last_activity_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legal_entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legal_name" text NOT NULL,
	"entity_type" text,
	"state_of_formation" text,
	"ein_enc" text,
	"ein_last4" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"connection_id" uuid,
	"processor" text DEFAULT 'maverick' NOT NULL,
	"external_id" text,
	"mid" text NOT NULL,
	"processing_method" text DEFAULT 'Acquiring' NOT NULL,
	"channel" text DEFAULT 'Card present' NOT NULL,
	"status" text DEFAULT 'Live' NOT NULL,
	"risk_level" text,
	"bank_name" text,
	"bank_account_enc" text,
	"bank_account_last4" text,
	"routing_last4" text,
	"opened_at" date,
	"closed_at" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legal_entity_id" uuid,
	"connection_id" uuid,
	"processor" text,
	"external_id" text,
	"dba_name" text NOT NULL,
	"status" "merchant_status" DEFAULT 'prospect' NOT NULL,
	"mcc" text,
	"industry" text,
	"street" text,
	"city" text,
	"state" text,
	"zip" text,
	"mailing_address" text,
	"cs_phone" text,
	"cs_email" text,
	"website" text,
	"owner_id" uuid,
	"live_since" date,
	"reserve_balance" numeric(14, 2),
	"reserve_target" numeric(14, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" text DEFAULT 'reset' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_account_id" uuid NOT NULL,
	"deposit_date" date NOT NULL,
	"batches" integer DEFAULT 1 NOT NULL,
	"gross" numeric(14, 2) NOT NULL,
	"fees" numeric(14, 2) DEFAULT 0 NOT NULL,
	"chargebacks" numeric(14, 2) DEFAULT 0 NOT NULL,
	"reserve" numeric(14, 2) DEFAULT 0 NOT NULL,
	"net" numeric(14, 2) NOT NULL,
	"status" text DEFAULT 'Deposited' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processor_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"processor" text DEFAULT 'maverick' NOT NULL,
	"name" text NOT NULL,
	"mode" "connection_mode" DEFAULT 'sandbox' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"dashboard_base_url" text,
	"token_type" text DEFAULT 'agent' NOT NULL,
	"token_enc" text,
	"token_last4" text,
	"webhook_secret_enc" text,
	"webhook_path" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_sync_status" "sync_status",
	"last_sync_error" text,
	"last_test_at" timestamp with time zone,
	"last_test_ok" boolean,
	"last_test_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "residual_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid,
	"processor" text DEFAULT 'maverick' NOT NULL,
	"external_id" text,
	"merchant_account_id" uuid,
	"label" text,
	"period" date NOT NULL,
	"agent_id" uuid,
	"sales_count" integer DEFAULT 0 NOT NULL,
	"sales_amount" numeric(14, 2) DEFAULT 0 NOT NULL,
	"revenue" numeric(14, 2) DEFAULT 0 NOT NULL,
	"expense" numeric(14, 2) DEFAULT 0 NOT NULL,
	"split_pct" numeric(5, 2) DEFAULT 100 NOT NULL,
	"adjustment" numeric(14, 2) DEFAULT 0 NOT NULL,
	"adjustment_note" text,
	"profit" numeric(14, 2) DEFAULT 0 NOT NULL,
	"held" numeric(14, 2) DEFAULT 0 NOT NULL,
	"held_note" text,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" "sync_status" DEFAULT 'running' NOT NULL,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"triggered_by" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"detail" text,
	"due_at" timestamp with time zone,
	"assignee_id" uuid,
	"merchant_id" uuid,
	"lead_id" uuid,
	"deal_id" uuid,
	"completed_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "terminals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_account_id" uuid NOT NULL,
	"external_id" text,
	"tid" text NOT NULL,
	"name" text,
	"model" text,
	"location" text,
	"status" text DEFAULT 'Active' NOT NULL,
	"last_batch_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"external_id" text,
	"kind" "message_kind" NOT NULL,
	"author_name" text,
	"author_user_id" uuid,
	"body" text NOT NULL,
	"notify_merchant" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"merchant_id" uuid,
	"connection_id" uuid,
	"source" "ticket_source" DEFAULT 'internal' NOT NULL,
	"external_id" text,
	"subject" text NOT NULL,
	"category" text,
	"status" "ticket_status" DEFAULT 'New' NOT NULL,
	"priority" "ticket_priority" DEFAULT 'normal' NOT NULL,
	"assignee_id" uuid,
	"contact_name" text,
	"contact_email" text,
	"sla_due_at" timestamp with time zone,
	"first_response_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" "role" DEFAULT 'agent' NOT NULL,
	"parent_agent_id" uuid,
	"password_hash" text,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"avatar_color" text DEFAULT 'av-6' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"external_id" text,
	"module" text,
	"action" text,
	"event_date" text,
	"signature_valid" boolean DEFAULT false NOT NULL,
	"status" "webhook_status" DEFAULT 'received' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_checks" ADD CONSTRAINT "application_checks_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_conditions" ADD CONSTRAINT "application_conditions_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_documents" ADD CONSTRAINT "application_documents_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_signers" ADD CONSTRAINT "application_signers_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_status_history" ADD CONSTRAINT "application_status_history_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_connection_id_processor_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."processor_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_specialist_id_users_id_fk" FOREIGN KEY ("specialist_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chargebacks" ADD CONSTRAINT "chargebacks_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chargebacks" ADD CONSTRAINT "chargebacks_merchant_account_id_merchant_accounts_id_fk" FOREIGN KEY ("merchant_account_id") REFERENCES "public"."merchant_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chargebacks" ADD CONSTRAINT "chargebacks_connection_id_processor_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."processor_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_metrics" ADD CONSTRAINT "daily_metrics_merchant_account_id_merchant_accounts_id_fk" FOREIGN KEY ("merchant_account_id") REFERENCES "public"."merchant_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_stage_history" ADD CONSTRAINT "deal_stage_history_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_accounts" ADD CONSTRAINT "merchant_accounts_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_accounts" ADD CONSTRAINT "merchant_accounts_connection_id_processor_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."processor_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_connection_id_processor_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."processor_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_tokens" ADD CONSTRAINT "password_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_merchant_account_id_merchant_accounts_id_fk" FOREIGN KEY ("merchant_account_id") REFERENCES "public"."merchant_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "residual_lines" ADD CONSTRAINT "residual_lines_connection_id_processor_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."processor_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "residual_lines" ADD CONSTRAINT "residual_lines_merchant_account_id_merchant_accounts_id_fk" FOREIGN KEY ("merchant_account_id") REFERENCES "public"."merchant_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "residual_lines" ADD CONSTRAINT "residual_lines_agent_id_users_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_connection_id_processor_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."processor_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_triggered_by_users_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terminals" ADD CONSTRAINT "terminals_merchant_account_id_merchant_accounts_id_fk" FOREIGN KEY ("merchant_account_id") REFERENCES "public"."merchant_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_connection_id_processor_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."processor_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_parent_agent_id_users_id_fk" FOREIGN KEY ("parent_agent_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_connection_id_processor_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."processor_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "act_merchant_idx" ON "activities" USING btree ("merchant_id","occurred_at");--> statement-breakpoint
CREATE INDEX "act_app_idx" ON "activities" USING btree ("application_id");--> statement-breakpoint
CREATE UNIQUE INDEX "app_number_uq" ON "applications" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "app_ext_uq" ON "applications" USING btree ("connection_id","external_id");--> statement-breakpoint
CREATE INDEX "app_status_idx" ON "applications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "audit_at_idx" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cb_ext_uq" ON "chargebacks" USING btree ("connection_id","external_id");--> statement-breakpoint
CREATE INDEX "cb_merchant_idx" ON "chargebacks" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "contacts_merchant_idx" ON "contacts" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "deals_stage_idx" ON "deals" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "deals_owner_idx" ON "deals" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "leads_owner_idx" ON "leads" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "le_ein_last4_idx" ON "legal_entities" USING btree ("ein_last4");--> statement-breakpoint
CREATE UNIQUE INDEX "ma_processor_mid_uq" ON "merchant_accounts" USING btree ("processor","mid");--> statement-breakpoint
CREATE INDEX "ma_merchant_idx" ON "merchant_accounts" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "merchants_owner_idx" ON "merchants" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "merchants_status_idx" ON "merchants" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "merchants_ext_uq" ON "merchants" USING btree ("connection_id","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payout_day_uq" ON "payouts" USING btree ("merchant_account_id","deposit_date");--> statement-breakpoint
CREATE UNIQUE INDEX "conn_webhook_path_uq" ON "processor_connections" USING btree ("webhook_path");--> statement-breakpoint
CREATE INDEX "res_period_idx" ON "residual_lines" USING btree ("period");--> statement-breakpoint
CREATE UNIQUE INDEX "res_ext_uq" ON "residual_lines" USING btree ("connection_id","external_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tasks_assignee_idx" ON "tasks" USING btree ("assignee_id","due_at");--> statement-breakpoint
CREATE INDEX "terminals_ma_idx" ON "terminals" USING btree ("merchant_account_id");--> statement-breakpoint
CREATE INDEX "tm_ticket_idx" ON "ticket_messages" USING btree ("ticket_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tickets_number_uq" ON "tickets" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "tickets_ext_uq" ON "tickets" USING btree ("connection_id","external_id");--> statement-breakpoint
CREATE INDEX "tickets_status_idx" ON "tickets" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_dedupe_uq" ON "webhook_events" USING btree ("connection_id","external_id");--> statement-breakpoint
CREATE INDEX "webhook_status_idx" ON "webhook_events" USING btree ("status","received_at");