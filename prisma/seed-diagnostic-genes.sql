-- Seed del diagnóstico ESG — metodología GENES Perú (14 criterios ponderados, escala 0-5).
-- Escala de opciones = escala genérica oficial GENES. Descripción = pregunta del formulario.
-- Reemplaza los placeholders. Ejecutar: docker exec -i postgres_db psql -U admin -d eywa_db < seed-diagnostic-genes.sql

BEGIN;
DELETE FROM diagnostic_results;   -- resultados de prueba (referencian preguntas viejas)
DELETE FROM diagnostic_questions; -- cascade borra diagnostic_options

WITH q AS (
  INSERT INTO diagnostic_questions (id, sort_order, category, weight, title, description, updated_at)
  VALUES (gen_random_uuid(), 1, $g$perfil$g$, 0.03, $g$Organización legalmente constituida (RUC)$g$, $g$¿La organización está legalmente constituida y cuenta con RUC?$g$, NOW()) RETURNING id
)
INSERT INTO diagnostic_options (id, question_id, label, value, score, sort_order)
  SELECT gen_random_uuid(), id, $g$Supera las expectativas$g$, $g$5$g$, 5, 1 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Cumple plenamente$g$, $g$4$g$, 4, 2 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Cumple parcialmente$g$, $g$3$g$, 3, 3 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Cumple mínimamente$g$, $g$2$g$, 2, 4 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$No cumple$g$, $g$0$g$, 0, 5 FROM q;

WITH q AS (
  INSERT INTO diagnostic_questions (id, sort_order, category, weight, title, description, updated_at)
  VALUES (gen_random_uuid(), 2, $g$perfil$g$, 0.04, $g$Liderazgo femenino (CEO mujer)$g$, $g$¿La dirección o CEO de la organización es una mujer?$g$, NOW()) RETURNING id
)
INSERT INTO diagnostic_options (id, question_id, label, value, score, sort_order)
  SELECT gen_random_uuid(), id, $g$Supera las expectativas$g$, $g$5$g$, 5, 1 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Cumple plenamente$g$, $g$4$g$, 4, 2 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Cumple parcialmente$g$, $g$3$g$, 3, 3 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Cumple mínimamente$g$, $g$2$g$, 2, 4 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$No cumple$g$, $g$0$g$, 0, 5 FROM q;

WITH q AS (
  INSERT INTO diagnostic_questions (id, sort_order, category, weight, title, description, updated_at)
  VALUES (gen_random_uuid(), 3, $g$perfil$g$, 0.07, $g$Segmento de clientes identificado$g$, $g$¿Tiene identificado y descrito el segmento de clientes al que atiende?$g$, NOW()) RETURNING id
)
INSERT INTO diagnostic_options (id, question_id, label, value, score, sort_order)
  SELECT gen_random_uuid(), id, $g$Supera las expectativas$g$, $g$5$g$, 5, 1 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Cumple plenamente$g$, $g$4$g$, 4, 2 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Cumple parcialmente$g$, $g$3$g$, 3, 3 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Cumple mínimamente$g$, $g$2$g$, 2, 4 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$No cumple$g$, $g$0$g$, 0, 5 FROM q;

WITH q AS (
  INSERT INTO diagnostic_questions (id, sort_order, category, weight, title, description, updated_at)
  VALUES (gen_random_uuid(), 4, $g$perfil$g$, 0.1, $g$Potencial de crecimiento$g$, $g$¿Qué potencial de crecimiento tiene la organización según su fase y nivel de ventas?$g$, NOW()) RETURNING id
)
INSERT INTO diagnostic_options (id, question_id, label, value, score, sort_order)
  SELECT gen_random_uuid(), id, $g$Supera las expectativas$g$, $g$5$g$, 5, 1 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Cumple plenamente$g$, $g$4$g$, 4, 2 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Cumple parcialmente$g$, $g$3$g$, 3, 3 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Cumple mínimamente$g$, $g$2$g$, 2, 4 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$No cumple$g$, $g$0$g$, 0, 5 FROM q;

WITH q AS (
  INSERT INTO diagnostic_questions (id, sort_order, category, weight, title, description, updated_at)
  VALUES (gen_random_uuid(), 5, $g$perfil$g$, 0.1, $g$Sistema de monitoreo y evaluación (M&E) de impacto$g$, $g$¿Cuenta con un sistema para medir y evaluar su impacto (métricas de impacto)?$g$, NOW()) RETURNING id
)
INSERT INTO diagnostic_options (id, question_id, label, value, score, sort_order)
  SELECT gen_random_uuid(), id, $g$Supera las expectativas$g$, $g$5$g$, 5, 1 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Cumple plenamente$g$, $g$4$g$, 4, 2 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Cumple parcialmente$g$, $g$3$g$, 3, 3 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Cumple mínimamente$g$, $g$2$g$, 2, 4 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$No cumple$g$, $g$0$g$, 0, 5 FROM q;

WITH q AS (
  INSERT INTO diagnostic_questions (id, sort_order, category, weight, title, description, updated_at)
  VALUES (gen_random_uuid(), 6, $g$ambiental$g$, 0.1, $g$Uso de insumos sostenibles$g$, $g$¿Su producto o servicio utiliza materiales reciclables, biodegradables o de bajo impacto?$g$, NOW()) RETURNING id
)
INSERT INTO diagnostic_options (id, question_id, label, value, score, sort_order)
  SELECT gen_random_uuid(), id, $g$Supera las expectativas$g$, $g$5$g$, 5, 1 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Cumple plenamente$g$, $g$4$g$, 4, 2 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Cumple parcialmente$g$, $g$3$g$, 3, 3 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Cumple mínimamente$g$, $g$2$g$, 2, 4 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$No cumple$g$, $g$0$g$, 0, 5 FROM q;

WITH q AS (
  INSERT INTO diagnostic_questions (id, sort_order, category, weight, title, description, updated_at)
  VALUES (gen_random_uuid(), 7, $g$ambiental$g$, 0.03, $g$Medición de huella ecológica$g$, $g$¿Su organización ha medido su huella ecológica (en productos, servicios u operaciones)?$g$, NOW()) RETURNING id
)
INSERT INTO diagnostic_options (id, question_id, label, value, score, sort_order)
  SELECT gen_random_uuid(), id, $g$Supera las expectativas$g$, $g$5$g$, 5, 1 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Cumple plenamente$g$, $g$4$g$, 4, 2 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Cumple parcialmente$g$, $g$3$g$, 3, 3 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Cumple mínimamente$g$, $g$2$g$, 2, 4 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$No cumple$g$, $g$0$g$, 0, 5 FROM q;

WITH q AS (
  INSERT INTO diagnostic_questions (id, sort_order, category, weight, title, description, updated_at)
  VALUES (gen_random_uuid(), 8, $g$ambiental$g$, 0.03, $g$Certificación de sostenibilidad ambiental$g$, $g$¿Cuenta con certificaciones, etiquetas sostenibles o ISO de enfoque ambiental?$g$, NOW()) RETURNING id
)
INSERT INTO diagnostic_options (id, question_id, label, value, score, sort_order)
  SELECT gen_random_uuid(), id, $g$Supera las expectativas$g$, $g$5$g$, 5, 1 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Cumple plenamente$g$, $g$4$g$, 4, 2 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Cumple parcialmente$g$, $g$3$g$, 3, 3 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Cumple mínimamente$g$, $g$2$g$, 2, 4 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$No cumple$g$, $g$0$g$, 0, 5 FROM q;

WITH q AS (
  INSERT INTO diagnostic_questions (id, sort_order, category, weight, title, description, updated_at)
  VALUES (gen_random_uuid(), 9, $g$social$g$, 0.08, $g$Comercio justo y empleo local$g$, $g$¿Su operación genera comercio justo y/o empleo local?$g$, NOW()) RETURNING id
)
INSERT INTO diagnostic_options (id, question_id, label, value, score, sort_order)
  SELECT gen_random_uuid(), id, $g$Supera las expectativas$g$, $g$5$g$, 5, 1 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Cumple plenamente$g$, $g$4$g$, 4, 2 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Cumple parcialmente$g$, $g$3$g$, 3, 3 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Cumple mínimamente$g$, $g$2$g$, 2, 4 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$No cumple$g$, $g$0$g$, 0, 5 FROM q;

WITH q AS (
  INSERT INTO diagnostic_questions (id, sort_order, category, weight, title, description, updated_at)
  VALUES (gen_random_uuid(), 10, $g$social$g$, 0.07, $g$Oportunidad laboral a mujeres y grupos vulnerables$g$, $g$¿Qué proporción de su equipo son mujeres y/o pertenecen a grupos vulnerables?$g$, NOW()) RETURNING id
)
INSERT INTO diagnostic_options (id, question_id, label, value, score, sort_order)
  SELECT gen_random_uuid(), id, $g$Supera las expectativas$g$, $g$5$g$, 5, 1 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Cumple plenamente$g$, $g$4$g$, 4, 2 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Cumple parcialmente$g$, $g$3$g$, 3, 3 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Cumple mínimamente$g$, $g$2$g$, 2, 4 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$No cumple$g$, $g$0$g$, 0, 5 FROM q;

WITH q AS (
  INSERT INTO diagnostic_questions (id, sort_order, category, weight, title, description, updated_at)
  VALUES (gen_random_uuid(), 11, $g$social$g$, 0.1, $g$Reconocimientos en desarrollo humano / inclusión social$g$, $g$¿Ha recibido reconocimientos por su contribución al desarrollo humano o la inclusión social?$g$, NOW()) RETURNING id
)
INSERT INTO diagnostic_options (id, question_id, label, value, score, sort_order)
  SELECT gen_random_uuid(), id, $g$Supera las expectativas$g$, $g$5$g$, 5, 1 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Cumple plenamente$g$, $g$4$g$, 4, 2 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Cumple parcialmente$g$, $g$3$g$, 3, 3 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Cumple mínimamente$g$, $g$2$g$, 2, 4 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$No cumple$g$, $g$0$g$, 0, 5 FROM q;

WITH q AS (
  INSERT INTO diagnostic_questions (id, sort_order, category, weight, title, description, updated_at)
  VALUES (gen_random_uuid(), 12, $g$economico$g$, 0.07, $g$Economía circular e inclusiva$g$, $g$¿Su modelo de negocio genera economía circular e inclusiva?$g$, NOW()) RETURNING id
)
INSERT INTO diagnostic_options (id, question_id, label, value, score, sort_order)
  SELECT gen_random_uuid(), id, $g$Supera las expectativas$g$, $g$5$g$, 5, 1 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Cumple plenamente$g$, $g$4$g$, 4, 2 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Cumple parcialmente$g$, $g$3$g$, 3, 3 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Cumple mínimamente$g$, $g$2$g$, 2, 4 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$No cumple$g$, $g$0$g$, 0, 5 FROM q;

WITH q AS (
  INSERT INTO diagnostic_questions (id, sort_order, category, weight, title, description, updated_at)
  VALUES (gen_random_uuid(), 13, $g$economico$g$, 0.03, $g$Apoyo financiero recibido$g$, $g$¿Ha recibido apoyo financiero de alguna entidad (fondos, banca, cooperación)?$g$, NOW()) RETURNING id
)
INSERT INTO diagnostic_options (id, question_id, label, value, score, sort_order)
  SELECT gen_random_uuid(), id, $g$Supera las expectativas$g$, $g$5$g$, 5, 1 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Cumple plenamente$g$, $g$4$g$, 4, 2 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Cumple parcialmente$g$, $g$3$g$, 3, 3 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Cumple mínimamente$g$, $g$2$g$, 2, 4 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$No cumple$g$, $g$0$g$, 0, 5 FROM q;

WITH q AS (
  INSERT INTO diagnostic_questions (id, sort_order, category, weight, title, description, updated_at)
  VALUES (gen_random_uuid(), 14, $g$economico$g$, 0.15, $g$Viabilidad económica y oportunidades para grupos vulnerables$g$, $g$¿Qué viabilidad económica tiene el negocio y qué oportunidades genera para grupos vulnerables?$g$, NOW()) RETURNING id
)
INSERT INTO diagnostic_options (id, question_id, label, value, score, sort_order)
  SELECT gen_random_uuid(), id, $g$Supera las expectativas$g$, $g$5$g$, 5, 1 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Cumple plenamente$g$, $g$4$g$, 4, 2 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Cumple parcialmente$g$, $g$3$g$, 3, 3 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Cumple mínimamente$g$, $g$2$g$, 2, 4 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$No cumple$g$, $g$0$g$, 0, 5 FROM q;

COMMIT;

SELECT category, COUNT(*) AS criterios, ROUND(SUM(weight)::numeric,2) AS peso_total
FROM diagnostic_questions GROUP BY category ORDER BY category;
SELECT ROUND(SUM(weight)::numeric,2) AS peso_total_general FROM diagnostic_questions;