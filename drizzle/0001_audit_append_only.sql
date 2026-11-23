-- Fuzzy matching for duplicate detection and global search.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS merchants_dba_trgm ON merchants USING gin (dba_name gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS leads_name_trgm ON leads USING gin (business_name gin_trgm_ops);
--> statement-breakpoint
-- The audit log is append-only: block UPDATE and DELETE for every role.
CREATE OR REPLACE FUNCTION audit_log_block_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS audit_log_no_update ON audit_log;
--> statement-breakpoint
CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_block_mutation();
--> statement-breakpoint
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_block_mutation();
