// ══ Visitas a las páginas de los fondos — reglas de buen rastreo (§16) ═════════
//
//  · Se identifica (User-Agent con URL de contacto).
//  · Respeta robots.txt del sitio.
//  · Una petición cada 2 s por dominio; varios dominios en paralelo.
//  · Solo páginas públicas, solo GET, nunca formularios ni inicios de sesión.
//  · No fuerza bloqueos: un 403 se anota y se sigue.
//  · LinkedIn no se visita (sus términos prohíben el scraping).

import { textoDeHtml } from '@/lib/fondos-verificacion';

const APP_URL = (process.env.PUBLIC_APP_URL || 'https://eywa.encsust4in4ble.earth').replace(/\/+$/, '');
export const USER_AGENT = `EYWA-FondosBot/1.0 (+${APP_URL}; verificacion de convocatorias publicas)`;
const PAUSA_POR_DOMINIO_MS = 2000;
const TIMEOUT_MS = 20000;
const MAX_BYTES = 1_500_000;

export const DOMINIOS_EXCLUIDOS = /(^|\.)(linkedin\.com|lnkd\.in)$/i;

// ── robots.txt (versión mínima: grupos * y nuestro bot, Disallow/Allow por prefijo) ──
const robotsCache = new Map<string, { disallow: string[]; allow: string[] }>();

async function reglasRobots(origen: string) {
  if (robotsCache.has(origen)) return robotsCache.get(origen)!;
  const reglas = { disallow: [] as string[], allow: [] as string[] };
  try {
    const r = await fetch(`${origen}/robots.txt`, {
      headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'follow',
    });
    if (r.ok) {
      let aplica = false;
      for (const cruda of (await r.text()).split(/\r?\n/)) {
        const linea = cruda.replace(/#.*/, '').trim();
        const [k, ...v] = linea.split(':');
        const valor = v.join(':').trim();
        if (/^user-agent$/i.test(k)) aplica = valor === '*' || /eywa/i.test(valor);
        else if (aplica && /^disallow$/i.test(k) && valor) reglas.disallow.push(valor);
        else if (aplica && /^allow$/i.test(k) && valor) reglas.allow.push(valor);
      }
    }
  } catch { /* sin robots.txt accesible = sin restricciones declaradas */ }
  robotsCache.set(origen, reglas);
  return reglas;
}

function coincide(ruta: string, patron: string) {
  // Soporta '*' y '$' como hacen los buscadores.
  const re = new RegExp('^' + patron.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*'));
  return re.test(ruta);
}

export async function permitidoPorRobots(url: URL) {
  const r = await reglasRobots(url.origin);
  const ruta = url.pathname + url.search;
  const largo = (xs: string[]) => Math.max(-1, ...xs.filter((p) => coincide(ruta, p)).map((p) => p.length));
  return largo(r.allow) >= largo(r.disallow); // la regla más específica gana
}

// ── Cola por dominio ──
const ultimoPorDominio = new Map<string, number>();

async function turnoDe(dominio: string) {
  // El turno se RESERVA antes de esperar: si dos tareas piden el mismo dominio a la
  // vez, la segunda queda 2 s detrás de la primera en vez de salir junto con ella.
  const turno = Math.max(Date.now(), (ultimoPorDominio.get(dominio) ?? 0) + PAUSA_POR_DOMINIO_MS);
  ultimoPorDominio.set(dominio, turno);
  const espera = turno - Date.now();
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
}

export interface Visita {
  http: number | null;     // null = fallo de red o no visitado
  urlFinal: string | null;
  texto: string | null;
  omitida?: 'linkedin' | 'robots' | 'url_invalida';
}

export async function visitar(urlCruda: string): Promise<Visita> {
  let url: URL;
  try { url = new URL(urlCruda); } catch { return { http: null, urlFinal: null, texto: null, omitida: 'url_invalida' }; }
  if (DOMINIOS_EXCLUIDOS.test(url.hostname)) return { http: null, urlFinal: url.href, texto: null, omitida: 'linkedin' };
  if (!(await permitidoPorRobots(url))) return { http: null, urlFinal: url.href, texto: null, omitida: 'robots' };

  await turnoDe(url.hostname);
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html,*/*;q=0.5', 'Accept-Language': 'es,en;q=0.8' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'follow',
    });
    const tipo = r.headers.get('content-type') ?? '';
    let texto: string | null = null;
    if (r.ok && /html|text/i.test(tipo)) {
      const buf = Buffer.from(await r.arrayBuffer()).subarray(0, MAX_BYTES);
      texto = textoDeHtml(buf.toString('utf8'));
    }
    return { http: r.status, urlFinal: r.url, texto };
  } catch {
    return { http: null, urlFinal: url.href, texto: null };
  }
}

/** Ejecuta `fn` sobre los elementos con N tareas en paralelo (la cola por dominio ya espacía). */
export async function enParalelo<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}
