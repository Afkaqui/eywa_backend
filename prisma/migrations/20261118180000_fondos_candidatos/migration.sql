-- Descubrimiento de fondos: los nuevos entran ocultos hasta que un gestor los aprueba.
ALTER TABLE "funds"
  ADD COLUMN IF NOT EXISTS "candidate"       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "discovered_from" TEXT,
  ADD COLUMN IF NOT EXISTS "discovered_at"   TIMESTAMP(3);
