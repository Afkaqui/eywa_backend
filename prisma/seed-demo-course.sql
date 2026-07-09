-- ═══════════════════════════════════════════════════════════════════════════
-- Curso demo: "Fundamentos de Sostenibilidad ESG"
-- 4 secciones (video YouTube + PDFs + foros) + examen de 5 preguntas (aprueba con 80%)
-- Idempotente: no inserta nada si el curso ya existe.
-- Ejecutar: docker exec -i postgres_db psql -U admin -d eywa_db < seed-demo-course.sql
-- ═══════════════════════════════════════════════════════════════════════════

WITH new_course AS (
  INSERT INTO courses (id, title, description, category, level, duration_hours,
                       image_url, instructor, lessons_count, is_published, pass_threshold,
                       created_at, updated_at)
  SELECT gen_random_uuid(),
         'Fundamentos de Sostenibilidad ESG',
         'Curso introductorio a la sostenibilidad corporativa: los Objetivos de Desarrollo Sostenible, las dimensiones Ambiental, Social y de Gobernanza (ESG), y cómo medir y reportar el desempeño de tu organización. Incluye examen final y certificado verificable.',
         'esg', 'basico', 3,
         NULL, 'EYWA Academy', 4, TRUE, 80,
         NOW(), NOW()
  WHERE NOT EXISTS (SELECT 1 FROM courses WHERE title = 'Fundamentos de Sostenibilidad ESG')
  RETURNING id
),
s1 AS (
  INSERT INTO course_sections (id, course_id, sort_order, title, description, video_url, created_at, updated_at)
  SELECT gen_random_uuid(), id, 1,
         'Introducción a la Sostenibilidad y los ODS',
         'Qué es el desarrollo sostenible y cómo la Agenda 2030 de la ONU define las 17 metas globales que guían la acción de gobiernos, empresas y sociedad civil.',
         'https://www.youtube.com/watch?v=0XTBYMfZyrM',
         NOW(), NOW()
  FROM new_course RETURNING id
),
s2 AS (
  INSERT INTO course_sections (id, course_id, sort_order, title, description, video_url, created_at, updated_at)
  SELECT gen_random_uuid(), id, 2,
         'Dimensión Ambiental (E): clima y huella de carbono',
         'Causas y efectos del cambio climático, y cómo las organizaciones miden sus emisiones con el estándar GHG Protocol (alcances 1, 2 y 3).',
         'https://www.youtube.com/watch?v=G4H1N_yXBiA',
         NOW(), NOW()
  FROM new_course RETURNING id
),
s3 AS (
  INSERT INTO course_sections (id, course_id, sort_order, title, description, video_url, created_at, updated_at)
  SELECT gen_random_uuid(), id, 3,
         'Dimensión Social y de Gobernanza (S+G)',
         'El caso de negocio de la sostenibilidad: personas, comunidades, ética y estructuras de gobierno que hacen creíble el compromiso de una organización.',
         'https://www.youtube.com/watch?v=iP9QF_lBOyA',
         NOW(), NOW()
  FROM new_course RETURNING id
),
s4 AS (
  INSERT INTO course_sections (id, course_id, sort_order, title, description, video_url, created_at, updated_at)
  SELECT gen_random_uuid(), id, 4,
         'Reporte, certificación y acción',
         'Cómo comunicar el desempeño ESG con estándares reconocidos (GRI) y convertir el diagnóstico en un plan de acción medible.',
         'https://www.youtube.com/watch?v=yiw6_JakZFc',
         NOW(), NOW()
  FROM new_course RETURNING id
),
res AS (
  INSERT INTO section_resources (id, section_id, type, title, url, sort_order)
  SELECT gen_random_uuid(), s1.id, 'pdf',   'Agenda 2030 para el Desarrollo Sostenible (ONU)', 'https://sdgs.un.org/sites/default/files/publications/21252030%20Agenda%20for%20Sustainable%20Development%20web.pdf', 1 FROM s1
  UNION ALL
  SELECT gen_random_uuid(), s1.id, 'link',  'Los 17 Objetivos de Desarrollo Sostenible', 'https://sdgs.un.org/es/goals', 2 FROM s1
  UNION ALL
  SELECT gen_random_uuid(), s2.id, 'pdf',   'GHG Protocol — Estándar Corporativo de emisiones', 'https://ghgprotocol.org/sites/default/files/standards/ghg-protocol-revised.pdf', 1 FROM s2
  UNION ALL
  SELECT gen_random_uuid(), s2.id, 'forum', 'Foro: ¿cuál es la principal fuente de emisiones de tu organización?', '#', 2 FROM s2
  UNION ALL
  SELECT gen_random_uuid(), s3.id, 'link',  'Pacto Global de la ONU — los 10 principios', 'https://unglobalcompact.org/what-is-gc/mission/principles', 1 FROM s3
  UNION ALL
  SELECT gen_random_uuid(), s3.id, 'forum', 'Foro: comparte una buena práctica de gobernanza', '#', 2 FROM s3
  UNION ALL
  SELECT gen_random_uuid(), s4.id, 'pdf',   'Introducción a los Estándares GRI', 'https://www.globalreporting.org/media/wtaf14tw/a-short-introduction-to-the-gri-standards.pdf', 1 FROM s4
  UNION ALL
  SELECT gen_random_uuid(), s4.id, 'link',  'Haz tu Diagnóstico ESG en EYWA', '#', 2 FROM s4
  RETURNING id
)
INSERT INTO exam_questions (id, course_id, sort_order, question, options, correct_index)
SELECT gen_random_uuid(), id, 1,
       '¿Qué significa la sigla ESG?',
       '["Ambiental, Social y Gobernanza", "Economía, Sociedad y Gobierno", "Energía, Sostenibilidad y Gestión", "Ecología, Seguridad y Garantías"]'::jsonb, 0
FROM new_course
UNION ALL
SELECT gen_random_uuid(), id, 2,
       '¿Cuántos Objetivos de Desarrollo Sostenible (ODS) define la Agenda 2030?',
       '["10", "17", "21", "8"]'::jsonb, 1
FROM new_course
UNION ALL
SELECT gen_random_uuid(), id, 3,
       'La huella de carbono de una organización pertenece principalmente a la dimensión…',
       '["Social", "De gobernanza", "Ambiental", "Financiera"]'::jsonb, 2
FROM new_course
UNION ALL
SELECT gen_random_uuid(), id, 4,
       '¿Qué busca el análisis de materialidad en ESG?',
       '["Elegir materiales reciclables para el empaque", "Identificar los temas ESG más relevantes para el negocio y sus grupos de interés", "Calcular el precio de la acción", "Reducir la carga tributaria"]'::jsonb, 1
FROM new_course
UNION ALL
SELECT gen_random_uuid(), id, 5,
       '¿Qué característica debe tener un reporte ESG confiable?',
       '["Basarse en datos medibles, trazables y verificables", "Incluir solo los logros positivos", "Publicarse únicamente en papel", "Evitar los estándares internacionales"]'::jsonb, 0
FROM new_course;

-- Resumen
SELECT (SELECT COUNT(*) FROM courses WHERE title = 'Fundamentos de Sostenibilidad ESG') AS curso,
       (SELECT COUNT(*) FROM course_sections cs JOIN courses c ON c.id = cs.course_id WHERE c.title = 'Fundamentos de Sostenibilidad ESG') AS secciones,
       (SELECT COUNT(*) FROM section_resources sr JOIN course_sections cs ON cs.id = sr.section_id JOIN courses c ON c.id = cs.course_id WHERE c.title = 'Fundamentos de Sostenibilidad ESG') AS recursos,
       (SELECT COUNT(*) FROM exam_questions eq JOIN courses c ON c.id = eq.course_id WHERE c.title = 'Fundamentos de Sostenibilidad ESG') AS preguntas;
