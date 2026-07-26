-- Generado por scripts/import_course.py — IDEMPOTENTE (clave: courses.slug)
-- Curso: PROGRAMA DESARROLLADORES DE NEGOCIOS DE IMPACTO
BEGIN;

-- 1. Curso (inserta o actualiza por slug)
INSERT INTO courses (id, slug, title, description, category, level, duration_hours,
                     instructor, lessons_count, is_published, pass_threshold, created_at, updated_at)
VALUES (gen_random_uuid(), 'programa-desarrolladores-de-negocios-de-impacto', 'PROGRAMA DESARROLLADORES DE NEGOCIOS DE IMPACTO', 'Introducir a los estudiantes los conceptos fundamentales de la inversión de impacto y el emprendimiento social, destacando sus características, diferencias con la inversión tradicional, tendencias actuales y ejemplos inspiradores.',
        'esg'::"CourseCategory", 'basico'::"CourseLevel", 8,
        'EYWA Academy', 2, false,
        80, now(), now())
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title, description = EXCLUDED.description,
  category = EXCLUDED.category, level = EXCLUDED.level,
  duration_hours = EXCLUDED.duration_hours, instructor = EXCLUDED.instructor,
  lessons_count = EXCLUDED.lessons_count, is_published = EXCLUDED.is_published,
  pass_threshold = EXCLUDED.pass_threshold, updated_at = now();

-- 2. Fuera el contenido anterior de ESTE curso (cascade limpia los recursos).
--    El progreso y los certificados de los alumnos NO se tocan.
DELETE FROM course_sections WHERE course_id = (SELECT id FROM courses WHERE slug = 'programa-desarrolladores-de-negocios-de-impacto');
DELETE FROM exam_questions  WHERE course_id = (SELECT id FROM courses WHERE slug = 'programa-desarrolladores-de-negocios-de-impacto');

-- 3. Semanas y sus recursos
INSERT INTO course_sections (id, course_id, sort_order, title, description, video_url, created_at, updated_at)
VALUES (gen_random_uuid(), (SELECT id FROM courses WHERE slug = 'programa-desarrolladores-de-negocios-de-impacto'),
        1, 'Clase Teórica 1: Introducción a la Inversión de Impacto y el Emprendimiento Social', 'Qué es la inversión de impacto y en qué se diferencia de la filantropía y de la inversión tradicional.', NULL, now(), now());
INSERT INTO section_resources (id, section_id, type, title, url, sort_order)
VALUES (gen_random_uuid(),
        (SELECT s.id FROM course_sections s JOIN courses c ON c.id = s.course_id
         WHERE c.slug = 'programa-desarrolladores-de-negocios-de-impacto' AND s.sort_order = 1),
        'pdf', 'Guía inicial', 'https://eywa.encsust4in4ble.earth/…/guia-inicial.pdf', 0);
INSERT INTO section_resources (id, section_id, type, title, url, sort_order)
VALUES (gen_random_uuid(),
        (SELECT s.id FROM course_sections s JOIN courses c ON c.id = s.course_id
         WHERE c.slug = 'programa-desarrolladores-de-negocios-de-impacto' AND s.sort_order = 1),
        'link', 'Lectura recomendada', 'https://example.com/articulo', 1);

INSERT INTO course_sections (id, course_id, sort_order, title, description, video_url, created_at, updated_at)
VALUES (gen_random_uuid(), (SELECT id FROM courses WHERE slug = 'programa-desarrolladores-de-negocios-de-impacto'),
        2, 'Conceptos avanzados', 'Medición de impacto y modelos de financiamiento mixto.', NULL, now(), now());
INSERT INTO section_resources (id, section_id, type, title, url, sort_order)
VALUES (gen_random_uuid(),
        (SELECT s.id FROM course_sections s JOIN courses c ON c.id = s.course_id
         WHERE c.slug = 'programa-desarrolladores-de-negocios-de-impacto' AND s.sort_order = 2),
        'link', 'Práctica semanal', 'https://example.com/ejercicio-semana-2', 0);

-- 4. Examen final (correct_index NUNCA se envía al navegador)
INSERT INTO exam_questions (id, course_id, sort_order, question, options, correct_index)
VALUES (gen_random_uuid(), (SELECT id FROM courses WHERE slug = 'programa-desarrolladores-de-negocios-de-impacto'),
        0, '¿Qué distingue a la inversión de impacto de la filantropía tradicional?', '["Busca retorno financiero además de impacto medible", "No requiere medir resultados", "Solo la practican organismos multilaterales", "Es sinónimo de donación"]'::jsonb, 0);
INSERT INTO exam_questions (id, course_id, sort_order, question, options, correct_index)
VALUES (gen_random_uuid(), (SELECT id FROM courses WHERE slug = 'programa-desarrolladores-de-negocios-de-impacto'),
        1, '¿Qué caracteriza a un emprendimiento social?', '["No genera ingresos", "Resuelve un problema social o ambiental con un modelo económicamente viable", "Depende siempre de subvenciones", "Es una ONG registrada"]'::jsonb, 1);

COMMIT;