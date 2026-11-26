CREATE TYPE "public"."portal_user_status" AS ENUM('invited', 'active', 'disabled');--> statement-breakpoint
ALTER TYPE "public"."ticket_source" ADD VALUE 'portal';--> statement-breakpoint
CREATE TABLE "portal_password_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"portal_user_id" uuid NOT NULL,
	"purpose" text DEFAULT 'reset' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"portal_user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text,
	"status" "portal_user_status" DEFAULT 'invited' NOT NULL,
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"invited_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ticket_messages" ADD COLUMN "author_portal_user_id" uuid;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "portal_kind" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "portal_details" jsonb;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "portal_sensitive_enc" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "portal_user_id" uuid;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "chargeback_id" uuid;--> statement-breakpoint
ALTER TABLE "portal_password_tokens" ADD CONSTRAINT "portal_password_tokens_portal_user_id_portal_users_id_fk" FOREIGN KEY ("portal_user_id") REFERENCES "public"."portal_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_sessions" ADD CONSTRAINT "portal_sessions_portal_user_id_portal_users_id_fk" FOREIGN KEY ("portal_user_id") REFERENCES "public"."portal_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_users" ADD CONSTRAINT "portal_users_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_users" ADD CONSTRAINT "portal_users_invited_by_id_users_id_fk" FOREIGN KEY ("invited_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "portal_sessions_user_idx" ON "portal_sessions" USING btree ("portal_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_users_email_uq" ON "portal_users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "portal_users_merchant_idx" ON "portal_users" USING btree ("merchant_id");--> statement-breakpoint
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_author_portal_user_id_portal_users_id_fk" FOREIGN KEY ("author_portal_user_id") REFERENCES "public"."portal_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_portal_user_id_portal_users_id_fk" FOREIGN KEY ("portal_user_id") REFERENCES "public"."portal_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_chargeback_id_chargebacks_id_fk" FOREIGN KEY ("chargeback_id") REFERENCES "public"."chargebacks"("id") ON DELETE set null ON UPDATE no action;