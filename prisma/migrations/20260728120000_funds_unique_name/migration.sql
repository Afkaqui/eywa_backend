-- Clave única por nombre de fondo.
-- Sin esto, `seed-funds.sql` solo podía "ser idempotente" borrando la tabla
-- entera (DELETE FROM funds), lo que se llevaba por delante los fondos
-- agregados a mano desde la UI. Con la clave única el seed hace UPSERT y no
-- toca nada que no sea suyo.
--
-- La matriz Neo traía "GEF Small Grants (UNDP)" DOS VECES (misma convocatoria,
-- redacción distinta, mismo URL y monto). Se consolida en una sola fila: sin
-- eso el índice único no puede crearse.
DELETE FROM funds a USING funds b
WHERE a.name = b.name AND a.ctid > b.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS "funds_name_key" ON "funds"("name");
