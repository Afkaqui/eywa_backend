-- TRL y CRL según la calculadora del CONCYTEC (EYWA registra, no calcula).
ALTER TABLE "project_plans"
  ADD COLUMN IF NOT EXISTS "trl"          INTEGER,
  ADD COLUMN IF NOT EXISTS "crl"          INTEGER,
  ADD COLUMN IF NOT EXISTS "madurez_at"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "madurez_nota" TEXT;
