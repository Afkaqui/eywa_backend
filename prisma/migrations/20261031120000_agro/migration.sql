-- Vertical AGRO (agro.encsust4in4ble.earth): trazabilidad de lotes, acopio y
-- pasaporte digital. Proyecto ProInnóvate aparte de EYWA, misma base y cuentas.
-- Todo aditivo.

CREATE TABLE IF NOT EXISTS "agro_productores" (
  "id"          UUID PRIMARY KEY,
  "owner_id"    UUID NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE, -- cuenta que gestiona (cooperativa/acopiador)
  "nombre"      TEXT NOT NULL,
  "dni"         TEXT,
  "comunidad"   TEXT,
  "telefono"    TEXT,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "agro_productores_owner_idx" ON "agro_productores"("owner_id");

CREATE TABLE IF NOT EXISTS "agro_lotes" (
  "id"            UUID PRIMARY KEY,
  "productor_id"  UUID NOT NULL REFERENCES "agro_productores"("id") ON DELETE CASCADE,
  "codigo"        TEXT NOT NULL UNIQUE,          -- código público del pasaporte
  "nombre"        TEXT NOT NULL,
  "cultivo"       TEXT NOT NULL DEFAULT 'cacao',
  "variedad"      TEXT,
  "hectareas"     DOUBLE PRECISION,
  "departamento"  TEXT, "provincia" TEXT, "distrito" TEXT,
  "latitud"       DOUBLE PRECISION,
  "longitud"      DOUBLE PRECISION,
  "poligono"      JSONB,                          -- GeoJSON opcional
  "sin_deforestacion_declarada" BOOLEAN NOT NULL DEFAULT false, -- declaración (corte EUDR 31-12-2020), NO verificación satelital
  "declarada_at"  TIMESTAMP(3),
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "agro_lotes_productor_idx" ON "agro_lotes"("productor_id");

CREATE TABLE IF NOT EXISTS "agro_cosechas" (
  "id"         UUID PRIMARY KEY,
  "lote_id"    UUID NOT NULL REFERENCES "agro_lotes"("id") ON DELETE CASCADE,
  "fecha"      DATE NOT NULL,
  "kilos"      DOUBLE PRECISION NOT NULL,
  "nota"       TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Centro de acopio digital: cada entrega (saco) lleva su código y su sello.
CREATE TABLE IF NOT EXISTS "agro_entregas" (
  "id"              UUID PRIMARY KEY,
  "lote_id"         UUID NOT NULL REFERENCES "agro_lotes"("id") ON DELETE CASCADE,
  "codigo"          TEXT NOT NULL UNIQUE,         -- código del saco
  "fecha_entrega"   DATE NOT NULL,
  "kilos"           DOUBLE PRECISION NOT NULL,
  "calidad"         TEXT,
  "porcentaje_pactado" DOUBLE PRECISION,          -- % del precio de venta que recibe el productor
  "fecha_venta"     DATE,
  "precio_referencia" DOUBLE PRECISION,           -- precio de bolsa ese día (USD/t), registrado a mano
  "monto_productor" DOUBLE PRECISION,             -- calculado
  "pagado_at"       TIMESTAMP(3),
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "agro_entregas_lote_idx" ON "agro_entregas"("lote_id");
