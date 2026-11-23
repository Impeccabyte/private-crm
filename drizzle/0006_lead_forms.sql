CREATE TABLE "lead_form_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"form_id" uuid NOT NULL,
	"lead_id" uuid,
	"outcome" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip_hash" text,
	"user_agent" text,
	"page_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_forms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "form_id" uuid;--> statement-breakpoint
ALTER TABLE "lead_form_submissions" ADD CONSTRAINT "lead_form_submissions_form_id_lead_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."lead_forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_form_submissions" ADD CONSTRAINT "lead_form_submissions_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_forms" ADD CONSTRAINT "lead_forms_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lfs_form_idx" ON "lead_form_submissions" USING btree ("form_id","created_at");--> statement-breakpoint
CREATE INDEX "lfs_ip_idx" ON "lead_form_submissions" USING btree ("ip_hash","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_forms_public_uq" ON "lead_forms" USING btree ("public_id");--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_form_id_lead_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."lead_forms"("id") ON DELETE set null ON UPDATE no action;