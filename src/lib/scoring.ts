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
