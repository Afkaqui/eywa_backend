// La escala oficial de EYWA es GENES (más abajo). Aquí vivía además una escala
// genérica (`getScoreLevel`: Excelente/Bueno/Moderado) que se contradecía con
// ella. Se eliminó con el fix del Trust Score (2026-07-25).
// **No reintroducir una segunda escala de calificación.**

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

// Categorías GENES (definidas por Eduardo, 2026-07-25): 5 niveles de menor a
// mayor sobre la escala 0-75, en tramos iguales de 15 puntos.
// Sustituyen a las 4 bandas anteriores (No cumple / Mínimamente / Parcialmente /
// Plenamente); los cortes 31/46/61 se conservan y el antiguo 0-30 se parte en dos.
export const GENES_BANDS = [
  { min: 61, label: 'Fénix'  },  // 61-75
  { min: 46, label: 'Oro'    },  // 46-60
  { min: 31, label: 'Plata'  },  // 31-45
  { min: 16, label: 'Verde'  },  // 16-30
  { min: 0,  label: 'Marrón' },  // 0-15
] as const;

export function getGenesBand(genesScore: number): string {
  for (const b of GENES_BANDS) if (genesScore >= b.min) return b.label;
  return 'Marrón';
}

export const GENES_CATEGORIES: Record<string, string> = {
  perfil:    'Perfil de Emprendimiento',
  ambiental: 'Ambiental',
  social:    'Social',
  economico: 'Económico',
  general:   'General',
};

// Peso de cada categoría GENES (suma de los pesos de sus criterios en el cuadro
// oficial). Suman 1.0. Se usan para ponderar los 4 promedios de categoría (0-5)
// en un único puntaje, igual que el Diagnóstico.
export const GENES_CATEGORY_WEIGHTS: Record<'perfil' | 'ambiental' | 'social' | 'economico', number> = {
  perfil:    0.34,
  ambiental: 0.16,
  social:    0.25,
  economico: 0.25,
};

// A partir de los 4 promedios de categoría (0-5) calcula el puntaje ponderado.
// El puntaje NO lo decide la IA: se computa aquí con los pesos oficiales.
export function computeGenesFromCategories(cat: {
  perfil: number; ambiental: number; social: number; economico: number;
}): { genesScore: number; overallScore: number; band: string } {
  const weighted =
    cat.perfil    * GENES_CATEGORY_WEIGHTS.perfil +
    cat.ambiental * GENES_CATEGORY_WEIGHTS.ambiental +
    cat.social    * GENES_CATEGORY_WEIGHTS.social +
    cat.economico * GENES_CATEGORY_WEIGHTS.economico; // 0-5

  const genesScore   = Math.round(weighted * (GENES_SCALE / GENES_MAX_POINTS)); // 0-75
  const overallScore = Math.round((weighted / GENES_MAX_POINTS) * 100);          // 0-100
  return { genesScore, overallScore, band: getGenesBand(genesScore) };
}

// ── Cálculo GENES a partir de respuestas (servidor) ──────────────────────────
// Réplica EXACTA de `calculateScore` en DiagnosticInterface.tsx del frontend: allí
// se calcula el diagnóstico que hace un usuario en la plataforma; aquí, el que
// llega por la API externa. Si cambia uno, tiene que cambiar el otro, o la misma
// empresa obtendría puntajes distintos según por dónde entre.
//
// La API no acepta un puntaje ya calculado: recibe la OPCIÓN elegida en cada
// criterio y el puntaje lo pone EYWA. Así la metodología no depende de cómo la
// interprete cada sistema que nos alimente.
export interface CriterioGenes {
  code: string | null;
  title: string;
  category: string;
  weight: number;
  options: { value: string; score: number }[];
}

export function calcularGenes(criterios: CriterioGenes[], opcionPorCodigo: Map<string, string>) {
  const pesoTotal = criterios.reduce((s, q) => s + q.weight, 0);
  const desglose = criterios.map((q) => {
    const sel = q.options.find((o) => o.value === opcionPorCodigo.get(q.code ?? ''));
    return {
      code:     q.code,
      label:    q.title,
      score:    sel?.score ?? 0,
      maxScore: GENES_MAX_POINTS,
      category: q.category,
    };
  });
  const ponderado = pesoTotal > 0
    ? criterios.reduce((s, q, i) => s + desglose[i].score * q.weight, 0) / pesoTotal // 0..5
    : 0;
  const score = Math.round(ponderado * (GENES_SCALE / GENES_MAX_POINTS)); // 0..75
  return {
    score,
    maxScore:   GENES_SCALE,
    percentage: calculatePercentage(score, GENES_SCALE),
    level:      getGenesBand(score),
    breakdown:  desglose,
  };
}
