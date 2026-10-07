import { Hono } from 'hono';
import { z } from 'zod';
import { Prisma, type DiagnosticResult, type Organization } from '@prisma/client';
import { apiKeyMiddleware, getApiClient } from '@/middleware/api-key';
import { ApiError } from '@/lib/auth-helpers';
import { validarRuc } from '@/lib/ruc';
import { GENES_BANDS, GENES_SCALE, GENES_CATEGORIES, calcularGenes } from '@/lib/scoring';
import { DataroomRepository } from '@/repositories/dataroom-repository';
import { db } from '@/lib/db';

// ══ API externa v1 (PENDIENTES §15) ════════════════════════════════════════════
//
// Para sistemas de terceros, no para el navegador. Se autentica con `X-Api-Key`
// (una clave por cliente) en lugar de la sesión de usuario que usan los demás
// routers.
//
// Dos sentidos:
//   ENTRADA  · el cliente da de alta empresas y, si quiere, las respuestas del
//              diagnóstico GENES. EYWA calcula el puntaje; nunca lo acepta hecho.
//   SALIDA   · el cliente consulta lo que dio de alta (con su resultado GENES) y
//              el directorio de empresas que publicaron su perfil en EYWA.
//
// Lo que NO sale por aquí: empresas de otros usuarios que no publicaron su
// perfil, ni el puntaje GENES de ninguna empresa que el cliente no haya dado de
// alta. La mini-landing pública tampoco muestra ese puntaje; la API no puede
// enseñar más que la propia plataforma.
//
// Las respuestas van en español y snake_case, como las de MAVI que ya consume
// EYWA: quien integre las dos no tiene que cambiar de convención.

export const externalRouter = new Hono();
const dataroomRepo = new DataroomRepository(db);

externalRouter.use('*', apiKeyMiddleware);

const APP_URL = (process.env.PUBLIC_APP_URL || 'https://eywa-hazel.vercel.app').replace(/\/+$/, '');

// ── Utilidades ────────────────────────────────────────────────────────────────

type ErrorCampo = { campo: string; mensaje: string };

function errorValidacion(errores: ErrorCampo[]) {
  return { error: 'Datos inválidos', errores };
}

function erroresZod(e: z.ZodError): ErrorCampo[] {
  return e.errors.map((x) => ({ campo: x.path.join('.') || '(cuerpo)', mensaje: x.message }));
}

function paginacion(c: { req: { query: (k: string) => string | undefined } }) {
  const pagina    = Math.max(1, Number(c.req.query('pagina')) || 1);
  const porPagina = Math.min(100, Math.max(1, Number(c.req.query('por_pagina')) || 50));
  return { pagina, porPagina, skip: (pagina - 1) * porPagina };
}

// Rango [min, max] de cada banda sobre la escala 0-75, derivado de la fuente única.
function bandas() {
  const asc = [...GENES_BANDS].sort((a, b) => a.min - b.min);
  return asc.map((b, i) => ({
    nombre: b.label,
    desde:  b.min,
    hasta:  i < asc.length - 1 ? asc[i + 1].min - 1 : GENES_SCALE,
  }));
}

async function criteriosGenes() {
  const preguntas = await db.diagnosticQuestion.findMany({
    where:   { code: { not: null } },
    orderBy: { sortOrder: 'asc' },
    include: { options: { orderBy: { sortOrder: 'asc' } } },
  });
  return preguntas;
}

type Desglose = { code?: string | null; label: string; score: number; maxScore: number; category?: string };

function serDiagnostico(r: DiagnosticResult, conDesglose: boolean) {
  return {
    id:         r.id,
    puntaje:    r.score,
    maximo:     r.maxScore,
    porcentaje: r.percentage,
    banda:      r.level,
    fecha:      r.createdAt.toISOString(),
    ...(conDesglose
      ? {
          desglose: (r.breakdown as unknown as Desglose[]).map((b) => ({
            criterio:  b.code ?? null,
            titulo:    b.label,
            categoria: b.category ?? null,
            puntos:    b.score,
            maximo:    b.maxScore,
          })),
        }
      : {}),
  };
}

function serOrganizacion(o: Organization) {
  return {
    id_eywa:            o.id,
    referencia_externa: o.externalRef,
    razon_social:       o.name,
    nombre_comercial:   o.tradeName,
    ruc:                o.ruc,
    tipo:               o.type,
    pais:               o.country,
    sector:             o.sector,
    descripcion:        o.description,
    telefono:           o.phone,
    web:                o.website,
    creada:             o.createdAt.toISOString(),
    actualizada:        o.updatedAt.toISOString(),
  };
}

// ══ GET /criterios ═════════════════════════════════════════════════════════════
// Qué evalúa EYWA: los 14 criterios GENES con su peso y sus opciones. Es lo que
// el cliente necesita para saber qué datos enviar y cómo mapearlos.
externalRouter.get('/criterios', async (c) => {
  const preguntas = await criteriosGenes();
  return c.json({
    metodologia: 'GENES',
    escala:      { minimo: 0, maximo: GENES_SCALE },
    bandas:      bandas(),
    categorias:  Object.fromEntries(
      Object.entries(GENES_CATEGORIES).filter(([k]) => k !== 'general'),
    ),
    criterios: preguntas.map((q) => ({
      codigo:      q.code,
      categoria:   q.category,
      peso:        q.weight,
      titulo:      q.title,
      descripcion: q.description,
      opciones:    q.options.map((o) => ({ valor: o.value, puntos: o.score, etiqueta: o.label })),
    })),
  });
});

// ══ POST /organizaciones ═══════════════════════════════════════════════════════
// Alta o actualización (idempotente por `referencia_externa`) de una empresa, con
// diagnóstico GENES opcional. Reenviar la misma referencia ACTUALIZA, no duplica.

const texto = (max: number) => z.string().trim().max(max).nullish();

const altaSchema = z.object({
  referencia_externa: z.string().trim().min(1, 'Obligatoria').max(100),
  // La empresa autorizó compartir sus datos con EYWA. Igual que MAVI con nosotros:
  // no se presume, se declara en cada envío y se registra cuándo.
  consentimiento_datos: z.literal(true, {
    errorMap: () => ({ message: 'Debe ser true: confirma que la empresa autorizó compartir estos datos con EYWA' }),
  }),
  organizacion: z.object({
    razon_social:     z.string().trim().min(1, 'Obligatoria').max(200),
    nombre_comercial: texto(200),
    ruc:              texto(20),
    pais:             texto(100),
    sector:           texto(100),
    descripcion:      texto(2000),
    telefono:         texto(50),
    web:              texto(300),
  }),
  diagnostico: z.object({
    respuestas: z.array(z.object({
      criterio: z.string().trim().min(1),
      opcion:   z.string().trim().min(1),
    })).min(1, 'Debe incluir al menos una respuesta'),
  }).nullish(),
});

externalRouter.post('/organizaciones', async (c) => {
  const cliente = getApiClient(c);

  const cuerpo = await c.req.json().catch(() => null);
  if (cuerpo === null) return c.json({ error: 'El cuerpo debe ser JSON válido' }, 400);

  const parsed = altaSchema.safeParse(cuerpo);
  if (!parsed.success) return c.json(errorValidacion(erroresZod(parsed.error)), 422);
  const { referencia_externa: ref, organizacion: org, diagnostico } = parsed.data;

  // Todo se valida ANTES de escribir nada: un envío o entra entero o no entra.
  const errores: ErrorCampo[] = [];

  // RUC
  let ruc: string | null = null;
  let tipo = 'empresa';
  if (org.ruc) {
    const v = validarRuc(org.ruc);
    if (!v.ok) errores.push({ campo: 'organizacion.ruc', mensaje: v.error! });
    else {
      ruc  = v.ruc!;
      tipo = v.tipo === 'persona_natural' ? 'persona_natural' : 'empresa';
    }
  }

  // Diagnóstico: se exigen los 14 criterios. Uno sin responder contaría 0 y
  // hundiría el puntaje sin que nadie lo haya decidido; mejor rechazarlo.
  const criterios = diagnostico ? await criteriosGenes() : [];
  const opcionPorCodigo = new Map<string, string>();
  if (diagnostico) {
    const porCodigo = new Map(criterios.map((q) => [q.code!, q]));
    diagnostico.respuestas.forEach((r, i) => {
      const q = porCodigo.get(r.criterio);
      if (!q) {
        errores.push({ campo: `diagnostico.respuestas.${i}.criterio`, mensaje: `Criterio desconocido: "${r.criterio}". Ver GET /criterios` });
      } else if (opcionPorCodigo.has(r.criterio)) {
        errores.push({ campo: `diagnostico.respuestas.${i}.criterio`, mensaje: `Criterio repetido: "${r.criterio}"` });
      } else if (!q.options.some((o) => o.value === r.opcion)) {
        errores.push({
          campo:   `diagnostico.respuestas.${i}.opcion`,
          mensaje: `Opción inválida para "${r.criterio}". Válidas: ${q.options.map((o) => o.value).join(', ')}`,
        });
      } else {
        opcionPorCodigo.set(r.criterio, r.opcion);
      }
    });
    const faltan = criterios.filter((q) => !diagnostico.respuestas.some((r) => r.criterio === q.code));
    if (faltan.length) {
      errores.push({
        campo:   'diagnostico.respuestas',
        mensaje: `Faltan ${faltan.length} criterio(s): ${faltan.map((q) => q.code).join(', ')}`,
      });
    }
  }

  if (errores.length) return c.json(errorValidacion(errores), 422);

  const existente = await db.organization.findUnique({
    where: { apiClientId_externalRef: { apiClientId: cliente.id, externalRef: ref } },
  });

  // El RUC es único en toda la plataforma: si ya lo tiene OTRA organización, no
  // se pisa ni se duplica. Puede ser la empresa registrada por su propio dueño.
  if (ruc) {
    const conEseRuc = await db.organization.findUnique({ where: { ruc }, select: { id: true } });
    if (conEseRuc && conEseRuc.id !== existente?.id) {
      throw new ApiError(409, 'Ese RUC ya está registrado en EYWA por otra cuenta');
    }
  }

  const datos = {
    name:        org.razon_social,
    tradeName:   org.nombre_comercial ?? null,
    ruc,
    type:        tipo,
    country:     org.pais ?? null,
    sector:      org.sector ?? null,
    description: org.descripcion ?? null,
    phone:       org.telefono ?? null,
    website:     org.web ?? null,
    apiConsentAt: new Date(),
  };

  let guardada: Organization;
  let resultado: DiagnosticResult | null = null;
  try {
    [guardada, resultado] = await db.$transaction(async (tx) => {
      const o = existente
        ? await tx.organization.update({ where: { id: existente.id }, data: datos })
        : await tx.organization.create({
            data: { ...datos, userId: cliente.profileId, apiClientId: cliente.id, externalRef: ref },
          });

      if (!diagnostico) return [o, null] as const;

      const g = calcularGenes(
        criterios.map((q) => ({ code: q.code, title: q.title, category: q.category, weight: q.weight, options: q.options })),
        opcionPorCodigo,
      );
      const r = await tx.diagnosticResult.create({
        data: {
          userId:         cliente.profileId,
          organizationId: o.id,
          score:          g.score,
          maxScore:       g.maxScore,
          percentage:     g.percentage,
          level:          g.level,
          breakdown:      g.breakdown as unknown as Prisma.InputJsonValue,
        },
      });
      return [o, r] as const;
    });
  } catch (e) {
    // Dos envíos simultáneos con la misma referencia o el mismo RUC: gana uno.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new ApiError(409, 'Conflicto con un envío simultáneo de la misma empresa. Reintenta.');
    }
    throw e;
  }

  return c.json({
    creada:       !existente,
    organizacion: serOrganizacion(guardada),
    diagnostico:  resultado ? serDiagnostico(resultado, true) : null,
  }, existente ? 200 : 201);
});

// ══ GET /organizaciones ════════════════════════════════════════════════════════
// Las que ESTE cliente dio de alta, con su último resultado GENES.
externalRouter.get('/organizaciones', async (c) => {
  const cliente = getApiClient(c);
  const { pagina, porPagina, skip } = paginacion(c);

  const [total, orgs] = await Promise.all([
    db.organization.count({ where: { apiClientId: cliente.id } }),
    db.organization.findMany({
      where:   { apiClientId: cliente.id },
      orderBy: { createdAt: 'desc' },
      skip,
      take:    porPagina,
      include: { diagnosticResults: { orderBy: { createdAt: 'desc' }, take: 1 } },
    }),
  ]);

  return c.json({
    total,
    pagina,
    por_pagina: porPagina,
    organizaciones: orgs.map((o) => ({
      ...serOrganizacion(o),
      diagnostico: o.diagnosticResults[0] ? serDiagnostico(o.diagnosticResults[0], false) : null,
    })),
  });
});

// ══ GET /organizaciones/:referencia ════════════════════════════════════════════
// Detalle: datos, último diagnóstico con desglose por criterio, e historial.
externalRouter.get('/organizaciones/:referencia', async (c) => {
  const cliente = getApiClient(c);
  const o = await db.organization.findUnique({
    where:   { apiClientId_externalRef: { apiClientId: cliente.id, externalRef: c.req.param('referencia') } },
    include: { diagnosticResults: { orderBy: { createdAt: 'desc' }, take: 50 } },
  });
  if (!o) throw new ApiError(404, 'No hay ninguna organización tuya con esa referencia_externa');

  const [ultimo, ...anteriores] = o.diagnosticResults;
  return c.json({
    organizacion: serOrganizacion(o),
    diagnostico:  ultimo ? serDiagnostico(ultimo, true) : null,
    historial:    [ultimo, ...anteriores].filter(Boolean).map((r) => serDiagnostico(r, false)),
  });
});

// ══ GET /empresas ══════════════════════════════════════════════════════════════
// Directorio de las empresas que PUBLICARON su perfil en EYWA (mini-landing
// activa). Solo lo que esa página ya muestra en público.
externalRouter.get('/empresas', async (c) => {
  const { pagina, porPagina, skip } = paginacion(c);
  const q      = c.req.query('q')?.trim();
  const sector = c.req.query('sector')?.trim();
  const pais   = c.req.query('pais')?.trim();

  const where: Prisma.OrganizationWhereInput = {
    publicEnabled: true,
    publicSlug:    { not: null },
    ...(q      ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { tradeName: { contains: q, mode: 'insensitive' } }] } : {}),
    ...(sector ? { sector:  { equals: sector, mode: 'insensitive' } } : {}),
    ...(pais   ? { country: { equals: pais,   mode: 'insensitive' } } : {}),
  };

  const [total, orgs] = await Promise.all([
    db.organization.count({ where }),
    db.organization.findMany({ where, orderBy: { name: 'asc' }, skip, take: porPagina }),
  ]);

  return c.json({
    total,
    pagina,
    por_pagina: porPagina,
    empresas: orgs.map((o) => serEmpresa(o)),
  });
});

// ══ GET /empresas/:slug ════════════════════════════════════════════════════════
externalRouter.get('/empresas/:slug', async (c) => {
  const o = await db.organization.findUnique({ where: { publicSlug: c.req.param('slug') } });
  if (!o || !o.publicEnabled) throw new ApiError(404, 'Empresa no encontrada o sin perfil público');

  const [completitud, docs] = await Promise.all([
    dataroomRepo.completenessOf(o.id, o.userId),
    dataroomRepo.getPublicDocumentsOf(o.id),
  ]);

  return c.json({
    empresa: serEmpresa(o),
    // Sello de confianza del dataroom: cuánto está documentado, sin revelar QUÉ
    // falta (igual que en la mini-landing).
    completitud_dataroom: {
      items_completos: completitud.completed_items,
      items_totales:   completitud.total_items,
      porcentaje:      completitud.percentage,
    },
    // Solo los documentos que la empresa marcó uno a uno como públicos.
    documentos_publicos: docs.map((d) => ({
      nombre:  d.fileName,
      tipo:    d.mime,
      tamano:  d.size,
      carpeta: d.item.folder.name,
      item:    d.item.name,
      fecha:   d.createdAt.toISOString(),
    })),
  });
});

function serEmpresa(o: Organization) {
  return {
    slug:             o.publicSlug,
    razon_social:     o.name,
    nombre_comercial: o.tradeName,
    tipo:             o.type,
    pais:             o.country,
    sector:           o.sector,
    descripcion:      o.description,
    web:              o.website,
    enlaces:          o.externalLinks,
    url_perfil:       `${APP_URL}/empresa/${o.publicSlug}`,
  };
}
