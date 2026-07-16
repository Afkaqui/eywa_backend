-- Seed del diagnóstico ESG — metodología GENES Perú (14 criterios ponderados).
-- Opciones ADECUADAS por criterio (binarias / rangos % / madurez), puntos GENES 0-5.
-- Borrador inteligente derivado del formulario GENES; redacción a validar con Eduardo.
-- Ejecutar: docker exec -i postgres_db psql -U admin -d eywa_db < seed-diagnostic-genes.sql

BEGIN;
DELETE FROM diagnostic_results;   -- resultados de prueba (referencian preguntas viejas)
DELETE FROM diagnostic_questions; -- cascade borra diagnostic_options

WITH q AS (
  INSERT INTO diagnostic_questions (id, sort_order, category, weight, title, description, updated_at)
  VALUES (gen_random_uuid(), 1, $g$perfil$g$, 0.03, $g$Formalización legal (RUC)$g$, $g$¿La organización está formalmente constituida y cuenta con RUC vigente?$g$, NOW()) RETURNING id
)
INSERT INTO diagnostic_options (id, question_id, label, value, score, sort_order)
  SELECT gen_random_uuid(), id, $g$Sí, cuenta con RUC vigente$g$, $g$o1$g$, 5, 1 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$En trámite de formalización$g$, $g$o2$g$, 2, 2 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$No está formalizada$g$, $g$o3$g$, 0, 3 FROM q;

WITH q AS (
  INSERT INTO diagnostic_questions (id, sort_order, category, weight, title, description, updated_at)
  VALUES (gen_random_uuid(), 2, $g$perfil$g$, 0.04, $g$Liderazgo femenino$g$, $g$¿La dirección o gerencia general de la organización está a cargo de una mujer?$g$, NOW()) RETURNING id
)
INSERT INTO diagnostic_options (id, question_id, label, value, score, sort_order)
  SELECT gen_random_uuid(), id, $g$Sí, la dirección/CEO es una mujer$g$, $g$o1$g$, 5, 1 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Dirección compartida o cofundación con mujeres$g$, $g$o2$g$, 3, 2 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$No$g$, $g$o3$g$, 0, 3 FROM q;

WITH q AS (
  INSERT INTO diagnostic_questions (id, sort_order, category, weight, title, description, updated_at)
  VALUES (gen_random_uuid(), 3, $g$perfil$g$, 0.07, $g$Segmento de clientes identificado$g$, $g$¿Tiene identificado y descrito el segmento de clientes al que atiende?$g$, NOW()) RETURNING id
)
INSERT INTO diagnostic_options (id, question_id, label, value, score, sort_order)
  SELECT gen_random_uuid(), id, $g$Claramente definido y validado con clientes$g$, $g$o1$g$, 5, 1 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Identificado, pero aún sin validar$g$, $g$o2$g$, 3, 2 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Solo una idea general del cliente$g$, $g$o3$g$, 2, 3 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Aún no lo tiene identificado$g$, $g$o4$g$, 0, 4 FROM q;

WITH q AS (
  INSERT INTO diagnostic_questions (id, sort_order, category, weight, title, description, updated_at)
  VALUES (gen_random_uuid(), 4, $g$perfil$g$, 0.1, $g$Potencial de crecimiento$g$, $g$Según su fase y nivel de ventas, ¿qué potencial de crecimiento tiene la organización?$g$, NOW()) RETURNING id
)
INSERT INTO diagnostic_options (id, question_id, label, value, score, sort_order)
  SELECT gen_random_uuid(), id, $g$Alto: tracción y ventas en crecimiento sostenido$g$, $g$o1$g$, 5, 1 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Medio: primeras ventas recurrentes$g$, $g$o2$g$, 4, 2 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Incipiente: aún validando el modelo$g$, $g$o3$g$, 2, 3 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Sin evidencia de crecimiento todavía$g$, $g$o4$g$, 0, 4 FROM q;

WITH q AS (
  INSERT INTO diagnostic_questions (id, sort_order, category, weight, title, description, updated_at)
  VALUES (gen_random_uuid(), 5, $g$perfil$g$, 0.1, $g$Sistema de monitoreo y evaluación (M&E) de impacto$g$, $g$¿Cuenta con un sistema para medir y evaluar su impacto (métricas de impacto)?$g$, NOW()) RETURNING id
)
INSERT INTO diagnostic_options (id, question_id, label, value, score, sort_order)
  SELECT gen_random_uuid(), id, $g$Sistema formal, con métricas y seguimiento periódico$g$, $g$o1$g$, 5, 1 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Mide algunas métricas de impacto$g$, $g$o2$g$, 3, 2 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$En desarrollo$g$, $g$o3$g$, 2, 3 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$No mide su impacto$g$, $g$o4$g$, 0, 4 FROM q;

WITH q AS (
  INSERT INTO diagnostic_questions (id, sort_order, category, weight, title, description, updated_at)
  VALUES (gen_random_uuid(), 6, $g$ambiental$g$, 0.1, $g$Uso de insumos sostenibles$g$, $g$¿Su producto o servicio utiliza materiales reciclables, biodegradables o de bajo impacto?$g$, NOW()) RETURNING id
)
INSERT INTO diagnostic_options (id, question_id, label, value, score, sort_order)
  SELECT gen_random_uuid(), id, $g$Sí, de forma predominante o certificada$g$, $g$o1$g$, 5, 1 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Parcialmente$g$, $g$o2$g$, 3, 2 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$De forma mínima o incipiente$g$, $g$o3$g$, 2, 3 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$No utiliza insumos sostenibles$g$, $g$o4$g$, 0, 4 FROM q;

WITH q AS (
  INSERT INTO diagnostic_questions (id, sort_order, category, weight, title, description, updated_at)
  VALUES (gen_random_uuid(), 7, $g$ambiental$g$, 0.03, $g$Medición de huella ecológica$g$, $g$¿Su organización ha medido su huella ecológica (productos, servicios u operaciones)?$g$, NOW()) RETURNING id
)
INSERT INTO diagnostic_options (id, question_id, label, value, score, sort_order)
  SELECT gen_random_uuid(), id, $g$Sí, la mide y la reporta$g$, $g$o1$g$, 5, 1 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$La está implementando actualmente$g$, $g$o2$g$, 3, 2 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$No la ha medido$g$, $g$o3$g$, 0, 3 FROM q;

WITH q AS (
  INSERT INTO diagnostic_questions (id, sort_order, category, weight, title, description, updated_at)
  VALUES (gen_random_uuid(), 8, $g$ambiental$g$, 0.03, $g$Certificación de sostenibilidad ambiental$g$, $g$¿Cuenta con certificaciones, etiquetas sostenibles o ISO de enfoque ambiental?$g$, NOW()) RETURNING id
)
INSERT INTO diagnostic_options (id, question_id, label, value, score, sort_order)
  SELECT gen_random_uuid(), id, $g$Sí, certificación o ISO ambiental vigente$g$, $g$o1$g$, 5, 1 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Etiqueta o sello, sin certificación formal$g$, $g$o2$g$, 3, 2 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$En proceso de certificación$g$, $g$o3$g$, 2, 3 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$No cuenta con ninguna$g$, $g$o4$g$, 0, 4 FROM q;

WITH q AS (
  INSERT INTO diagnostic_questions (id, sort_order, category, weight, title, description, updated_at)
  VALUES (gen_random_uuid(), 9, $g$social$g$, 0.08, $g$Comercio justo y empleo local$g$, $g$¿Su operación genera comercio justo y/o empleo local?$g$, NOW()) RETURNING id
)
INSERT INTO diagnostic_options (id, question_id, label, value, score, sort_order)
  SELECT gen_random_uuid(), id, $g$Es un eje central del modelo de negocio$g$, $g$o1$g$, 5, 1 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Está presente en la operación$g$, $g$o2$g$, 3, 2 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$De forma incipiente$g$, $g$o3$g$, 2, 3 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$No aplica en su modelo$g$, $g$o4$g$, 0, 4 FROM q;

WITH q AS (
  INSERT INTO diagnostic_questions (id, sort_order, category, weight, title, description, updated_at)
  VALUES (gen_random_uuid(), 10, $g$social$g$, 0.07, $g$Inclusión laboral de mujeres y grupos vulnerables$g$, $g$¿Qué proporción de su fuerza laboral son mujeres y/o pertenecen a grupos vulnerables?$g$, NOW()) RETURNING id
)
INSERT INTO diagnostic_options (id, question_id, label, value, score, sort_order)
  SELECT gen_random_uuid(), id, $g$Más del 50% del equipo$g$, $g$o1$g$, 5, 1 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Entre 26% y 50%$g$, $g$o2$g$, 4, 2 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Entre 11% y 25%$g$, $g$o3$g$, 3, 3 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Hasta 10%$g$, $g$o4$g$, 2, 4 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$0%$g$, $g$o5$g$, 0, 5 FROM q;

WITH q AS (
  INSERT INTO diagnostic_questions (id, sort_order, category, weight, title, description, updated_at)
  VALUES (gen_random_uuid(), 11, $g$social$g$, 0.1, $g$Reconocimientos en desarrollo humano / inclusión social$g$, $g$¿Ha recibido reconocimientos por su contribución al desarrollo humano o la inclusión social?$g$, NOW()) RETURNING id
)
INSERT INTO diagnostic_options (id, question_id, label, value, score, sort_order)
  SELECT gen_random_uuid(), id, $g$Sí, reconocimientos relevantes$g$, $g$o1$g$, 5, 1 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Algún reconocimiento$g$, $g$o2$g$, 3, 2 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Postulaciones, aún sin premio$g$, $g$o3$g$, 2, 3 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Ninguno$g$, $g$o4$g$, 0, 4 FROM q;

WITH q AS (
  INSERT INTO diagnostic_questions (id, sort_order, category, weight, title, description, updated_at)
  VALUES (gen_random_uuid(), 12, $g$economico$g$, 0.07, $g$Economía circular e inclusiva$g$, $g$¿Su modelo de negocio genera economía circular e inclusiva?$g$, NOW()) RETURNING id
)
INSERT INTO diagnostic_options (id, question_id, label, value, score, sort_order)
  SELECT gen_random_uuid(), id, $g$Modelo circular en el centro del negocio$g$, $g$o1$g$, 5, 1 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Aplica prácticas circulares$g$, $g$o2$g$, 3, 2 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$De forma incipiente$g$, $g$o3$g$, 2, 3 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$No aplica$g$, $g$o4$g$, 0, 4 FROM q;

WITH q AS (
  INSERT INTO diagnostic_questions (id, sort_order, category, weight, title, description, updated_at)
  VALUES (gen_random_uuid(), 13, $g$economico$g$, 0.03, $g$Apoyo financiero recibido$g$, $g$¿Ha recibido apoyo financiero de alguna entidad (fondos, banca, cooperación)?$g$, NOW()) RETURNING id
)
INSERT INTO diagnostic_options (id, question_id, label, value, score, sort_order)
  SELECT gen_random_uuid(), id, $g$Sí, ha recibido financiamiento$g$, $g$o1$g$, 5, 1 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$En proceso o postulando actualmente$g$, $g$o2$g$, 2, 2 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$No ha recibido$g$, $g$o3$g$, 0, 3 FROM q;

WITH q AS (
  INSERT INTO diagnostic_questions (id, sort_order, category, weight, title, description, updated_at)
  VALUES (gen_random_uuid(), 14, $g$economico$g$, 0.15, $g$Viabilidad económica$g$, $g$¿Qué viabilidad económica tiene el negocio actualmente?$g$, NOW()) RETURNING id
)
INSERT INTO diagnostic_options (id, question_id, label, value, score, sort_order)
  SELECT gen_random_uuid(), id, $g$Rentable y financieramente sostenible$g$, $g$o1$g$, 5, 1 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$En punto de equilibrio$g$, $g$o2$g$, 4, 2 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Pre-rentabilidad, con proyección clara$g$, $g$o3$g$, 2, 3 FROM q
UNION ALL
  SELECT gen_random_uuid(), id, $g$Aún no es viable$g$, $g$o4$g$, 0, 4 FROM q;

COMMIT;

SELECT category, COUNT(*) AS criterios, ROUND(SUM(weight)::numeric,2) AS peso_total
FROM diagnostic_questions GROUP BY category ORDER BY category;
SELECT ROUND(SUM(weight)::numeric,2) AS peso_total_general FROM diagnostic_questions;