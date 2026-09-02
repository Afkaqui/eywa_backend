-- Envío de proyectos a MAVI (ARS LAB). Ver PENDIENTES.md §14.
--
-- Dos campos de ENTRADA que el modelo no tenía:
--   · etapa: la API la acepta como opcional, pero pesa mucho en el score.
--   · consentimiento: la API exige consentimiento_datos = true y RECHAZA false.
--     El envío manda nombre, correo, teléfono y RUC del usuario a un tercero,
--     así que esto no se puede dar por supuesto: se guarda cuándo lo aceptó.
--
-- Y los de SALIDA: sin guardar la respuesta, el envío se pierde y no queda
-- forma de saber qué contestó MAVI.
ALTER TABLE "project_plans"
  ADD COLUMN IF NOT EXISTS "etapa"                TEXT,
  ADD COLUMN IF NOT EXISTS "mavi_consent_at"      TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "mavi_project_id"      TEXT,
  ADD COLUMN IF NOT EXISTS "mavi_status"          TEXT,
  ADD COLUMN IF NOT EXISTS "mavi_score"           DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "mavi_semaforo"        TEXT,
  ADD COLUMN IF NOT EXISTS "mavi_decision"        TEXT,
  ADD COLUMN IF NOT EXISTS "mavi_pendientes"      JSONB,
  ADD COLUMN IF NOT EXISTS "mavi_tracking_url"    TEXT,
  ADD COLUMN IF NOT EXISTS "mavi_sent_at"         TIMESTAMP(3);

COMMENT ON COLUMN "project_plans"."mavi_consent_at" IS
  'Cuándo el usuario aceptó enviar sus datos a ARS LAB. NULL = no aceptó: no se puede enviar.';

-- Para no reenviar dos veces el mismo proyecto por accidente.
CREATE UNIQUE INDEX IF NOT EXISTS "project_plans_mavi_project_id_key"
  ON "project_plans"("mavi_project_id") WHERE "mavi_project_id" IS NOT NULL;
