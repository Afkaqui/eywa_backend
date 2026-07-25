import type { ProjectPlan, PlanDocument } from '@prisma/client';
import { computeGenesFromCategories } from '@/lib/scoring';
import { extractPlanDocumentsText } from '@/services/document-text';

// El plan que llega desde el repo trae sus documentos reales (include planDocuments).
type PlanWithDocs = ProjectPlan & { planDocuments?: PlanDocument[] };

/**
 * Reporte estructurado que produce el Validador de Proyectos.
 *
 * ANCLADO EN GENES (2026-07-24): el proyecto se evalúa sobre las 4 categorías de
 * la metodología GENES Perú (escala 0-5), la MISMA que usa el Diagnóstico ESG.
 * El puntaje global se COMPUTA con los pesos oficiales (no lo decide la IA), así
 * que Validador y Diagnóstico hablan el mismo idioma: nota 0-5, escala 0-75 y
 * bandas de cumplimiento.
 */
export interface ValidationReport {
  overallScore:  number;           // 0-100 (derivado del ponderado GENES)
  genesScore:    number;           // 0-75  (escala de las bandas GENES)
  band:          string;           // banda GENES ("Cumple plenamente"…)
  categoryScores: {
    perfil:    number;             // 0-5 · Perfil de Emprendimiento
    ambiental: number;             // 0-5 · Ambiental
    social:    number;             // 0-5 · Social
    economico: number;             // 0-5 · Económico
  };
  strengths:       string[];
  weaknesses:      string[];
  recommendations: string[];
  riskLevel:  'low' | 'medium' | 'high';
  viability:  number;              // 0-100
  generatedBy: 'ai' | 'heuristic'; // trazabilidad del origen del reporte
}

// ── Configuración de la API de IA ───────────────────────────────────────────────
// Cuando ARS provea las credenciales, se rellenan estas variables en .env y el
// validador empieza a usar IA real automáticamente. Sin ellas usa el heurístico.
const AI_URL   = process.env.VALIDATOR_AI_URL;    // ej: https://api.proveedor.com/v1/chat/completions
const AI_KEY   = process.env.VALIDATOR_AI_KEY;    // API key del proveedor
const AI_MODEL = process.env.VALIDATOR_AI_MODEL;  // ej: gpt-4o, claude-..., etc.

// ── Fase 3 · lectura de documentos adjuntos (CONSTRUIDA PERO DORMIDA) ────────────
// Cuando VALIDATOR_READ_DOCS=true, antes de llamar a la IA se extrae el texto de
// los archivos subidos al plan (PDF/Word/Excel/TXT/CSV) y se agrega al prompt.
// La extracción la hace el backend con librerías locales; el modelo solo recibe
// TEXTO, así que Groq (u otro modelo de texto) lo soporta sin API especial.
// Apagado por defecto → el comportamiento actual del Validador no cambia.
const READ_DOCS = process.env.VALIDATOR_READ_DOCS === 'true';

export function isAiConfigured(): boolean {
  return Boolean(AI_URL && AI_KEY);
}

/**
 * Punto de entrada del análisis. Decide entre IA real o heurístico.
 * Nunca lanza: si la IA falla, cae al heurístico para no romper el flujo.
 */
export async function analyzeProjectPlan(plan: PlanWithDocs): Promise<ValidationReport> {
  if (isAiConfigured()) {
    try {
      // Fase 3 (dormida salvo VALIDATOR_READ_DOCS=true): texto de los adjuntos.
      // Nunca rompe el flujo: si algo falla, extractPlanDocumentsText devuelve ''.
      const docText = READ_DOCS ? await extractPlanDocumentsText(plan.planDocuments ?? []) : '';
      return await callExternalAI(plan, docText);
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
// Instrucciones del sistema: evaluación anclada en las 4 categorías GENES.
// OJO: NO se pide overallScore ni la banda — esos se COMPUTAN en el backend a
// partir de las 4 categorías con los pesos oficiales, para que el puntaje no sea
// alucinable y coincida exactamente con el del Diagnóstico.
const SYSTEM_PROMPT = [
  'Eres un evaluador de proyectos de impacto y sostenibilidad que aplica la',
  'metodología GENES Perú. Evalúas el proyecto en 4 CATEGORÍAS, cada una en',
  'escala 0 a 5 (0 = no cumple, 3 = cumple parcialmente, 5 = cumple plenamente):',
  '',
  '- perfil (Perfil de Emprendimiento): madurez del planteamiento, claridad del',
  '  problema y del segmento, definición de objetivos, potencial de crecimiento',
  '  y capacidad de medir su impacto.',
  '- ambiental: contribución ambiental real del proyecto — reducción de huella,',
  '  uso de recursos, insumos sostenibles, coherencia de la meta de CO₂ con el',
  '  presupuesto y la duración.',
  '- social: beneficio a la comunidad, empleo/inclusión, involucramiento de las',
  '  partes interesadas (stakeholders).',
  '- economico: viabilidad económica, uso del presupuesto, sostenibilidad',
  '  financiera y economía circular/inclusiva.',
  '',
  'Devuelves SOLO un objeto JSON válido, en español, con esta forma EXACTA:',
  '{ "categoryScores": { "perfil": number(0-5), "ambiental": number(0-5),',
  '  "social": number(0-5), "economico": number(0-5) }, "strengths": string[],',
  '  "weaknesses": string[], "recommendations": string[], "riskLevel":',
  '  "low"|"medium"|"high", "viability": number(0-100) }.',
  'Sé concreto: las fortalezas, debilidades y recomendaciones deben referirse al',
  'proyecto analizado, no ser genéricas.',
  'Si se incluye el contenido de documentos adjuntos, básate en ellos además de',
  'los campos del formulario para fundamentar el puntaje y los comentarios.',
].join('\n');

async function callExternalAI(plan: ProjectPlan, docText = ''): Promise<ValidationReport> {
  const prompt = buildPrompt(plan, docText);

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
        { role: 'system', content: SYSTEM_PROMPT },
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

function buildPrompt(plan: ProjectPlan, docText = ''): string {
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
    // Fase 3: contenido extraído de los documentos adjuntos (solo si READ_DOCS).
    docText ? `\nContenido de los documentos adjuntos del proyecto:\n${docText}` : '',
  ].filter(Boolean).join('\n');
}

// Asegura que cualquier reporte (de IA o heurístico) cumpla la forma esperada.
// El puntaje global se DERIVA de las 4 categorías con los pesos GENES: aunque la
// IA devolviera un overallScore, se ignora y se recalcula (no alucinable).
function normalizeReport(raw: unknown, source: 'ai' | 'heuristic'): ValidationReport {
  const r = (raw ?? {}) as Record<string, unknown>;
  const cats = (r.categoryScores ?? {}) as Record<string, unknown>;
  const clamp100 = (n: unknown, fallback = 50) =>
    Math.max(0, Math.min(100, Math.round(Number(n) || fallback)));
  const clamp5 = (n: unknown, fallback = 2.5) => {
    const v = Number(n);
    return Math.max(0, Math.min(5, Number.isFinite(v) ? v : fallback));
  };
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.map(String).filter(Boolean) : [];
  const risk = r.riskLevel === 'low' || r.riskLevel === 'high' ? r.riskLevel : 'medium';

  const categoryScores = {
    perfil:    clamp5(cats.perfil),
    ambiental: clamp5(cats.ambiental),
    social:    clamp5(cats.social),
    economico: clamp5(cats.economico),
  };
  const { genesScore, overallScore, band } = computeGenesFromCategories(categoryScores);

  return {
    overallScore,
    genesScore,
    band,
    categoryScores,
    strengths:       arr(r.strengths),
    weaknesses:      arr(r.weaknesses),
    recommendations: arr(r.recommendations),
    riskLevel:  risk as ValidationReport['riskLevel'],
    viability:  clamp100(r.viability),
    generatedBy: source,
  };
}

// ── Heurístico determinista (placeholder funcional hasta tener IA) ───────────────
// Genera un reporte coherente a partir de los datos del plan. No es IA: es una
// aproximación basada en reglas para que el flujo completo funcione hoy.
function heuristicReport(plan: ProjectPlan): ValidationReport {
  // Intensidad de carbono: toneladas CO₂ evitadas por cada $1000 invertidos
  const carbonPerK = plan.budget > 0 ? plan.carbonGoal / (plan.budget / 1000) : 0;
  const longHorizon = plan.duration >= 18;
  const bigBudget   = plan.budget >= 1_000_000;

  // ── Puntajes por categoría GENES (0-5) a partir de los datos del plan ──
  const clamp5 = (n: number) => Math.max(0, Math.min(5, n));
  const categoryScores = {
    // Perfil: madurez del planteamiento (objetivos, stakeholders, horizonte)
    perfil:    clamp5(1.5 + (plan.objectives ? 1.5 : 0) + (plan.stakeholders ? 1 : 0) + (longHorizon ? 0 : 1)),
    // Ambiental: eficiencia de captura de carbono por dólar
    ambiental: clamp5(carbonPerK >= 3 ? 5 : carbonPerK >= 2 ? 4 : carbonPerK >= 1 ? 3 : carbonPerK > 0 ? 2 : 1),
    // Social: involucramiento de partes interesadas
    social:    clamp5(plan.stakeholders ? 4 : 2.5),
    // Económico: viabilidad según presupuesto y horizonte
    economico: clamp5(!longHorizon && !bigBudget ? 4 : (longHorizon && bigBudget ? 2 : 3)),
  };
  const { genesScore, overallScore, band } = computeGenesFromCategories(categoryScores);

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
    'Establecer indicadores medibles de impacto por categoría GENES desde el inicio',
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
    genesScore,
    band,
    categoryScores,
    strengths,
    weaknesses,
    recommendations,
    riskLevel,
    viability,
    generatedBy: 'heuristic',
  };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}
