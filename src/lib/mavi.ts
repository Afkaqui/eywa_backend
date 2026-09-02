/**
 * Cliente de MAVI (ARS LAB) — envío de proyectos a su cartera para prevalidación.
 *
 * Contrato verificado contra el servidor real el 2026-09-02 (ver PENDIENTES §14).
 * Lo que la documentación NO decía y aquí sí importa:
 *
 *  · `consentimiento_datos` debe ser exactamente `true`; el servidor rechaza `false`.
 *  · Los campos opcionales NO admiten `null`: hay que OMITIR la clave. Enviar
 *    `"telefono": null` da 422. En EYWA el teléfono y el RUC vienen vacíos a
 *    menudo, así que podar los nulos no es cosmética: sin ello no entra nada.
 *  · La respuesta trae un `mavii_lite` con score, semáforo y decisión sugerida.
 */

const URL_POR_DEFECTO = 'https://ars.pe/api/external/proyectos';

export interface MaviLite {
  score?: number;
  semaforo?: string;
  decision_sugerida?: string;
  documentos_pendientes?: string[];
  criterios_sin_evaluar?: string[];
}

export interface MaviRespuesta {
  id_proyecto: string;
  estado: string;
  url_seguimiento?: string;
  mavii_lite?: MaviLite;
}

export interface DatosEnvio {
  referencia: string;
  proyecto: {
    nombre: string;
    descripcion: string;
    categoria?: string | null;
    objetivo?: string | null;
    etapa?: string | null;
    pais?: string | null;
    region?: string | null;
  };
  solicitante: {
    nombre?: string | null;
    email: string;
    telefono?: string | null;
    organizacion?: string | null;
    ruc?: string | null;
  };
  finanzas?: {
    presupuesto?: number | null;
    moneda?: string;
    fuentes?: string | null;
  };
  documentos: { tipo: string; estado: string }[];
}

export function maviConfigurado(): boolean {
  return !!process.env.MAVI_API_KEY;
}

/** Quita las claves cuyo valor es null/undefined/"" — MAVI las rechaza en vez de ignorarlas. */
function podar<T extends Record<string, unknown>>(o: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== ''),
  ) as Partial<T>;
}

export function construirPayload(d: DatosEnvio) {
  return {
    origen: 'EYWA' as const,
    referencia_externa: d.referencia,
    proyecto: podar({
      nombre:      d.proyecto.nombre,
      descripcion: d.proyecto.descripcion,
      categoria:   d.proyecto.categoria,
      objetivo:    d.proyecto.objetivo,
      etapa:       d.proyecto.etapa,
      ubicacion:   Object.keys(podar({ pais: d.proyecto.pais, region: d.proyecto.region })).length
        ? podar({ pais: d.proyecto.pais, region: d.proyecto.region })
        : undefined,
    }),
    solicitante: podar({
      nombre:       d.solicitante.nombre,
      email:        d.solicitante.email,
      telefono:     d.solicitante.telefono,
      organizacion: d.solicitante.organizacion,
      ruc:          d.solicitante.ruc,
    }),
    ...(d.finanzas && (d.finanzas.presupuesto || d.finanzas.fuentes)
      ? {
          finanzas: podar({
            presupuesto_estimado: d.finanzas.presupuesto,
            // EYWA trata el presupuesto en USD; si no se dice, MAVI asumiría otra cosa.
            moneda:               d.finanzas.moneda ?? 'USD',
            fuentes_previstas:    d.finanzas.fuentes,
          }),
        }
      : {}),
    documentos: d.documentos,
    // Quien llama ya verificó el consentimiento; nunca se pone a true "por defecto".
    consentimiento_datos: true as const,
  };
}

export type ResultadoEnvio =
  | { ok: true; datos: MaviRespuesta }
  | { ok: false; error: string; status?: number };

export async function enviarAMavi(d: DatosEnvio): Promise<ResultadoEnvio> {
  const key = process.env.MAVI_API_KEY;
  if (!key) return { ok: false, error: 'La integración con MAVI no está configurada' };

  const url = process.env.MAVI_API_URL || URL_POR_DEFECTO;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Api-Key':    key,
      },
      body:   JSON.stringify(construirPayload(d)),
      // El servidor de ARS está en un Replit; si tarda, no se bloquea la petición.
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    return { ok: false, error: 'No se pudo contactar con MAVI. Inténtalo más tarde.' };
  }

  const cuerpo = await res.json().catch(() => ({}));

  if (!res.ok) {
    // El 422 trae `errors: [{field, message}]`. Se devuelve el detalle real: un
    // "no se pudo enviar" genérico esconde justo lo que hay que corregir.
    const detalle = Array.isArray((cuerpo as { errors?: unknown[] }).errors)
      ? (cuerpo as { errors: { field?: string; message?: string }[] }).errors
          .map(e => `${e.field}: ${e.message}`).join(' · ')
      : (cuerpo as { message?: string }).message;
    return {
      ok: false,
      status: res.status,
      error: detalle ?? `MAVI respondió ${res.status}`,
    };
  }

  return { ok: true, datos: cuerpo as MaviRespuesta };
}

/**
 * Traduce los ítems del dataroom que la organización tiene cubiertos al enum de MAVI.
 * MAVI también devuelve `legal` como pendiente, pero no lo acepta de entrada.
 */
export const ITEMS_POR_TIPO: Record<string, string[]> = {
  plan_negocio:      ['Descripción del modelo de negocio'],
  modelo_financiero: ['Estados financieros (anuales y trimestrales)', 'Presupuestos y proyecciones'],
  estudio_mercado:   ['Estudios de mercado y competencia'],
};

export function documentosDesdeDataroom(itemsConDocumentos: Set<string>) {
  return Object.entries(ITEMS_POR_TIPO).map(([tipo, nombres]) => ({
    tipo,
    // "adjunto" exigiría una URL pública, y los del dataroom son privados a propósito.
    estado: nombres.some(n => itemsConDocumentos.has(n)) ? 'disponible' : 'no_disponible',
  }));
}
