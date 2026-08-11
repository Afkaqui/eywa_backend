-- Un usuario puede tener VARIAS personas jurídicas (RUC 20) y una sola natural (RUC 10).
-- Decisión del usuario, 2026-08-09. Ver PENDIENTES.md §13.
--
-- Migración ADITIVA y sin pérdida: con una sola organización el comportamiento
-- queda idéntico al de hoy.

-- 1. Un usuario deja de estar limitado a una organización.
--    El límite (3 por cuenta) se hace cumplir en el backend, no aquí: es una
--    regla de negocio revisable, no una invariante del modelo.
DROP INDEX IF EXISTS "organizations_user_id_key";
CREATE INDEX IF NOT EXISTS "organizations_user_id_idx" ON "organizations"("user_id");

-- 2. RUC y nombre comercial.
--    El RUC es único GLOBAL: dos cuentas no pueden reclamar la misma empresa.
--    Queda NULL para las organizaciones existentes; inventarlo sería peor que
--    dejarlo vacío.
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "ruc" TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "trade_name" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "organizations_ruc_key" ON "organizations"("ruc");

-- 3. El diagnóstico GENES pertenece a la EMPRESA, no a la persona.
--    GENES evalúa criterios de empresa (RUC legalizado, CEO mujer, insumos
--    sostenibles); con varias personas jurídicas, "el diagnóstico del usuario"
--    no significa nada.
ALTER TABLE "diagnostic_results" ADD COLUMN IF NOT EXISTS "organization_id" UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'diagnostic_results_organization_id_fkey') THEN
    ALTER TABLE "diagnostic_results"
      ADD CONSTRAINT "diagnostic_results_organization_id_fkey" FOREIGN KEY ("organization_id")
      REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "diagnostic_results_organization_id_created_at_idx"
  ON "diagnostic_results"("organization_id", "created_at" DESC);

-- 4. Asignar los diagnósticos existentes a la organización de su autor.
--    SOLO cuando el usuario tiene UNA sola organización: si tuviera dos, no hay
--    forma automática de saber a cuál corresponde y es mejor dejarlo nulo que
--    adivinar. (Verificado el 2026-08-09: los 2 resultados existentes son de
--    usuarios con una sola organización.)
UPDATE diagnostic_results d
SET organization_id = o.id
FROM organizations o
WHERE o.user_id = d.user_id
  AND d.organization_id IS NULL
  AND (SELECT count(*) FROM organizations o2 WHERE o2.user_id = d.user_id) = 1;
