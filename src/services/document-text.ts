// ── Extracción de texto de documentos adjuntos (Validador · Fase 3) ──────────────
//
// CONSTRUIDO PERO DORMIDO. Convierte los archivos que el usuario sube a un plan
// (PDF / Word / Excel / TXT / CSV) en texto plano para pasárselo a la IA como
// contexto adicional. NO es una capacidad de la IA: la extracción la hace el
// backend con librerías locales; el modelo (Groq u otro) solo recibe TEXTO, así
// que no hace falta ninguna API que "soporte documentos".
//
// Se activa con VALIDATOR_READ_DOCS=true (ver validator-service.ts). Mientras esté
// apagado, este módulo no se ejecuta y el comportamiento del Validador no cambia.
//
// Fuera de alcance por ahora: PDF escaneado / imágenes → requieren OCR (tesseract);
// aquí se omiten (devuelven '') en vez de fallar.

import { readFile } from 'fs/promises';

// Presupuesto de caracteres para no reventar la ventana de contexto del modelo.
export const PER_DOC_CHARS = 8_000;   // por documento
export const TOTAL_DOC_CHARS = 20_000; // suma de todos los documentos del plan

// Forma mínima que necesitamos de una fila de plan_documents.
export interface DocRef {
  fileName:    string;
  mime:        string;
  storagePath: string;
}

const isDocx = (m: string) =>
  m === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const isXlsx = (m: string) =>
  m === 'application/vnd.ms-excel' ||
  m === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const isText = (m: string) => m === 'text/plain' || m === 'text/csv';

function collapse(text: string): string {
  // Normaliza espacios/saltos excesivos que ensucian el prompt.
  return text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

// Extrae el texto de UN documento según su tipo. Nunca lanza: ante cualquier
// error (formato ilegible, librería ausente, archivo perdido) devuelve ''.
async function extractOne(doc: DocRef): Promise<string> {
  try {
    if (doc.mime === 'application/pdf') {
      // Importamos el lib interno directamente para evitar el harness de prueba
      // que trae el index de pdf-parse cuando se carga sin módulo padre.
      // Vía variable: import dinámico puro (el subpath no trae tipos para tsc; Node
      // lo resuelve en runtime).
      const pdfLib = 'pdf-parse/lib/pdf-parse.js';
      const mod: any = await import(pdfLib);
      const pdfParse = mod.default ?? mod;
      const buf = await readFile(doc.storagePath);
      const out = await pdfParse(buf);
      return collapse(String(out?.text ?? ''));
    }

    if (isDocx(doc.mime)) {
      const mammoth: any = await import('mammoth');
      const buf = await readFile(doc.storagePath);
      const out = await mammoth.extractRawText({ buffer: buf });
      return collapse(String(out?.value ?? ''));
    }

    if (isXlsx(doc.mime)) {
      const XLSX: any = await import('xlsx');
      const buf = await readFile(doc.storagePath);
      const wb = XLSX.read(buf, { type: 'buffer' });
      const parts: string[] = [];
      for (const sheetName of wb.SheetNames as string[]) {
        const csv = XLSX.utils.sheet_to_csv(wb.Sheets[sheetName]);
        if (csv.trim()) parts.push(`# ${sheetName}\n${csv}`);
      }
      return collapse(parts.join('\n\n'));
    }

    if (isText(doc.mime)) {
      return collapse(await readFile(doc.storagePath, 'utf8'));
    }

    // Imágenes u otros: sin OCR, se omiten.
    return '';
  } catch (err) {
    console.error(`[validator] no se pudo extraer texto de "${doc.fileName}":`, err);
    return '';
  }
}

/**
 * Extrae y concatena el texto de todos los documentos de un plan, respetando el
 * presupuesto de caracteres. Devuelve '' si no hay nada útil. Nunca lanza.
 */
export async function extractPlanDocumentsText(docs: DocRef[]): Promise<string> {
  if (!Array.isArray(docs) || docs.length === 0) return '';

  const blocks: string[] = [];
  let used = 0;

  for (const doc of docs) {
    if (used >= TOTAL_DOC_CHARS) break;
    let text = await extractOne(doc);
    if (!text) continue;

    if (text.length > PER_DOC_CHARS) {
      text = text.slice(0, PER_DOC_CHARS) + '\n[…documento truncado…]';
    }
    const remaining = TOTAL_DOC_CHARS - used;
    if (text.length > remaining) {
      text = text.slice(0, remaining) + '\n[…truncado por límite total…]';
    }

    blocks.push(`--- Documento: ${doc.fileName} ---\n${text}`);
    used += text.length;
  }

  return blocks.join('\n\n');
}
