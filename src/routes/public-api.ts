import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { Actor, ActorCategory } from '@prisma/client';
import { ApiError } from '@/lib/auth-helpers';
import { ActorRepository } from '@/repositories/actor-repository';
import { AcademyRepository } from '@/repositories/academy-repository';
import { DataroomRepository } from '@/repositories/dataroom-repository';
import { db } from '@/lib/db';

// ══ API pública v1 — capa SIN clave (PENDIENTES §9) ════════════════════════════
//
// Solo lectura y solo lo que ya es público en la plataforma:
//   · directorio de actores SIN datos de contacto (la PII nunca sale por aquí);
//   · verificación de certificados (ya era pública);
//   · perfil público de una empresa: la fuente del sello "ESG verificado por EYWA"
//     que la empresa pega en su propia web.
//
// Lo que exige identificarse (dar de alta empresas, puntajes GENES) va por la capa
// con clave: /api/external/v1.
//
// El navegador de un tercero la llama a través de Vercel, que añade la cabecera
// CORS y cachea las respuestas (Cache-Control). Sin esa caché, una web con tráfico
// que lleve el sello mandaría aquí una petición por cada visita.

export const publicApiRouter = new Hono();
const actorRepo    = new ActorRepository(db);
const academyRepo  = new AcademyRepository(db);
const dataroomRepo = new DataroomRepository(db);

const APP_URL = (process.env.PUBLIC_APP_URL || 'https://eywa-hazel.vercel.app').replace(/\/+$/, '');

// ── Límite por IP ─────────────────────────────────────────────────────────────
// La IP llega en X-Forwarded-For desde el proxy de Vercel. Si alguien llama al
// backend directo puede falsearla, pero lo único que gana es saltarse el límite
// sobre datos que ya son públicos (ver PENDIENTES: "Backend en HTTP plano").
const LIMITE_POR_HORA = 300;
const VENTANA_MS = 60 * 60 * 1000;
const porIp = new Map<string, number[]>();

const limitePorIp = createMiddleware(async (c, next) => {
  const ip = (c.req.header('x-forwarded-for') ?? '').split(',')[0].trim() || 'desconocida';
  const ahora = Date.now();
  const recientes = (porIp.get(ip) ?? []).filter((t) => ahora - t < VENTANA_MS);
  if (recientes.length >= LIMITE_POR_HORA) {
    porIp.set(ip, recientes);
    const espera = Math.ceil((recientes[0] + VENTANA_MS - ahora) / 1000);
    c.header('Retry-After', String(espera));
    return c.json({ error: `Límite de ${LIMITE_POR_HORA} peticiones por hora alcanzado`, reintentar_en_segundos: espera }, 429);
  }
  recientes.push(ahora);
  porIp.set(ip, recientes);
  // Poda ocasional: sin ella el mapa crecería con cada IP que pasa una vez.
  if (porIp.size > 5000) for (const [k, v] of porIp) if (!v.some((t) => ahora - t < VENTANA_MS)) porIp.delete(k);
  await next();
});

publicApiRouter.use('*', limitePorIp);

// Respuestas cacheables 5 minutos en el CDN de Vercel.
function cacheable(c: { header: (k: string, v: string) => void }) {
  c.header('Cache-Control', 'public, max-age=300, s-maxage=300, stale-while-revalidate=600');
}

// ══ Actores (sin PII) ══════════════════════════════════════════════════════════

const CATEGORIAS = ['proveedores_capital', 'intermediarios', 'bancos', 'gobierno_multilaterales', 'empresa_social'] as const;

// Lista blanca de campos: si mañana el modelo gana otro dato sensible, no se
// filtra solo por existir. contactName / contactEmail NO están, a propósito.
function serActor(a: Actor) {
  return {
    id:                a.id,
    nombre:            a.name,
    pais:              a.country,
    categoria:         a.category,
    subcategoria:      a.subcategory,
    descripcion:       a.description,
    servicios:         a.services,
    procedencia:       a.procedencia,
    ambito_geografico: a.geoScope,
    instrumentos:      a.instruments,
    sectores:          a.sectors,
    activos_impacto:   a.aum,
    monto_inversion:   a.investmentAmount,
    web:               a.website,
  };
}

publicApiRouter.get('/actores', async (c) => {
  const q = c.req.query();
  const porPagina = Math.min(100, Math.max(1, Number(q.por_pagina) || 50));
  const pagina    = Math.max(1, Number(q.pagina) || 1);
  const categoria = CATEGORIAS.includes(q.categoria as ActorCategory) ? (q.categoria as ActorCategory) : undefined;

  const { items, total } = await actorRepo.list({
    country:    q.pais?.toUpperCase() || undefined,
    category:   categoria,
    sector:     q.sector || undefined,
    instrument: q.instrumento || undefined,
    q:          q.q || undefined,
    take:       porPagina,
    skip:       (pagina - 1) * porPagina,
  });

  cacheable(c);
  return c.json({ total, pagina, por_pagina: porPagina, actores: items.map(serActor) });
});

publicApiRouter.get('/actores/facetas', async (c) => {
  const f = await actorRepo.facets();
  cacheable(c);
  return c.json({ paises: f.countries, categorias: f.categories, sectores: f.sectors, instrumentos: f.instruments });
});

publicApiRouter.get('/actores/:id', async (c) => {
  const id = c.req.param('id');
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(404, 'Actor no encontrado');
  const a = await actorRepo.getById(id);
  if (!a) throw new ApiError(404, 'Actor no encontrado');
  cacheable(c);
  return c.json({ actor: serActor(a) });
});

// ══ Certificados ═══════════════════════════════════════════════════════════════

publicApiRouter.get('/certificados/:codigo', async (c) => {
  const cert = await academyRepo.getCertificateByCode(c.req.param('codigo').toUpperCase());
  if (!cert) return c.json({ valido: false }, 404);
  cacheable(c);
  return c.json({
    valido:       true,
    codigo:       cert.code,
    titular:      cert.user.fullName ?? cert.user.email,
    curso:        cert.course.title,
    instructor:   cert.course.instructor,
    porcentaje:   cert.percentage,
    emitido:      cert.issuedAt.toISOString(),
    url_verificar: `${APP_URL}/verificar/${cert.code}`,
  });
});

// ══ Empresa — fuente del sello ═════════════════════════════════════════════════
// Lo mismo que la mini-landing /empresa/[slug] ya muestra, en JSON. No incluye el
// puntaje GENES: la mini-landing tampoco lo muestra, y publicarlo requeriría una
// casilla de consentimiento del dueño que todavía no existe (§9).

publicApiRouter.get('/empresas/:slug', async (c) => {
  const o = await db.organization.findUnique({ where: { publicSlug: c.req.param('slug') } });
  if (!o || !o.publicEnabled) throw new ApiError(404, 'Empresa no encontrada o sin perfil público');

  const completitud = await dataroomRepo.completenessOf(o.id, o.userId);

  cacheable(c);
  return c.json({
    empresa: {
      slug:             o.publicSlug,
      razon_social:     o.name,
      nombre_comercial: o.tradeName,
      pais:             o.country,
      sector:           o.sector,
      url_perfil:       `${APP_URL}/empresa/${o.publicSlug}`,
      logo_url:         o.imageUrl ? `${APP_URL}/api/proxy/media/organization/${o.id}/logo` : null,
    },
    completitud_dataroom: {
      items_completos: completitud.completed_items,
      items_totales:   completitud.total_items,
      porcentaje:      completitud.percentage,
    },
    // Qué certifica el sello y qué no: lo documentado, no la calidad de lo documentado.
    aviso: 'El porcentaje indica cuánta documentación de la empresa está cargada en su dataroom de EYWA. ' +
           'No es una auditoría ni una certificación de su contenido.',
  });
});
