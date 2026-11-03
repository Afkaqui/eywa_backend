import { Hono } from 'hono';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { authMiddleware } from '@/middleware/auth';
import { getRequestUser, ApiError } from '@/lib/auth-helpers';
import { db } from '@/lib/db';

// ══ Vertical AGRO (agro.encsust4in4ble.earth) ═══════════════════════════════════
//
// Proyecto ProInnóvate aparte de EYWA; comparte backend, base y cuentas.
// Flujo: productor → lotes (geolocalizados, con declaración de no deforestación)
// → cosechas → entregas en el centro de acopio digital (cada saco con código) →
// venta con precio de referencia y % pactado → monto que recibe el productor.
// El pasaporte público de un lote o saco se abre con su código (QR).
//
// Honestidad: "sin deforestación" es una DECLARACIÓN con fecha, no una verificación
// satelital. El pasaporte lo dice así.

export const agroRouter = new Hono();

const codigo = (pref: string) => `${pref}-${randomBytes(4).toString('hex').toUpperCase()}`;

// ── Pasaporte público (sin sesión) ───────────────────────────────────────────
// Sin DNI, teléfono ni nombre completo del productor; coordenadas a ~100 m.
const iniciales = (n: string) => n.split(/\s+/).filter(Boolean).map((p) => p[0].toUpperCase() + '.').join(' ');
const redondear = (x: number | null) => (x == null ? null : Math.round(x * 1000) / 1000);

function serLotePublico(l: {
  codigo: string; nombre: string; cultivo: string; variedad: string | null; hectareas: number | null;
  departamento: string | null; provincia: string | null; distrito: string | null;
  latitud: number | null; longitud: number | null; sinDeforestacionDeclarada: boolean; declaradaAt: Date | null;
  productor: { nombre: string; comunidad: string | null };
}) {
  return {
    codigo: l.codigo, nombre: l.nombre, cultivo: l.cultivo, variedad: l.variedad, hectareas: l.hectareas,
    ubicacion: [l.distrito, l.provincia, l.departamento].filter(Boolean).join(', ') || null,
    coordenadas: l.latitud != null && l.longitud != null ? { lat: redondear(l.latitud), lng: redondear(l.longitud) } : null,
    productor: { iniciales: iniciales(l.productor.nombre), comunidad: l.productor.comunidad },
    sin_deforestacion: l.sinDeforestacionDeclarada
      ? { declarada: true, fecha: l.declaradaAt?.toISOString() ?? null, tipo: 'declaracion_jurada', nota: 'Declaración del productor (fecha de corte EUDR: 31-12-2020). No es una verificación satelital.' }
      : { declarada: false },
  };
}

agroRouter.get('/publico/lote/:codigo', async (c) => {
  const l = await db.agroLote.findUnique({
    where: { codigo: c.req.param('codigo').toUpperCase() },
    include: { productor: true, cosechas: { orderBy: { fecha: 'desc' }, take: 12 }, entregas: { orderBy: { fechaEntrega: 'desc' }, take: 20 } },
  });
  if (!l) throw new ApiError(404, 'Pasaporte no encontrado');
  return c.json({
    lote: serLotePublico(l),
    cosechas: l.cosechas.map((x) => ({ fecha: x.fecha.toISOString().slice(0, 10), kilos: x.kilos })),
    entregas: l.entregas.map((e) => ({ codigo: e.codigo, fecha: e.fechaEntrega.toISOString().slice(0, 10), kilos: e.kilos, vendida: !!e.fechaVenta, pagada: !!e.pagadoAt })),
  });
});

agroRouter.get('/publico/saco/:codigo', async (c) => {
  const e = await db.agroEntrega.findUnique({
    where: { codigo: c.req.param('codigo').toUpperCase() },
    include: { lote: { include: { productor: true } } },
  });
  if (!e) throw new ApiError(404, 'Pasaporte no encontrado');
  return c.json({
    saco: {
      codigo: e.codigo, fecha_entrega: e.fechaEntrega.toISOString().slice(0, 10), kilos: e.kilos, calidad: e.calidad,
      fecha_venta: e.fechaVenta?.toISOString().slice(0, 10) ?? null,
      precio_referencia: e.precioReferencia, porcentaje_pactado: e.porcentajePactado,
      // Comercio justo demostrable: lo pactado, lo vendido y lo que recibió el productor.
      monto_productor: e.montoProductor, pagado: !!e.pagadoAt,
    },
    lote: serLotePublico(e.lote),
  });
});


// ══ De aquí en adelante, con sesión ═════════════════════════════════════════════
agroRouter.use('*', authMiddleware);

// ── Organizaciones y roles ───────────────────────────────────────────────────
// Todo dato agro pertenece a una ORGANIZACIÓN (cooperativa, asociación,
// agroindustria). La organización activa llega en la cabecera X-Agro-Org.
//   admin   → todo, incluidas ventas/pagos (dinero) y el equipo
//   tecnico → registra productores, parcelas, cosechas y entregas
//   lector  → solo consulta
type Rol = 'admin' | 'tecnico' | 'lector';
const ROLES: Rol[] = ['admin', 'tecnico', 'lector'];
const ESCRIBEN: Rol[] = ['admin', 'tecnico'];

async function contexto(c: Parameters<typeof getRequestUser>[0], permitidos: Rol[] = ROLES) {
  const u = getRequestUser(c);
  const orgId = c.req.header('X-Agro-Org');
  if (!orgId || !/^[0-9a-f-]{36}$/i.test(orgId)) throw new ApiError(400, 'Elige una organización');
  const m = await db.agroMiembro.findUnique({ where: { organizacionId_profileId: { organizacionId: orgId, profileId: u.sub } } });
  if (!m) throw new ApiError(404, 'Organización no encontrada');
  if (!permitidos.includes(m.rol as Rol)) {
    throw new ApiError(403, m.rol === 'lector' ? 'Tu rol es de solo lectura' : 'Esta acción es solo para administradores de la organización');
  }
  return { userId: u.sub, orgId, rol: m.rol as Rol };
}

async function productorDeOrg(id: string, orgId: string) {
  const p = await db.agroProductor.findFirst({ where: { id, organizacionId: orgId } });
  if (!p) throw new ApiError(404, 'Productor no encontrado');
  return p;
}
async function loteDeOrg(id: string, orgId: string) {
  const l = await db.agroLote.findFirst({ where: { id, productor: { organizacionId: orgId } } });
  if (!l) throw new ApiError(404, 'Lote no encontrado');
  return l;
}
function validar<T>(s: z.ZodType<T, z.ZodTypeDef, unknown>, body: unknown): T {
  const r = s.safeParse(body);
  if (!r.success) throw new ApiError(400, r.error.errors[0]?.message ?? 'Datos inválidos');
  return r.data;
}
const txt = z.string().trim().max(200).nullish();

const orgSchema = z.object({
  nombre: z.string().trim().min(2, 'Nombre obligatorio').max(200),
  ruc:    z.string().trim().nullish().refine((v) => !v || /^\d{11}$/.test(v), 'El RUC debe tener 11 dígitos'),
  tipo:   z.enum(['cooperativa', 'asociacion', 'agroindustria', 'comprador', 'otro']).default('cooperativa'),
  cadena: z.string().trim().min(2).max(60).default('cacao'),
  region: txt,
});

agroRouter.get('/organizaciones', async (c) => {
  const u = getRequestUser(c);
  const ms = await db.agroMiembro.findMany({
    where: { profileId: u.sub }, orderBy: { createdAt: 'asc' },
    include: { organizacion: { include: { _count: { select: { productores: true, miembros: true } } } } },
  });
  return c.json({ organizaciones: ms.map((m) => ({
    id: m.organizacion.id, nombre: m.organizacion.nombre, ruc: m.organizacion.ruc, tipo: m.organizacion.tipo,
    cadena: m.organizacion.cadena, region: m.organizacion.region, rol: m.rol,
    productores: m.organizacion._count.productores, miembros: m.organizacion._count.miembros,
  })) });
});

agroRouter.post('/organizaciones', async (c) => {
  const u = getRequestUser(c);
  const d = validar(orgSchema, await c.req.json().catch(() => ({})));
  const o = await db.agroOrganizacion.create({ data: {
    nombre: d.nombre, ruc: d.ruc || null, tipo: d.tipo, cadena: d.cadena, region: d.region ?? null, createdBy: u.sub,
    miembros: { create: { profileId: u.sub, rol: 'admin' } }, // quien la crea, la administra
  } });
  return c.json({ organizacion: { id: o.id } }, 201);
});

// ── Equipo (miembros) ──
agroRouter.get('/miembros', async (c) => {
  const { orgId } = await contexto(c);
  const ms = await db.agroMiembro.findMany({ where: { organizacionId: orgId }, orderBy: { createdAt: 'asc' },
    include: { profile: { select: { email: true, fullName: true } } } });
  return c.json({ miembros: ms.map((m) => ({ id: m.id, rol: m.rol, email: m.profile.email, nombre: m.profile.fullName })) });
});

const miembroSchema = z.object({
  email: z.string().trim().toLowerCase().email('Correo inválido'),
  rol:   z.enum(['admin', 'tecnico', 'lector']).default('tecnico'),
});
agroRouter.post('/miembros', async (c) => {
  const { orgId } = await contexto(c, ['admin']);
  const d = validar(miembroSchema, await c.req.json().catch(() => ({})));
  // La persona necesita una cuenta de EYWA: es la misma para EYWA y agro.
  const p = await db.profile.findFirst({ where: { email: { equals: d.email, mode: 'insensitive' } }, select: { id: true } });
  if (!p) throw new ApiError(404, 'No hay una cuenta de EYWA con ese correo. Pídele que se registre en eywa.encsust4in4ble.earth y vuelve a invitarla.');
  const ya = await db.agroMiembro.findUnique({ where: { organizacionId_profileId: { organizacionId: orgId, profileId: p.id } } });
  if (ya) throw new ApiError(409, 'Esa persona ya es parte del equipo');
  await db.agroMiembro.create({ data: { organizacionId: orgId, profileId: p.id, rol: d.rol } });
  return c.json({ success: true }, 201);
});

async function quedaOtroAdmin(orgId: string, excluirId: string) {
  return (await db.agroMiembro.count({ where: { organizacionId: orgId, rol: 'admin', id: { not: excluirId } } })) > 0;
}
agroRouter.patch('/miembros/:id', async (c) => {
  const { orgId } = await contexto(c, ['admin']);
  const { rol } = validar(z.object({ rol: z.enum(['admin', 'tecnico', 'lector']) }), await c.req.json().catch(() => ({})));
  const m = await db.agroMiembro.findFirst({ where: { id: c.req.param('id'), organizacionId: orgId } });
  if (!m) throw new ApiError(404, 'Miembro no encontrado');
  if (m.rol === 'admin' && rol !== 'admin' && !(await quedaOtroAdmin(orgId, m.id))) {
    throw new ApiError(409, 'La organización necesita al menos un administrador');
  }
  await db.agroMiembro.update({ where: { id: m.id }, data: { rol } });
  return c.json({ success: true });
});
agroRouter.delete('/miembros/:id', async (c) => {
  const { orgId } = await contexto(c, ['admin']);
  const m = await db.agroMiembro.findFirst({ where: { id: c.req.param('id'), organizacionId: orgId } });
  if (!m) throw new ApiError(404, 'Miembro no encontrado');
  if (m.rol === 'admin' && !(await quedaOtroAdmin(orgId, m.id))) throw new ApiError(409, 'La organización necesita al menos un administrador');
  await db.agroMiembro.delete({ where: { id: m.id } });
  return c.json({ success: true });
});

// ── Resumen (metas del piloto: 3 organizaciones, 100 productores, 300 lotes) ──
agroRouter.get('/resumen', async (c) => {
  const { orgId, rol } = await contexto(c);
  const dentro = { productor: { organizacionId: orgId } };
  const [productores, lotes, entregas] = await Promise.all([
    db.agroProductor.count({ where: { organizacionId: orgId } }),
    db.agroLote.findMany({ where: dentro, select: { hectareas: true, sinDeforestacionDeclarada: true, latitud: true } }),
    db.agroEntrega.findMany({ where: { lote: dentro }, select: { kilos: true, montoProductor: true, pagadoAt: true } }),
  ]);
  return c.json({
    rol, productores, lotes: lotes.length,
    hectareas: lotes.reduce((s, l) => s + (l.hectareas ?? 0), 0),
    lotes_georreferenciados: lotes.filter((l) => l.latitud != null).length,
    lotes_con_declaracion: lotes.filter((l) => l.sinDeforestacionDeclarada).length,
    kilos_acopiados: entregas.reduce((s, e) => s + e.kilos, 0),
    pagado_productores: entregas.filter((e) => e.pagadoAt).reduce((s, e) => s + (e.montoProductor ?? 0), 0),
  });
});

// ── Productores ──
const productorSchema = z.object({ nombre: z.string().trim().min(2, 'Nombre obligatorio').max(150), dni: txt, comunidad: txt, telefono: txt });

agroRouter.get('/productores', async (c) => {
  const { orgId } = await contexto(c);
  const ps = await db.agroProductor.findMany({ where: { organizacionId: orgId }, orderBy: { nombre: 'asc' }, include: { _count: { select: { lotes: true } } } });
  return c.json({ productores: ps.map((p) => ({ id: p.id, nombre: p.nombre, dni: p.dni, comunidad: p.comunidad, telefono: p.telefono, lotes: p._count.lotes })) });
});
agroRouter.post('/productores', async (c) => {
  const { orgId, userId } = await contexto(c, ESCRIBEN);
  const d = validar(productorSchema, await c.req.json().catch(() => ({})));
  if (d.dni && await db.agroProductor.findFirst({ where: { organizacionId: orgId, dni: d.dni } })) {
    throw new ApiError(409, 'Ya hay un productor con ese DNI en la organización');
  }
  const p = await db.agroProductor.create({ data: { organizacionId: orgId, ownerId: userId, nombre: d.nombre, dni: d.dni || null, comunidad: d.comunidad ?? null, telefono: d.telefono ?? null } });
  return c.json({ productor: { id: p.id } }, 201);
});
agroRouter.delete('/productores/:id', async (c) => {
  const { orgId } = await contexto(c, ['admin']);
  await productorDeOrg(c.req.param('id'), orgId);
  await db.agroProductor.delete({ where: { id: c.req.param('id') } });
  return c.json({ success: true });
});

// ── Lotes (parcelas) ──
const loteSchema = z.object({
  productor_id: z.string().uuid(),
  nombre: z.string().trim().min(1, 'Nombre del lote obligatorio').max(150),
  cultivo: z.string().trim().max(60).nullish(),
  variedad: txt,
  hectareas: z.number().positive().max(100000).nullish(),
  departamento: txt, provincia: txt, distrito: txt,
  latitud: z.number().min(-90).max(90).nullish(),
  longitud: z.number().min(-180).max(180).nullish(),
  sin_deforestacion: z.boolean().optional(),
});

interface DatosLote {
  nombre: string; cultivo?: string | null; variedad?: string | null; hectareas?: number | null;
  departamento?: string | null; provincia?: string | null; distrito?: string | null;
  latitud?: number | null; longitud?: number | null; sin_deforestacion?: boolean;
}
function datosLote(productorId: string, d: DatosLote) {
  return {
    productorId, codigo: codigo('LT'), nombre: d.nombre, cultivo: d.cultivo || 'cacao', variedad: d.variedad ?? null,
    hectareas: d.hectareas ?? null, departamento: d.departamento ?? null, provincia: d.provincia ?? null, distrito: d.distrito ?? null,
    latitud: d.latitud ?? null, longitud: d.longitud ?? null,
    sinDeforestacionDeclarada: !!d.sin_deforestacion, declaradaAt: d.sin_deforestacion ? new Date() : null,
  };
}

function serLote(l: Awaited<ReturnType<typeof db.agroLote.findFirst>> & object) {
  return {
    id: l.id, productor_id: l.productorId, codigo: l.codigo, nombre: l.nombre, cultivo: l.cultivo, variedad: l.variedad,
    hectareas: l.hectareas, departamento: l.departamento, provincia: l.provincia, distrito: l.distrito,
    latitud: l.latitud, longitud: l.longitud, sin_deforestacion: l.sinDeforestacionDeclarada,
    declarada_at: l.declaradaAt?.toISOString() ?? null,
  };
}

agroRouter.get('/lotes', async (c) => {
  const { orgId } = await contexto(c);
  const ls = await db.agroLote.findMany({
    where: { productor: { organizacionId: orgId } }, orderBy: { createdAt: 'desc' },
    include: { productor: { select: { nombre: true } }, cosechas: { select: { kilos: true } }, entregas: { select: { kilos: true } } },
  });
  return c.json({ lotes: ls.map((l) => ({ ...serLote(l), productor: l.productor.nombre,
    kilos_cosechados: l.cosechas.reduce((s, x) => s + x.kilos, 0), kilos_entregados: l.entregas.reduce((s, x) => s + x.kilos, 0) })) });
});
agroRouter.post('/lotes', async (c) => {
  const { orgId } = await contexto(c, ESCRIBEN);
  const d = validar(loteSchema, await c.req.json().catch(() => ({})));
  await productorDeOrg(d.productor_id, orgId);
  if ((d.latitud == null) !== (d.longitud == null)) throw new ApiError(400, 'Latitud y longitud van juntas');
  const l = await db.agroLote.create({ data: datosLote(d.productor_id, d) });
  return c.json({ lote: serLote(l) }, 201);
});
agroRouter.delete('/lotes/:id', async (c) => {
  const { orgId } = await contexto(c, ['admin']);
  await loteDeOrg(c.req.param('id'), orgId);
  await db.agroLote.delete({ where: { id: c.req.param('id') } });
  return c.json({ success: true });
});

// ── Cosechas ──
const cosechaSchema = z.object({ fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'), kilos: z.number().positive().max(10_000_000), nota: txt });

agroRouter.get('/lotes/:id/cosechas', async (c) => {
  const { orgId } = await contexto(c);
  await loteDeOrg(c.req.param('id'), orgId);
  const cs = await db.agroCosecha.findMany({ where: { loteId: c.req.param('id') }, orderBy: { fecha: 'desc' } });
  return c.json({ cosechas: cs.map((x) => ({ id: x.id, fecha: x.fecha.toISOString().slice(0, 10), kilos: x.kilos, nota: x.nota })) });
});
agroRouter.post('/lotes/:id/cosechas', async (c) => {
  const { orgId } = await contexto(c, ESCRIBEN);
  await loteDeOrg(c.req.param('id'), orgId);
  const d = validar(cosechaSchema, await c.req.json().catch(() => ({})));
  const x = await db.agroCosecha.create({ data: { loteId: c.req.param('id'), fecha: new Date(d.fecha), kilos: d.kilos, nota: d.nota ?? null } });
  return c.json({ cosecha: { id: x.id } }, 201);
});

// ── Centro de acopio digital ──
const entregaSchema = z.object({
  lote_id: z.string().uuid(),
  fecha_entrega: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
  kilos: z.number().positive().max(1_000_000),
  calidad: txt,
  porcentaje_pactado: z.number().min(0).max(100).nullish(),
});
const ventaSchema = z.object({
  fecha_venta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
  precio_referencia: z.number().positive().max(100000), // USD por tonelada, el día de la venta
  porcentaje_pactado: z.number().min(0).max(100).nullish(),
});

function serEntrega(e: { id: string; loteId: string; codigo: string; fechaEntrega: Date; kilos: number; calidad: string | null; porcentajePactado: number | null;
  fechaVenta: Date | null; precioReferencia: number | null; montoProductor: number | null; pagadoAt: Date | null }) {
  return {
    id: e.id, lote_id: e.loteId, codigo: e.codigo, fecha_entrega: e.fechaEntrega.toISOString().slice(0, 10), kilos: e.kilos, calidad: e.calidad,
    porcentaje_pactado: e.porcentajePactado, fecha_venta: e.fechaVenta?.toISOString().slice(0, 10) ?? null,
    precio_referencia: e.precioReferencia, monto_productor: e.montoProductor, pagado_at: e.pagadoAt?.toISOString() ?? null,
  };
}

agroRouter.get('/entregas', async (c) => {
  const { orgId } = await contexto(c);
  const es = await db.agroEntrega.findMany({ where: { lote: { productor: { organizacionId: orgId } } }, orderBy: { fechaEntrega: 'desc' },
    include: { lote: { select: { nombre: true, codigo: true, productor: { select: { nombre: true } } } } } });
  return c.json({ entregas: es.map((e) => ({ ...serEntrega(e), lote: e.lote.nombre, lote_codigo: e.lote.codigo, productor: e.lote.productor.nombre })) });
});
agroRouter.post('/entregas', async (c) => {
  const { orgId } = await contexto(c, ESCRIBEN);
  const d = validar(entregaSchema, await c.req.json().catch(() => ({})));
  await loteDeOrg(d.lote_id, orgId);
  const e = await db.agroEntrega.create({ data: {
    loteId: d.lote_id, codigo: codigo('SC'), fechaEntrega: new Date(d.fecha_entrega), kilos: d.kilos,
    calidad: d.calidad ?? null, porcentajePactado: d.porcentaje_pactado ?? null,
  } });
  return c.json({ entrega: serEntrega(e) }, 201);
});
// Venta y pago: solo administradores (es dinero del productor).
agroRouter.post('/entregas/:id/venta', async (c) => {
  const { orgId } = await contexto(c, ['admin']);
  const e = await db.agroEntrega.findFirst({ where: { id: c.req.param('id'), lote: { productor: { organizacionId: orgId } } } });
  if (!e) throw new ApiError(404, 'Entrega no encontrada');
  const d = validar(ventaSchema, await c.req.json().catch(() => ({})));
  const pct = d.porcentaje_pactado ?? e.porcentajePactado;
  if (pct == null) throw new ApiError(400, 'Falta el porcentaje pactado con el productor');
  const monto = Math.round((e.kilos / 1000) * d.precio_referencia * (pct / 100) * 100) / 100;
  const x = await db.agroEntrega.update({ where: { id: e.id }, data: {
    fechaVenta: new Date(d.fecha_venta), precioReferencia: d.precio_referencia, porcentajePactado: pct, montoProductor: monto,
  } });
  return c.json({ entrega: serEntrega(x) });
});
agroRouter.post('/entregas/:id/pagado', async (c) => {
  const { orgId } = await contexto(c, ['admin']);
  const e = await db.agroEntrega.findFirst({ where: { id: c.req.param('id'), lote: { productor: { organizacionId: orgId } } } });
  if (!e) throw new ApiError(404, 'Entrega no encontrada');
  if (e.montoProductor == null) throw new ApiError(409, 'Primero registra la venta');
  const x = await db.agroEntrega.update({ where: { id: e.id }, data: { pagadoAt: new Date() } });
  return c.json({ entrega: serEntrega(x) });
});

// ── Carga masiva (Excel/CSV leído en el navegador) ───────────────────────────
// Una fila = un productor + una parcela. El productor se reutiliza si ya existe
// (mismo DNI, o mismo nombre si no tiene DNI). Todo o nada: si alguna fila tiene
// error no se guarda ninguna, y se devuelve la lista exacta para corregir.
// `simular: true` valida sin escribir.
function aTexto(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}
function aNumero(v: unknown): number | null | 'invalido' {
  const s = aTexto(v);
  if (s === null) return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : 'invalido';
}
const SI = /^(s[ií]|yes|true|1|x)$/i;

interface Fila {
  productor: string; dni: string | null; comunidad: string | null; telefono: string | null;
  lote: string; cultivo: string | null; variedad: string | null; hectareas: number | null;
  latitud: number | null; longitud: number | null;
  departamento: string | null; provincia: string | null; distrito: string | null; sin_deforestacion: boolean;
}

function leerFila(f: Record<string, unknown>): { fila?: Fila; error?: string } {
  const productor = aTexto(f.productor), lote = aTexto(f.lote);
  if (!productor) return { error: 'falta el nombre del productor' };
  if (productor.length < 2) return { error: `el nombre del productor "${productor}" es demasiado corto` };
  if (!lote) return { error: 'falta el nombre del lote' };
  const nums: Record<string, number | null> = {};
  for (const k of ['hectareas', 'latitud', 'longitud']) {
    const n = aNumero(f[k]);
    if (n === 'invalido') return { error: `"${f[k]}" no es un número válido en ${k}` };
    nums[k] = n;
  }
  if ((nums.latitud == null) !== (nums.longitud == null)) return { error: 'latitud y longitud van juntas' };
  if (nums.latitud != null && (Math.abs(nums.latitud) > 90 || Math.abs(nums.longitud!) > 180)) return { error: 'coordenadas fuera de rango' };
  if (nums.hectareas != null && nums.hectareas <= 0) return { error: 'las hectáreas deben ser mayores que 0' };
  const dni = aTexto(f.dni);
  if (dni && !/^\d{8}$/.test(dni)) return { error: `el DNI "${dni}" debe tener 8 dígitos` };
  const corto = (k: string) => (aTexto(f[k]) ?? '').slice(0, 200) || null;
  return { fila: {
    productor: productor.slice(0, 150), dni, comunidad: corto('comunidad'), telefono: corto('telefono'),
    lote: lote.slice(0, 150), cultivo: corto('cultivo'), variedad: corto('variedad'), hectareas: nums.hectareas,
    latitud: nums.latitud, longitud: nums.longitud, departamento: corto('departamento'), provincia: corto('provincia'), distrito: corto('distrito'),
    sin_deforestacion: SI.test(aTexto(f.sin_deforestacion) ?? ''),
  } };
}

agroRouter.post('/importar', async (c) => {
  const { orgId, userId } = await contexto(c, ESCRIBEN);
  const body = await c.req.json().catch(() => ({})) as { filas?: unknown[]; simular?: boolean };
  if (!Array.isArray(body.filas) || body.filas.length === 0) throw new ApiError(400, 'El archivo no tiene filas');
  if (body.filas.length > 2000) throw new ApiError(400, 'Máximo 2000 filas por carga');

  const errores: { fila: number; mensaje: string }[] = [];
  const validas: { n: number; x: Fila }[] = [];
  body.filas.forEach((f, i) => {
    const n = i + 2; // la fila 1 del Excel son los encabezados
    const r = leerFila((f ?? {}) as Record<string, unknown>);
    if (r.error) errores.push({ fila: n, mensaje: r.error });
    else validas.push({ n, x: r.fila! });
  });

  // Un mismo DNI no puede traer dos nombres distintos en el archivo.
  const porDni = new Map<string, string>();
  for (const { n, x } of validas) {
    if (!x.dni) continue;
    const previo = porDni.get(x.dni);
    if (previo && previo.toLowerCase() !== x.productor.toLowerCase()) errores.push({ fila: n, mensaje: `el DNI ${x.dni} aparece también como "${previo}"` });
    else porDni.set(x.dni, x.productor);
  }

  const existentes = await db.agroProductor.findMany({ where: { organizacionId: orgId }, select: { id: true, nombre: true, dni: true } });
  const claveDe = (nombre: string, dni: string | null) => (dni ? `dni:${dni}` : `nom:${nombre.trim().toLowerCase()}`);
  const yaHay = new Map(existentes.map((p) => [claveDe(p.nombre, p.dni), p.id]));
  const claves = new Set(validas.map(({ x }) => claveDe(x.productor, x.dni)));
  const resumen = {
    filas: body.filas.length,
    productores_nuevos: [...claves].filter((k) => !yaHay.has(k)).length,
    productores_existentes: [...claves].filter((k) => yaHay.has(k)).length,
    lotes_nuevos: validas.length,
  };
  if (errores.length) return c.json({ ok: false, guardado: false, errores: errores.sort((a, b) => a.fila - b.fila), resumen }, 422);
  if (body.simular) return c.json({ ok: true, guardado: false, errores: [], resumen });

  await db.$transaction(async (tx) => {
    const ids = new Map(yaHay);
    for (const { x } of validas) {
      const k = claveDe(x.productor, x.dni);
      let pid = ids.get(k);
      if (!pid) {
        pid = (await tx.agroProductor.create({ data: { organizacionId: orgId, ownerId: userId, nombre: x.productor, dni: x.dni, comunidad: x.comunidad, telefono: x.telefono } })).id;
        ids.set(k, pid);
      }
      await tx.agroLote.create({ data: datosLote(pid, { ...x, nombre: x.lote }) });
    }
  }, { timeout: 60000 });
  return c.json({ ok: true, guardado: true, errores: [], resumen }, 201);
});
