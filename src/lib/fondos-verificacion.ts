// ══ Re-verificación de fondos — lógica pura (PENDIENTES §16, Fase 1) ═══════════
//
// Lee el texto de la página de un fondo y decide qué se sabe de él. No toca la BD
// ni la red: así se puede probar contra páginas reales sin efectos.
//
// Principio: lo automático PROPONE. Una fecha solo se aplica sola cuando es
// inequívoca; cualquier duda va a la cola de revisión humana. Un catálogo con una
// fecha equivocada es peor que uno con la fecha marcada "por revisar".

export type EstadoVerificacion =
  | 'vigente'      // hay una fecha de cierre futura en la página
  | 'cerrado'      // la página dice que está cerrada y no hay fecha futura
  | 'enlace_roto'  // 404 / 410
  | 'bloqueado'    // 401 / 403 / 429 / 503: anti-bot o caído. No se fuerza.
  | 'sin_datos'    // carga pero sin texto útil (JS) o sin fecha
  | 'error';       // fallo de red

const MESES_ES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8,
  septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};
const MESES_EN: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8,
  september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

// Palabras que indican que una fecha es la de CIERRE. Se buscan SOLO en el tramo
// entre la fecha anterior y esta: en "Deadline: Jul 31 · Review period: Aug 1 – Dec 15",
// la palabra "Deadline" es de Jul 31, no de Dec 15. Medido con páginas reales: mirar
// simplemente "cerca" asignaba a una fecha la etiqueta de la anterior.
// Ojo: "closed" NO está (eso es CERRADA): "closes"/"closing" sí.
const CIERRE = /(fecha\s+l[ií]mite|cierre|cierra|plazo|vence|hasta\s+el|postulaciones?\s+hasta|deadline|closes|closing|apply\s+by|due\s+(date|by|on)|applications?\s+(are\s+)?due|submissions?\s+(due|by|until)|open\s+until)/i;

// Fechas que NO son de cierre aunque estén junto a una palabra de cierre: resultados,
// evaluación, notificación, eventos. "notified by December 1" no es un plazo.
const NO_ES_CIERRE = /(report|informe|notif|announc|result|award|review|evaluaci|resultado|publicaci[oó]n\s+de|anuncio|ganador|winner|selected|seleccionad|period|periodo|webinar|evento|event|info(rmation)?\s+session|sesi[oó]n\s+informativa|published|posted|actualizado|updated)/i;

// La página dice expresamente que está cerrada.
const CERRADA = /((applications?|postulaciones|convocatoria|call|programs?)[^.]{0,60}(now\s+)?(closed|cerrad[ao]s?|finalizad[ao]s?|concluid[ao]s?)|no\s+longer\s+accepting|closed\s+for\s+applications)/i;

export interface FechaEncontrada {
  fecha: Date;
  cercaDeCierre: boolean;
  evidencia: string;
}

function fechaValida(y: number, m: number, d: number): Date | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  const f = new Date(Date.UTC(y, m - 1, d, 23, 59, 59));
  return f.getUTCDate() === d ? f : null; // descarta 31 de febrero y similares
}

/** Todas las fechas reconocibles del texto, con su contexto. */
export function extraerFechas(texto: string): FechaEncontrada[] {
  const crudas: { idx: number; largo: number; fecha: Date }[] = [];
  const anotar = (idx: number, largo: number, f: Date | null) => { if (f) crudas.push({ idx, largo, fecha: f }); };

  // 31 de octubre de 2026 · 31 de octubre del 2026
  for (const m of texto.matchAll(/\b(\d{1,2})\s+de\s+([a-záéíóú]+)\s+(?:de|del)\s+(\d{4})\b/gi)) {
    const mes = MESES_ES[m[2].toLowerCase()];
    if (mes) anotar(m.index!, m[0].length, fechaValida(+m[3], mes, +m[1]));
  }
  // October 31, 2026 · Oct. 31st 2026
  for (const m of texto.matchAll(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/g)) {
    const mes = MESES_EN[m[1].toLowerCase()];
    if (mes) anotar(m.index!, m[0].length, fechaValida(+m[3], mes, +m[2]));
  }
  // 31 October 2026 · 31st of October, 2026
  for (const m of texto.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([A-Za-z]{3,9})\.?,?\s+(\d{4})\b/g)) {
    const mes = MESES_EN[m[2].toLowerCase()];
    if (mes) anotar(m.index!, m[0].length, fechaValida(+m[3], mes, +m[1]));
  }
  // 2026-10-31 (ISO)
  for (const m of texto.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)) {
    anotar(m.index!, m[0].length, fechaValida(+m[1], +m[2], +m[3]));
  }
  // 31/10/2026 — solo si es inequívoca (día > 12). 05/10/2026 puede ser 5 de octubre
  // o 10 de mayo según el país, y adivinar es justo lo que no hay que hacer.
  for (const m of texto.matchAll(/\b(\d{1,2})[/.](\d{1,2})[/.](20\d{2})\b/g)) {
    const a = +m[1], b = +m[2];
    if (a > 12) anotar(m.index!, m[0].length, fechaValida(+m[3], b, a));
    else if (b > 12) anotar(m.index!, m[0].length, fechaValida(+m[3], a, b));
  }

  // Contexto de cada fecha = el tramo desde el final de la fecha ANTERIOR (máx. 140
  // caracteres). Así una etiqueta solo califica a la fecha que tiene inmediatamente
  // después, no a cualquiera que venga más adelante.
  crudas.sort((a, b) => a.idx - b.idx);
  return crudas.map((c, i) => {
    const finPrevia = i > 0 ? crudas[i - 1].idx + crudas[i - 1].largo : 0;
    const desde = Math.max(finPrevia, c.idx - 140);
    const tramo = texto.slice(desde, c.idx);
    return {
      fecha: c.fecha,
      // Solo el tramo ANTERIOR: lo que viene después suele ser otra frase ("We look
      // forward to reviewing…") y descartaba fechas correctas.
      cercaDeCierre: CIERRE.test(tramo) && !NO_ES_CIERRE.test(tramo),
      evidencia: texto.slice(Math.max(0, c.idx - 100), c.idx + c.largo + 40).replace(/\s+/g, ' ').trim(),
    };
  });
}

export interface Decision {
  estado: EstadoVerificacion;
  /** Fecha encontrada por el bot (se aplique o no). */
  fechaDetectada: Date | null;
  evidencia: string | null;
  /** Siempre false: el bot propone, no aplica (ver `decidir`). Se conserva el campo
   *  para que el contrato quede explícito si algún día se mide una regla fiable. */
  aplicarFecha: false;
  revisar: boolean;
  motivo: string | null;
}

/**
 * Decide a partir del resultado HTTP y del texto de la página.
 * `actual` es la fecha de cierre que el catálogo tiene hoy para ese fondo.
 */
export function decidir(args: {
  http: number | null;      // null = fallo de red
  texto: string | null;
  actual: Date | null;
  hoy?: Date;
}): Decision {
  const hoy = args.hoy ?? new Date();
  const base = { fechaDetectada: null, evidencia: null, aplicarFecha: false as const };

  if (args.http === null) return { ...base, estado: 'error', revisar: false, motivo: null };
  if (args.http === 404 || args.http === 410) {
    return { ...base, estado: 'enlace_roto', revisar: true, motivo: 'La página del fondo ya no existe (404). Buscar la URL nueva.' };
  }
  if ([401, 403, 429, 503].includes(args.http)) {
    // No es motivo de revisión cada noche: el sitio bloquea bots, no cambió nada.
    return { ...base, estado: 'bloqueado', revisar: false, motivo: null };
  }
  if (args.http >= 400) return { ...base, estado: 'error', revisar: false, motivo: null };

  const texto = args.texto ?? '';
  if (texto.length < 800) {
    return { ...base, estado: 'sin_datos', revisar: false, motivo: null };
  }

  const limite = new Date(hoy.getTime() + 2 * 365 * 24 * 3600 * 1000); // fechas absurdas fuera
  const futuras = extraerFechas(texto).filter((f) => f.cercaDeCierre && f.fecha > hoy && f.fecha < limite);
  const distintas = [...new Map(futuras.map((f) => [f.fecha.toISOString().slice(0, 10), f])).values()]
    .sort((a, b) => a.fecha.getTime() - b.fecha.getTime());

  if (distintas.length === 0) {
    if (CERRADA.test(texto)) return { ...base, estado: 'cerrado', revisar: false, motivo: null };
    return { ...base, estado: 'sin_datos', revisar: false, motivo: null };
  }
  // La página dice "cerrada" pero también trae una fecha futura (p. ej. la de la
  // próxima edición): no se decide solo.
  const diceCerrada = CERRADA.test(texto);

  const prox = distintas[0];
  const mismaFecha = args.actual && args.actual.toISOString().slice(0, 10) === prox.fecha.toISOString().slice(0, 10);
  const actualVencida = !args.actual || args.actual <= hoy;

  if (mismaFecha) {
    return { estado: 'vigente', fechaDetectada: prox.fecha, evidencia: prox.evidencia, aplicarFecha: false as const, revisar: false, motivo: null };
  }
  // ⚠️ El bot NUNCA aplica una fecha por su cuenta. Medido el 2026-10-09 sobre las
  // 149 páginas reales: con reglas de proximidad, de las fechas que se habrían
  // aplicado solas acertaba 1 de 2, y tras endurecerlas 1 de 3 (tomaba la entrega de
  // un informe final, o el plazo de OTRO programa que la web lista en un recuadro).
  // Una fecha equivocada en el catálogo es peor que una marcada "por revisar", así
  // que todo hallazgo va a la cola con su evidencia y un gestor lo acepta con un clic.
  void actualVencida;
  return {
    estado: 'vigente',
    fechaDetectada: prox.fecha,
    evidencia: prox.evidencia,
    aplicarFecha: false as const,
    revisar: true,
    motivo: diceCerrada
      ? 'La página dice que la convocatoria está cerrada pero menciona una fecha futura; confirmar si es la próxima edición.'
      : distintas.length > 1
      ? `La página menciona ${distintas.length} fechas de cierre; la propuesta es la más próxima. Confirmar cuál aplica.`
      : args.actual && args.actual > hoy
      ? 'La página indica una fecha de cierre distinta a la registrada.'
      : 'Fecha de cierre nueva detectada (la registrada ya venció o no había). Confirmar.',
  };
}

/** Texto visible de un HTML, sin scripts ni estilos. Suficiente para buscar fechas. */
export function textoDeHtml(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/\s+/g, ' ')
    .trim();
}
