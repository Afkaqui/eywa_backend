export const SCORE_THRESHOLDS = { EXCELLENT: 80, GOOD: 60, MODERATE: 40 } as const;

export function getScoreLevel(percentage: number): string {
  if (percentage >= SCORE_THRESHOLDS.EXCELLENT) return 'Excelente';
  if (percentage >= SCORE_THRESHOLDS.GOOD)      return 'Bueno';
  if (percentage >= SCORE_THRESHOLDS.MODERATE)  return 'Moderado';
  return 'Inicial';
}

export function calculatePercentage(score: number, maxScore: number): number {
  if (maxScore === 0) return 0;
  return Math.round((score / maxScore) * 100);
}

// ── Metodología GENES (ponderada) ────────────────────────────────────────────
// Cada criterio se puntúa 0-5 y aporta (puntos × peso). Los pesos suman 1.0, así
// que el máximo ponderado es 5. El resultado se lleva a la escala 0-75 (5 × 15)
// que usan las bandas de clasificación oficiales del cuadro GENES.
export const GENES_MAX_POINTS = 5;
export const GENES_SCALE = 75; // escala de las bandas de clasificación

export const GENES_BANDS = [
  { min: 61, label: 'Cumple plenamente' },
  { min: 46, label: 'Cumple parcialmente' },
  { min: 31, label: 'Cumple mínimamente' },
  { min: 0,  label: 'No cumple' },
] as const;

export function getGenesBand(genesScore: number): string {
  for (const b of GENES_BANDS) if (genesScore >= b.min) return b.label;
  return 'No cumple';
}

export const GENES_CATEGORIES: Record<string, string> = {
  perfil:    'Perfil de Emprendimiento',
  ambiental: 'Ambiental',
  social:    'Social',
  economico: 'Económico',
  general:   'General',
};
