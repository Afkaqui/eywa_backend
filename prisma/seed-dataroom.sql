-- Plantilla del Dataroom: 10 carpetas + documentos requeridos.
-- Idempotente: ON CONFLICT en la carpeta; los items se insertan solo si faltan.
-- Ejecutar: docker exec -i postgres_db psql -U admin -d eywa_db < seed-dataroom.sql

INSERT INTO dataroom_folders (key, sort_order, name, description) VALUES
  ('panorama',    1,  'Panorama',                          'Quiénes son y a qué se dedican'),
  ('legal',       2,  'Legal y Societario',                'La empresa, formalmente constituida'),
  ('tributario',  3,  'Tributario',                        'Tus impuestos en orden'),
  ('financiero',  4,  'Financiero y Contable',             'La salud de tus números'),
  ('operaciones', 5,  'Negocio y Operaciones',             'Cómo opera el negocio'),
  ('cumplimiento',6,  'Cumplimiento y Políticas internas', 'Reglas, ética y control interno'),
  ('sostenibilidad', 7, 'Sostenibilidad y ASG',            'Tu impacto ambiental, social y de gobernanza'),
  ('comercial',   8,  'Comercial y Mercado',               'Clientes, precios y competencia'),
  ('talento',     9,  'Talento Humano',                    'Tu equipo y cómo lo gestionas'),
  ('propiedad',   10, 'Propiedad Intelectual y Tecnología','Marcas, patentes y seguridad de la información')
ON CONFLICT (key) DO NOTHING;

-- Items por carpeta (solo se insertan los que no existan aún)
WITH t(folder_key, sort_order, name) AS (VALUES
  -- 1. Panorama
  ('panorama', 1, 'Directorio ejecutivo (directivos, cargos y niveles)'),
  ('panorama', 2, 'Descripción de la actividad principal'),
  -- 2. Legal y Societario
  ('legal', 1, 'Testimonio de constitución y estatutos'),
  ('legal', 2, 'Partida registral (copia literal)'),
  ('legal', 3, 'Poderes y vigencia de poderes'),
  ('legal', 4, 'Modificaciones estatutarias'),
  ('legal', 5, 'Libros societarios'),
  ('legal', 6, 'Convenios de accionistas / socios'),
  -- 3. Tributario
  ('tributario', 1, 'Ficha RUC'),
  ('tributario', 2, 'Declaraciones juradas (anuales y mensuales)'),
  ('tributario', 3, 'Comprobantes de pago'),
  ('tributario', 4, 'Constancias de libros contables'),
  ('tributario', 5, 'Informes de auditoría tributaria (si aplica)'),
  ('tributario', 6, 'Certificados de no adeudo tributario'),
  -- 4. Financiero y Contable
  ('financiero', 1, 'Estados financieros (anuales y trimestrales)'),
  ('financiero', 2, 'Informes de auditoría financiera'),
  ('financiero', 3, 'Presupuestos y proyecciones'),
  ('financiero', 4, 'Contratos de deudas y financiamientos'),
  ('financiero', 5, 'Reportes de valorización (si existen)'),
  -- 5. Negocio y Operaciones
  ('operaciones', 1, 'Descripción del modelo de negocio'),
  ('operaciones', 2, 'Diagramas de procesos clave'),
  ('operaciones', 3, 'Licencias y permisos'),
  -- 6. Cumplimiento y Políticas internas
  ('cumplimiento', 1, 'Manual de políticas y procedimientos'),
  ('cumplimiento', 2, 'Código de ética y conducta'),
  ('cumplimiento', 3, 'Reglamento interno de trabajo (RIT)'),
  ('cumplimiento', 4, 'Documentación SPLAFT'),
  ('cumplimiento', 5, 'Declaraciones juradas de empleados'),
  ('cumplimiento', 6, 'Informes de auditorías de cumplimiento'),
  -- 7. Sostenibilidad y ASG
  ('sostenibilidad', 1, 'Reporte de sostenibilidad'),
  ('sostenibilidad', 2, 'Política de sostenibilidad y responsabilidad social'),
  ('sostenibilidad', 3, 'Mediciones de impacto ambiental'),
  ('sostenibilidad', 4, 'Informes de impacto social'),
  ('sostenibilidad', 5, 'Certificaciones de calidad / sostenibilidad'),
  ('sostenibilidad', 6, 'Catálogo de proyectos de impacto'),
  -- 8. Comercial y Mercado
  ('comercial', 1, 'Contratos marco (clientes y proveedores)'),
  ('comercial', 2, 'Lista de clientes y proveedores clave'),
  ('comercial', 3, 'Políticas de precios y ventas'),
  ('comercial', 4, 'Material de marketing y ventas'),
  ('comercial', 5, 'Estudios de mercado y competencia'),
  -- 9. Talento Humano
  ('talento', 1, 'Organigrama de la empresa'),
  ('talento', 2, 'Modelos de contratos de trabajo'),
  ('talento', 3, 'Políticas de contratación y salarios'),
  ('talento', 4, 'Estructura de planillas y bandas salariales'),
  ('talento', 5, 'Planes de desarrollo y capacitación'),
  ('talento', 6, 'Formatos de evaluación de desempeño'),
  -- 10. Propiedad Intelectual y Tecnología
  ('propiedad', 1, 'Títulos de registro de marcas y patentes'),
  ('propiedad', 2, 'Contratos de licencia de software y tecnologías'),
  ('propiedad', 3, 'Registro de nombres de dominio web'),
  ('propiedad', 4, 'Política de seguridad de la información'),
  ('propiedad', 5, 'Acuerdos de confidencialidad (NDAs)')
)
INSERT INTO dataroom_items (folder_id, sort_order, name)
SELECT f.id, t.sort_order, t.name
FROM t
JOIN dataroom_folders f ON f.key = t.folder_key
WHERE NOT EXISTS (
  SELECT 1 FROM dataroom_items i WHERE i.folder_id = f.id AND i.name = t.name
);

SELECT f.sort_order, f.name, COUNT(i.id) AS documentos
FROM dataroom_folders f LEFT JOIN dataroom_items i ON i.folder_id = f.id
GROUP BY f.id, f.sort_order, f.name ORDER BY f.sort_order;
