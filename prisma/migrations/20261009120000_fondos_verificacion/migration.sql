-- Re-verificación automática del catálogo de fondos (PENDIENTES §16, Fase 1).
-- Aditivo: ningún dato existente cambia al aplicar esta migración.

ALTER TABLE "funds"
  ADD COLUMN IF NOT EXISTS "verify_status"     TEXT,          -- vigente | cerrado | enlace_roto | bloqueado | sin_datos | error
  ADD COLUMN IF NOT EXISTS "verified_at"       TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "verify_http"       INTEGER,
  ADD COLUMN IF NOT EXISTS "detected_deadline" TIMESTAMP(3),  -- fecha que encontró el bot (se aplique o no)
  ADD COLUMN IF NOT EXISTS "detected_evidence" TEXT,          -- fragmento de la página del que salió
  ADD COLUMN IF NOT EXISTS "deadline_source"   TEXT,          -- manual | bot   (NULL = carga original)
  ADD COLUMN IF NOT EXISTS "needs_review"      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "review_reason"     TEXT,
  -- Lo que un gestor ya descartó (p. ej. "fecha:2026-10-12" o "linkedin"): el bot no
  -- vuelve a proponerlo cada noche.
  ADD COLUMN IF NOT EXISTS "dismissed_detection" TEXT;

CREATE INDEX IF NOT EXISTS "funds_needs_review_idx" ON "funds"("needs_review") WHERE "needs_review";

-- Una fila por corrida del job: qué revisó y qué pasó. Sin esto, un job nocturno
-- que falla en silencio es indistinguible de uno que no encontró nada.
CREATE TABLE IF NOT EXISTS "fund_sync_runs" (
  "id"          UUID         NOT NULL,
  "kind"        TEXT         NOT NULL,                 -- verificacion | descubrimiento
  "started_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMP(3),
  "checked"     INTEGER      NOT NULL DEFAULT 0,
  "updated"     INTEGER      NOT NULL DEFAULT 0,
  "flagged"     INTEGER      NOT NULL DEFAULT 0,
  "errors"      INTEGER      NOT NULL DEFAULT 0,
  "summary"     JSONB        NOT NULL DEFAULT '{}',
  CONSTRAINT "fund_sync_runs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "fund_sync_runs_started_idx" ON "fund_sync_runs"("started_at" DESC);
