// ══ Job nocturno: descubrimiento de fondos nuevos (PENDIENTES §16.2, fase 2) ═══
//
// Complementa a verificar-fondos (que solo revisa los que ya tenemos). Lo lanza el
// cron del VPS después de la verificación:
//
//   30 23 * * *  docker exec eywa_api node dist/jobs/descubrir-fondos.js
//
// Reglas (las mismas del verificador): se identifica, respeta robots.txt, solo
// lee APIs/páginas públicas y NUNCA publica nada solo. Cada hallazgo entra como
// CANDIDATO oculto (`candidate=true`) en la cola de revisión; un gestor lo aprueba
// o lo descarta. Lo descartado queda oculto y no se vuelve a proponer.
//
// Fuentes:
//  · Prociencia (CONCYTEC): API REST de WordPress, entradas de los últimos 180 días.
//
// `--simular` imprime lo que encontraría sin escribir en la BD.

import { db } from '@/lib/db';
import { USER_AGENT } from '@/lib/fondos-red';

const SIMULAR = process.argv.includes('--simular');
const DIAS_ATRAS = 180;

interface Hallazgo { nombre: string; url: string; fuente: string; fecha: string; resumen: string | null }

// Entidades HTML frecuentes en los títulos de WordPress (&#8211; &amp; …).
function decodificar(t: string): string {
  return t
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

// Lo que NO es una convocatoria para empresas. Medido sobre Prociencia: sus
// convocatorias reales se llaman "Proyectos de Desarrollo Tecnológico 2027-02"
// (sin la palabra "convocatoria"), mientras que las contrataciones de personal
// ("PE-PROCIENCIA-…-CS-INDV") sí la llevan. Por eso se excluye, no se exige.
const NO_ES = /^PE-PROCIENCIA-|expresi[oó]n de inter[eé]s|consultor[ií]a|resultado|ganador|comunicado|fe de erratas|cronograma|absoluci[oó]n|adjudica|bases integradas|lista de|seleccionad|aviso|pronunciamiento|contrataci[oó]n|convocatoria cas|pr[aá]cticas|personal|curso|taller|webinar|charla|evento/i;

async function prociencia(): Promise<Hallazgo[]> {
  const desde = new Date(Date.now() - DIAS_ATRAS * 86_400_000).toISOString();
  const vistos = new Map<string, Hallazgo>();
  for (const termino of ['convocatoria', 'concurso', 'financiamiento']) {
    const url = `https://prociencia.gob.pe/wp-json/wp/v2/posts?search=${termino}&per_page=50&after=${encodeURIComponent(desde)}&_fields=id,date,link,title,excerpt`;
    const r = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
    if (!r.ok) throw new Error(`Prociencia respondió ${r.status}`);
    const posts = (await r.json()) as { date: string; link: string; title: { rendered: string }; excerpt?: { rendered: string } }[];
    for (const p of posts) {
      const nombre = decodificar(p.title.rendered);
      if (NO_ES.test(nombre)) continue;
      const resumen = p.excerpt ? decodificar(p.excerpt.rendered).slice(0, 400) : null;
      vistos.set(p.link, { nombre: `Prociencia: ${nombre}`.slice(0, 250), url: p.link, fuente: 'prociencia', fecha: p.date, resumen });
    }
    await new Promise((res) => setTimeout(res, 2000)); // una petición cada 2 s por sitio
  }
  return [...vistos.values()];
}

async function main() {
  const run = SIMULAR ? null : await db.fundSyncRun.create({ data: { kind: 'descubrimiento' } });
  const fuentes: Record<string, () => Promise<Hallazgo[]>> = { prociencia };
  const hallados: Hallazgo[] = [];
  const porFuente: Record<string, number | string> = {};
  let errores = 0;

  for (const [nombre, fn] of Object.entries(fuentes)) {
    try {
      const h = await fn();
      porFuente[nombre] = h.length;
      hallados.push(...h);
    } catch (e) {
      errores++;
      porFuente[nombre] = `error: ${e instanceof Error ? e.message : e}`;
      console.error(`[descubrir-fondos] ${nombre}:`, e);
    }
  }

  // Solo lo que aún no está en el catálogo (ni como candidato ni descartado).
  const existentes = await db.fund.findMany({ select: { name: true, url: true } });
  const urls = new Set(existentes.map((f) => (f.url ?? '').replace(/\/+$/, '').toLowerCase()));
  const nombres = new Set(existentes.map((f) => f.name.trim().toLowerCase()));
  const nuevos = hallados.filter((h) => !urls.has(h.url.replace(/\/+$/, '').toLowerCase()) && !nombres.has(h.nombre.toLowerCase()));

  let creados = 0;
  for (const h of nuevos) {
    if (SIMULAR) { console.log(`[nuevo · ${h.fuente}] ${h.nombre} → ${h.url}`); continue; }
    try {
      await db.fund.create({
        data: {
          name: h.nombre, url: h.url, scope: 'nacional', instrumentType: 'Fondo/Grant',
          deadlineText: 'Por confirmar', eligibleProfile: h.resumen,
          candidate: true, discoveredFrom: h.fuente, discoveredAt: new Date(),
          needsReview: true,
          reviewReason: `Fondo nuevo detectado en ${h.fuente === 'prociencia' ? 'Prociencia' : h.fuente} (publicado el ${h.fecha.slice(0, 10)}). Revisa si una empresa puede postular, completa tipo, montos y cierre, y apruébalo.`,
        },
      });
      creados++;
    } catch (e) {
      errores++;
      console.error(`[descubrir-fondos] no se pudo crear "${h.nombre}":`, e instanceof Error ? e.message : e);
    }
  }

  const resumen = { fuentes: porFuente, encontrados: hallados.length, nuevos: nuevos.length, creados };
  console.log(`${new Date().toISOString()} · descubrimiento · ${JSON.stringify(resumen)} · errores ${errores}`);
  if (run) {
    await db.fundSyncRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), checked: hallados.length, updated: creados, flagged: creados, errors: errores, summary: resumen },
    });
  }
}

main()
  .catch((e) => { console.error('[descubrir-fondos] fallo general:', e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
