-- API externa para terceros (PENDIENTES §15). Todo aditivo: no toca filas existentes
-- salvo para poner el código a los 14 criterios GENES.

-- 1. Clientes de la API. La clave nunca se guarda en claro: solo su sha256.
CREATE TABLE IF NOT EXISTS "api_clients" (
  "id"                  UUID         NOT NULL,
  "name"                TEXT         NOT NULL,
  "key_prefix"          TEXT         NOT NULL,
  "key_hash"            TEXT         NOT NULL,
  "profile_id"          UUID         NOT NULL,
  "active"              BOOLEAN      NOT NULL DEFAULT true,
  "rate_limit_per_hour" INTEGER      NOT NULL DEFAULT 120,
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_used_at"        TIMESTAMP(3),
  CONSTRAINT "api_clients_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "api_clients_profile_id_fkey" FOREIGN KEY ("profile_id")
    REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "api_clients_key_hash_key" ON "api_clients"("key_hash");

-- 2. Organizaciones dadas de alta por la API: de qué cliente vienen y con qué id
--    las conoce ese cliente (clave de idempotencia).
ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "api_client_id"  UUID,
  ADD COLUMN IF NOT EXISTS "external_ref"   TEXT,
  ADD COLUMN IF NOT EXISTS "api_consent_at" TIMESTAMP(3);

DO $$ BEGIN
  ALTER TABLE "organizations" ADD CONSTRAINT "organizations_api_client_id_fkey"
    FOREIGN KEY ("api_client_id") REFERENCES "api_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "organizations_api_client_id_external_ref_key"
  ON "organizations"("api_client_id", "external_ref");

-- 3. Código estable por criterio GENES.
ALTER TABLE "diagnostic_questions" ADD COLUMN IF NOT EXISTS "code" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "diagnostic_questions_code_key" ON "diagnostic_questions"("code");

UPDATE "diagnostic_questions" SET "code" = v.code
FROM (VALUES
  ('Formalización legal (RUC)',                                'formalizacion_legal'),
  ('Liderazgo femenino',                                       'liderazgo_femenino'),
  ('Segmento de clientes identificado',                        'segmento_clientes'),
  ('Potencial de crecimiento',                                 'potencial_crecimiento'),
  ('Sistema de monitoreo y evaluación (M&E) de impacto',       'monitoreo_impacto'),
  ('Uso de insumos sostenibles',                               'insumos_sostenibles'),
  ('Medición de huella ecológica',                             'huella_ecologica'),
  ('Certificación de sostenibilidad ambiental',                'certificacion_ambiental'),
  ('Comercio justo y empleo local',                            'comercio_justo'),
  ('Inclusión laboral de mujeres y grupos vulnerables',        'inclusion_laboral'),
  ('Reconocimientos en desarrollo humano / inclusión social',  'reconocimientos_sociales'),
  ('Economía circular e inclusiva',                            'economia_circular'),
  ('Apoyo financiero recibido',                                'apoyo_financiero'),
  ('Viabilidad económica',                                     'viabilidad_economica')
) AS v(title, code)
WHERE "diagnostic_questions"."title" = v.title AND "diagnostic_questions"."code" IS NULL;
