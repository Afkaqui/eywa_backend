import { DiagnosticRepository } from '@/repositories/diagnostic-repository';
import { calculatePercentage, getGenesBand, GENES_SCALE, GENES_MAX_POINTS } from '@/lib/scoring';
import type { DiagnosticResult } from '@/types/database';

export class DiagnosticService {
  constructor(private repository: DiagnosticRepository) {}

  async getQuestions() {
    return this.repository.getQuestions();
  }

  async getLatestResult(userId: string): Promise<DiagnosticResult | null> {
    const row = await this.repository.getLatestResult(userId);
    if (!row) return null;
    return {
      score:       row.score,
      maxScore:    row.maxScore,
      breakdown:   row.breakdown as DiagnosticResult['breakdown'],
      completedAt: row.createdAt.toISOString(),
    };
  }

  async saveResult(userId: string, result: DiagnosticResult): Promise<void> {
    // result.score ya viene en la escala GENES (0-75); result.maxScore = 75.
    const percentage = calculatePercentage(result.score, result.maxScore);
    const level      = getGenesBand(result.score); // banda oficial GENES

    await this.repository.saveResult({
      userId,
      score:      result.score,
      maxScore:   result.maxScore,
      percentage,
      level,
      breakdown:  result.breakdown,
    });
  }

  // Calcula el puntaje PONDERADO (metodología GENES) a partir de las respuestas.
  // Cada criterio se puntúa 0-5 (opción elegida) y aporta (puntos × peso). Los pesos
  // suman 1.0, así que el ponderado va de 0 a 5; se lleva a la escala 0-75 de las bandas.
  static calculateScore(
    questions: Awaited<ReturnType<DiagnosticRepository['getQuestions']>>,
    answers: Record<string, string>
  ): DiagnosticResult {
    let weighted = 0; // Σ(puntos × peso), 0..5
    const breakdown: DiagnosticResult['breakdown'] = [];

    for (const question of questions) {
      const options        = question.options ?? [];
      const selectedOption = options.find(o => o.value === answers[question.id]);
      const points         = selectedOption?.score ?? 0;          // 0..5
      const weight         = (question as { weight?: number }).weight ?? 0;
      const category       = (question as { category?: string }).category ?? 'general';

      weighted += points * weight;
      breakdown.push({ label: question.title, score: points, maxScore: GENES_MAX_POINTS, category });
    }

    // Ponderado (0-5) → escala de bandas (0-75)
    const genesScore = Math.round(weighted * (GENES_SCALE / GENES_MAX_POINTS));

    return {
      score:       genesScore,
      maxScore:    GENES_SCALE,
      breakdown,
      completedAt: new Date().toISOString(),
    };
  }
}
