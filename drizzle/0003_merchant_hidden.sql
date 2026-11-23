ALTER TABLE "merchants" ADD COLUMN "hidden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "hidden_by_id" uuid;--> statement-breakpoint
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_hidden_by_id_users_id_fk" FOREIGN KEY ("hidden_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;