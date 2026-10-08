import { createHash, randomBytes } from 'node:crypto';
import { createMiddleware } from 'hono/factory';
import type { ApiClient } from '@prisma/client';
import { db } from '@/lib/db';
import type { ApiScope } from '@/lib/api-scopes';

// Autenticación de la API externa (§15): cabecera `X-Api-Key`, una clave por
// cliente. En la BD solo está el sha256 de la clave; si se pierde, se emite otra.
//
// El sha256 basta (no hace falta bcrypt): la clave es aleatoria de 192 bits, no
// una contraseña elegida por una persona, así que no hay diccionario que probar.

export function hashApiKey(clave: string): string {
  return createHash('sha256').update(clave, 'utf8').digest('hex');
}

/** Clave nueva: `eywa_` + 48 hex. Se muestra UNA vez; aquí solo se guarda el hash. */
export function generarApiKey() {
  const clave = 'eywa_' + randomBytes(24).toString('hex');
  return { clave, prefijo: clave.slice(0, 12), hash: hashApiKey(clave) };
}

// Límite por hora en memoria. Vale porque el backend corre en UN contenedor; si
// algún día hay varias réplicas, esto tiene que pasar a la BD o a Redis.
const VENTANA_MS = 60 * 60 * 1000;
const usos = new Map<string, number[]>();

// lastUsedAt y requestCount se vuelcan como mucho una vez por minuto: escribir en
// la BD en cada petición sería una escritura por cada lectura.
const ultimaMarca = new Map<string, number>();
const pendientes  = new Map<string, number>();

function contarUso(id: string, ahora: number) {
  pendientes.set(id, (pendientes.get(id) ?? 0) + 1);
  if (ahora - (ultimaMarca.get(id) ?? 0) < 60_000) return;
  ultimaMarca.set(id, ahora);
  const n = pendientes.get(id) ?? 0;
  pendientes.set(id, 0);
  // No bloquea la petición: si falla, solo se pierde ese tramo del conteo.
  db.apiClient.update({
    where: { id },
    data:  { lastUsedAt: new Date(ahora), requestCount: { increment: n } },
  }).catch(() => {});
}

export const apiKeyMiddleware = createMiddleware(async (c, next) => {
  const clave = c.req.header('X-Api-Key');
  if (!clave) {
    return c.json({ error: 'Falta la cabecera X-Api-Key' }, 401);
  }

  // Se consulta en cada petición a propósito: revocar tiene efecto inmediato.
  const cliente = await db.apiClient.findUnique({ where: { keyHash: hashApiKey(clave) } });
  if (!cliente || !cliente.active || cliente.revokedAt) {
    return c.json({ error: 'Clave de API inválida o revocada' }, 401);
  }

  const ahora = Date.now();
  const recientes = (usos.get(cliente.id) ?? []).filter((t) => ahora - t < VENTANA_MS);
  if (recientes.length >= cliente.rateLimitPerHour) {
    const espera = Math.ceil((recientes[0] + VENTANA_MS - ahora) / 1000);
    usos.set(cliente.id, recientes);
    c.header('Retry-After', String(espera));
    return c.json({
      error: `Límite de ${cliente.rateLimitPerHour} peticiones por hora alcanzado`,
      reintentar_en_segundos: espera,
    }, 429);
  }
  recientes.push(ahora);
  usos.set(cliente.id, recientes);
  c.header('X-RateLimit-Limit', String(cliente.rateLimitPerHour));
  c.header('X-RateLimit-Remaining', String(cliente.rateLimitPerHour - recientes.length));

  contarUso(cliente.id, ahora);

  c.set('apiClient', cliente);
  await next();
});

/** Exige un permiso concreto. Va DESPUÉS de apiKeyMiddleware. */
export function requiereScope(scope: ApiScope) {
  return createMiddleware(async (c, next) => {
    const cliente = c.get('apiClient') as ApiClient;
    const scopes = Array.isArray(cliente.scopes) ? (cliente.scopes as string[]) : [];
    if (!scopes.includes(scope)) {
      return c.json({ error: 'Tu clave no tiene permiso para esta operación', permiso_requerido: scope }, 403);
    }
    await next();
  });
}

export function getApiClient(c: { get: (k: 'apiClient') => unknown }): ApiClient {
  return c.get('apiClient') as ApiClient;
}
