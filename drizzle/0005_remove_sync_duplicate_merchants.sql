-- Application sync used to create a new, empty merchant for a boarding application on every run (it matched on the
-- Maverick DBA id, which boarding applications don't have yet). Remove those copies: synced merchants with no DBA id
-- and nothing attached to them at all. Merchants entered by hand have no connection and are never touched.
DELETE FROM "merchants" m
WHERE m."connection_id" IS NOT NULL
  AND m."external_id" IS NULL
  AND m."status" = 'boarding'
  AND m."legal_entity_id" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "applications" x WHERE x."merchant_id" = m."id")
  AND NOT EXISTS (SELECT 1 FROM "merchant_accounts" x WHERE x."merchant_id" = m."id")
  AND NOT EXISTS (SELECT 1 FROM "contacts" x WHERE x."merchant_id" = m."id")
  AND NOT EXISTS (SELECT 1 FROM "tickets" x WHERE x."merchant_id" = m."id")
  AND NOT EXISTS (SELECT 1 FROM "chargebacks" x WHERE x."merchant_id" = m."id")
  AND NOT EXISTS (SELECT 1 FROM "activities" x WHERE x."merchant_id" = m."id")
  AND NOT EXISTS (SELECT 1 FROM "tasks" x WHERE x."merchant_id" = m."id")
  AND NOT EXISTS (SELECT 1 FROM "leads" x WHERE x."merchant_id" = m."id")
  AND NOT EXISTS (SELECT 1 FROM "deals" x WHERE x."merchant_id" = m."id");
