-- Categorías GENES nuevas (Eduardo, 2026-07-25): Marrón < Verde < Plata < Oro < Fénix,
-- en 5 tramos iguales de 15 puntos sobre la escala 0-75.
-- Sustituyen a las 4 bandas anteriores. Se reclasifican los resultados YA guardados
-- a partir de su score (el score NO cambia, solo la etiqueta).
UPDATE diagnostic_results
SET level = CASE
  WHEN score >= 61 THEN 'Fénix'
  WHEN score >= 46 THEN 'Oro'
  WHEN score >= 31 THEN 'Plata'
  WHEN score >= 16 THEN 'Verde'
  ELSE 'Marrón'
END
WHERE level IN ('No cumple', 'Cumple mínimamente', 'Cumple parcialmente', 'Cumple plenamente');

-- Reportes del Validador que tuvieran la banda vieja dentro del JSON.
UPDATE project_plans
SET report = jsonb_set(report::jsonb, '{band}', to_jsonb(CASE
  WHEN (report->>'genesScore')::int >= 61 THEN 'Fénix'
  WHEN (report->>'genesScore')::int >= 46 THEN 'Oro'
  WHEN (report->>'genesScore')::int >= 31 THEN 'Plata'
  WHEN (report->>'genesScore')::int >= 16 THEN 'Verde'
  ELSE 'Marrón'
END))
WHERE report->>'band' IN ('No cumple', 'Cumple mínimamente', 'Cumple parcialmente', 'Cumple plenamente')
  AND report->>'genesScore' IS NOT NULL;
