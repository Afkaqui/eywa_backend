-- Catálogo de Fondos (oportunidades de financiamiento, matriz Neo).
CREATE TABLE IF NOT EXISTS "funds" (
  "id"               UUID NOT NULL DEFAULT gen_random_uuid(),
  "scope"            TEXT NOT NULL,
  "name"             TEXT NOT NULL,
  "instrument_type"  TEXT NOT NULL,
  "eligible_profile" TEXT,
  "sectors"          TEXT,
  "amounts"          TEXT,
  "deadline"         TIMESTAMP(3),
  "deadline_text"    TEXT,
  "checklist"        TEXT,
  "url"              TEXT,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "funds_pkey" PRIMARY KEY ("id")
);
