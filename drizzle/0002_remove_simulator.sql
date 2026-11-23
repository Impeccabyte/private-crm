-- The simulator connection is gone. Its webhook events and sync runs cascade; records it owned keep a null connection.
DELETE FROM "processor_connections" WHERE "mode" = 'simulator';--> statement-breakpoint
ALTER TABLE "processor_connections" ALTER COLUMN "mode" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "processor_connections" ALTER COLUMN "mode" SET DEFAULT 'sandbox'::text;--> statement-breakpoint
DROP TYPE "public"."connection_mode";--> statement-breakpoint
CREATE TYPE "public"."connection_mode" AS ENUM('sandbox', 'production');--> statement-breakpoint
ALTER TABLE "processor_connections" ALTER COLUMN "mode" SET DEFAULT 'sandbox'::"public"."connection_mode";--> statement-breakpoint
ALTER TABLE "processor_connections" ALTER COLUMN "mode" SET DATA TYPE "public"."connection_mode" USING "mode"::"public"."connection_mode";