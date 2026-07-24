import type { ProjectPlan } from '@prisma/client';

/**
 * Reporte estructurado que produce el Validador de Proyectos.
 * Esta es la forma que consume el frontend (ValidadorProyectos.tsx → ReportModal).
 */
export interface ValidationReport {
  overallScore: number;            // 0-100
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  esgScores: {
    environmental: number;         // 0-100
    social: number;                // 0-100
    governance: number;            // 0-100
  };
  riskLevel: 'low' | 'medium' | 'high';
  viability: number;               // 0-100
  generatedBy: 'ai' | 'heuristic'; // trazabilidad del origen del reporte
}

// ── Configuración de la API de IA ───────────────────────────────────────────────
// Cuando ARS provea las credenciales, se rellenan estas variables en .env y el
// validador empieza a usar IA real automáticamente. Sin ellas usa el heurístico.
const AI_URL   = process.env.VALIDATOR_AI_URL;    // ej: https://api.proveedor.com/v1/chat/completions
const AI_KEY   = process.env.VALIDATOR_AI_KEY;    // API key del proveedor
const AI_MODEL = process.env.VALIDATOR_AI_MODEL;  // ej: gpt-4o, claude-..., etc.

export function isAiConfigured(): boolean {
  return Boolean(AI_URL && AI_KEY);
}

/**
 * Punto de entrada del análisis. Decide entre IA real o heurístico.
 * Nunca lanza: si la IA falla, cae al heurístico para no romper el flujo.
 */
export async function analyzeProjectPlan(plan: ProjectPlan): Promise<ValidationReport> {
  if (isAiConfigured()) {
    try {
      return await callExternalAI(plan);
    } catch (err) {
      console.error('[validator] La IA falló, usando heurístico:', err);
    }
  }
  return heuristicReport(plan);
}

// ── Integración con la API de IA (ADAPTAR AL CONTRATO DE ARS) ────────────────────
//
// Implementación por defecto: API compatible con OpenAI (/chat/completions) que
// devuelve el reporte como JSON. Cuando ARS confirme su contrato real (endpoint,
// formato de request/response), ajustar SOLO esta función.
async function callExternalAI(plan: ProjectPlan): Promise<ValidationReport> {
  const prompt = buildPrompt(plan);

  const res = await fetch(AI_URL!, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${AI_KEY}`,
      // Explícito a propósito: proveedores detrás de Cloudflare (Groq entre ellos)
      // responden 403 "error code: 1010" a clientes sin User-Agent reconocible.
      // Verificado en pruebas: sin cabecera -> 403; con ella -> 200.
      'User-Agent':    'eywa-validator/1.0',
    },
    body: JSON.stringify({
      model: AI_MODEL ?? 'default',
      messages: [
        {
          role: 'system',
          content:
            'Eres un analista experto en sostenibilidad y ESG. Evalúas planes de ' +
            'proyectos y devuelves SOLO un objeto JSON válido con esta forma exacta: ' +
            '{ "overallScore": number(0-100), "strengths": string[], "weaknesses": ' +
            'string[], "recommendations": string[], "esgScores": { "environmental": ' +
            'number, "social": number, "governance": number }, "riskLevel": ' +
            '"low"|"medium"|"high", "viability": number(0-100) }. Responde en español.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.4,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(45_000),
  });

  if (!res.ok) {
    throw new Error(`IA respondió ${res.status}: ${await res.text().catch(() => '')}`);
  }

  // El contrato exacto lo define ARS; usamos `any` por ser una respuesta externa.
  const data = await res.json() as any;
  // Formato OpenAI-compatible: el contenido viene en choices[0].message.content
  const content: string =
    data?.choices?.[0]?.message?.content ?? data?.content ?? JSON.stringify(data);

  const parsed = JSON.parse(content);
  return normalizeReport(parsed, 'ai');
}

function buildPrompt(plan: ProjectPlan): string {
  return [
    `Analiza el siguiente plan de proyecto de sostenibilidad y genera el reporte ESG en JSON.`,
    ``,
    `Nombre: ${plan.name}`,
    `Tipo: ${plan.type}`,
    `Descripción: ${plan.description}`,
    `Presupuesto: $${plan.budget.toLocaleString('en-US')} USD`,
    `Duración: ${plan.duration} meses`,
    `Meta de reducción de CO₂: ${plan.carbonGoal} toneladas`,
    plan.objectives   ? `Objetivos: ${plan.objectives}` : '',
    plan.stakeholders ? `Stakeholders: ${plan.stakeholders}` : '',
  ].filter(Boolean).join('\n');
}

// Asegura que cualquier reporte (de IA o heurístico) cumpla la forma esperada
function normalizeReport(raw: unknown, source: 'ai' | 'heuristic'): ValidationReport {
  const r = (raw ?? {}) as Record<string, unknown>;
  const esg = (r.esgScores ?? {}) as Record<string, unknown>;
  const clamp = (n: unknown, fallback = 0) =>
    Math.max(0, Math.min(100, Math.round(Number(n) || fallback)));
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.map(String).filter(Boolean) : [];
  const risk = r.riskLevel === 'low' || r.riskLevel === 'high' ? r.riskLevel : 'medium';

  return {
    overallScore:    clamp(r.overallScore, 50),
    strengths:       arr(r.strengths),
    weaknesses:      arr(r.weaknesses),
    recommendations: arr(r.recommendations),
    esgScores: {
      environmental: clamp(esg.environmental, 50),
      social:        clamp(esg.social, 50),
      governance:    clamp(esg.governance, 50),
    },
    riskLevel:  risk as ValidationReport['riskLevel'],
    viability:  clamp(r.viability, 50),
    generatedBy: source,
  };
}

// ── Heurístico determinista (placeholder funcional hasta tener IA) ───────────────
// Genera un reporte coherente a partir de los datos del plan. No es IA: es una
// aproximación basada en reglas para que el flujo completo funcione hoy.
function heuristicReport(plan: ProjectPlan): ValidationReport {
  // Intensidad de carbono: toneladas CO₂ evitadas por cada $1000 invertidos
  const carbonPerK = plan.budget > 0 ? plan.carbonGoal / (plan.budget / 1000) : 0;
  const environmental = clamp01(40 + carbonPerK * 8);
  const social        = clamp01(plan.stakeholders ? 78 : 60);
  const governance    = clamp01(plan.objectives ? 82 : 64);
  const overallScore  = Math.round((environmental + social + governance) / 3);

  // Riesgo según horizonte temporal y tamaño de inversión
  const longHorizon = plan.duration >= 18;
  const bigBudget   = plan.budget >= 1_000_000;
  const riskLevel: ValidationReport['riskLevel'] =
    longHorizon && bigBudget ? 'high' : longHorizon || bigBudget ? 'medium' : 'low';

  const viability = clamp01(overallScore - (riskLevel === 'high' ? 15 : riskLevel === 'medium' ? 7 : 0));

  const strengths: string[] = [];
  if (carbonPerK >= 3) strengths.push('Alta eficiencia de captura de carbono por dólar invertido');
  if (plan.objectives) strengths.push('Objetivos específicos bien definidos');
  if (plan.stakeholders) strengths.push('Identificación clara de partes interesadas');
  if (!longHorizon) strengths.push('Horizonte de implementación corto, retorno más rápido');
  if (strengths.length === 0) strengths.push('Proyecto alineado con metas de sostenibilidad');

  const weaknesses: string[] = [];
  if (bigBudget) weaknesses.push('Inversión inicial elevada requiere financiamiento estructurado');
  if (longHorizon) weaknesses.push('Horizonte largo aumenta la incertidumbre del retorno');
  if (!plan.stakeholders) weaknesses.push('No se han identificado las partes interesadas');
  if (carbonPerK < 1) weaknesses.push('Baja relación entre reducción de CO₂ y presupuesto');
  if (weaknesses.length === 0) weaknesses.push('Métricas de impacto pendientes de cuantificar con precisión');

  const recommendations: string[] = [
    'Establecer indicadores medibles de impacto ESG desde el inicio',
    bigBudget
      ? 'Evaluar financiamiento verde o bonos de sostenibilidad'
      : 'Validar el presupuesto con cotizaciones de proveedores certificados',
    longHorizon
      ? 'Definir hitos intermedios y un plan de monitoreo continuo'
      : 'Documentar resultados para certificación de impacto',
    'Certificar el proyecto con estándares reconocidos (ISO 14001, VCS, Gold Standard)',
  ];

  return {
    overallScore,
    strengths,
    weaknesses,
    recommendations,
    esgScores: { environmental, social, governance },
    riskLevel,
    viability,
    generatedBy: 'heuristic',
  };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}
