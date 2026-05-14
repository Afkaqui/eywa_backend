import { DiagnosticRepository } from '@/repositories/diagnostic-repository';
import { calculatePercentage, getScoreLevel } from '@/lib/scoring';
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
    const percentage = calculatePercentage(result.score, result.maxScore);
    const level      = getScoreLevel(percentage);

    await this.repository.saveResult({
      userId,
      score:      result.score,
      maxScore:   result.maxScore,
      percentage,
      level,
      breakdown:  result.breakdown,
    });
  }

  // Calcula score total a partir de respuestas { questionId → optionValue }
  static calculateScore(
    questions: Awaited<ReturnType<DiagnosticRepository['getQuestions']>>,
    answers: Record<string, string>
  ): DiagnosticResult {
    let totalScore    = 0;
    let totalMaxScore = 0;
    const breakdown: DiagnosticResult['breakdown'] = [];

    for (const question of questions) {
      const selectedValue  = answers[question.id];
      const options        = question.options ?? [];
      const maxQuestionScore = Math.max(...options.map(o => o.score), 0);
      const selectedOption   = options.find(o => o.value === selectedValue);
      const questionScore    = selectedOption?.score ?? 0;

      totalScore    += questionScore;
      totalMaxScore += maxQuestionScore;
      breakdown.push({ label: question.title, score: questionScore, maxScore: maxQuestionScore });
    }

    return {
      score:       totalScore,
      maxScore:    totalMaxScore,
      breakdown,
      completedAt: new Date().toISOString(),
    };
  }
}
