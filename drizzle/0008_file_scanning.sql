ALTER TABLE "files" ADD COLUMN "scan_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "scan_result" text;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "scanned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "scan_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "files_scan_idx" ON "files" USING btree ("scan_status");