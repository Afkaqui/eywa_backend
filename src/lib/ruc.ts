// ── RUC peruano ─────────────────────────────────────────────────────────────────
//
// 11 dígitos. Los dos primeros son el TIPO de contribuyente:
//   10 → persona natural con negocio (se deriva del DNI; una persona tiene UNO solo)
//   20 → persona jurídica (una persona puede estar detrás de varias)
//   15 / 17 → otros casos de persona natural (menos frecuentes, se aceptan)
//
// El último dígito es verificador y se calcula con pesos fijos. Validarlo evita
// que entren RUC inventados o con un dígito mal tecleado — que es justo lo que
// pasaría al pedirlo en un formulario.

export type TipoRuc = 'persona_natural' | 'empresa';

/** Pesos oficiales para el dígito verificador (posiciones 1..10). */
const PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

export interface RucValidado {
  ok: boolean;
  /** Motivo del rechazo, listo para mostrar al usuario. */
  error?: string;
  /** RUC normalizado (solo dígitos), si es válido. */
  ruc?: string;
  /** Tipo derivado del prefijo. */
  tipo?: TipoRuc;
}

export function validarRuc(entrada: string): RucValidado {
  const ruc = (entrada ?? '').replace(/\D/g, ''); // tolera espacios y guiones

  if (ruc.length !== 11) {
    return { ok: false, error: 'El RUC debe tener 11 dígitos' };
  }

  const prefijo = ruc.slice(0, 2);
  let tipo: TipoRuc;
  if (prefijo === '10' || prefijo === '15' || prefijo === '17') {
    tipo = 'persona_natural';
  } else if (prefijo === '20') {
    tipo = 'empresa';
  } else {
    return {
      ok: false,
      error: 'El RUC debe empezar en 10 (persona natural) o 20 (persona jurídica)',
    };
  }

  // Dígito verificador
  const suma = PESOS.reduce((acc, peso, i) => acc + Number(ruc[i]) * peso, 0);
  const resto = suma % 11;
  let esperado = 11 - resto;
  if (esperado === 10) esperado = 0;
  if (esperado === 11) esperado = 1;

  if (esperado !== Number(ruc[10])) {
    return { ok: false, error: 'El RUC no es válido (dígito verificador incorrecto)' };
  }

  return { ok: true, ruc, tipo };
}

/** Tipo de contribuyente sin validar el dígito (para leer datos ya guardados). */
export function tipoDeRuc(ruc: string | null | undefined): TipoRuc | null {
  if (!ruc || ruc.length !== 11) return null;
  const p = ruc.slice(0, 2);
  if (p === '10' || p === '15' || p === '17') return 'persona_natural';
  if (p === '20') return 'empresa';
  return null;
}
