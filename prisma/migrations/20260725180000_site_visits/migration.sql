-- Visitas a la web. Sin PII: el visitante se identifica por un hash diario
-- (IP + user-agent + fecha + secreto), no reversible y que rota cada día.
CREATE TABLE IF NOT EXISTS "site_visits" (
  "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
  "path"          TEXT NOT NULL,
  "referrer_host" TEXT,
  "visitor_hash"  TEXT NOT NULL,
  "is_bot"        BOOLEAN NOT NULL DEFAULT false,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "site_visits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "site_visits_created_at_idx"   ON "site_visits"("created_at");
CREATE INDEX IF NOT EXISTS "site_visits_visitor_hash_idx" ON "site_visits"("visitor_hash");
