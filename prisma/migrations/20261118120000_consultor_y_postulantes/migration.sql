-- Reunión 2026-10-08: observaciones del consultor (30% humano) y competencia por fondo.
ALTER TABLE "project_plans"
  ADD COLUMN IF NOT EXISTS "consultor_notas"     TEXT,
  ADD COLUMN IF NOT EXISTS "consultor_notas_at"  TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "consultor_notas_por" TEXT;
ALTER TABLE "funds"
  ADD COLUMN IF NOT EXISTS "postulantes"        INTEGER,
  ADD COLUMN IF NOT EXISTS "postulantes_fuente" TEXT;
