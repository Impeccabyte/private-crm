CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid,
	"submission_id" uuid,
	"form_id" uuid,
	"field_id" text,
	"field_label" text,
	"original_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"sha256" text NOT NULL,
	"storage_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_submission_id_lead_form_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."lead_form_submissions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_form_id_lead_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."lead_forms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "files_lead_idx" ON "files" USING btree ("lead_id");