import { createHash } from 'node:crypto';
import { createMiddleware } from 'hono/factory';
import type { ApiClient } from '@prisma/client';
import { db } from '@/lib/db';

// Autenticación de la API externa (§15): cabecera `X-Api-Key`, una clave por
// cliente. En la BD solo está el sha256 de la clave; si se pierde, se emite otra.
//
// El sha256 basta (no hace falta bcrypt): la clave es aleatoria de 192 bits, no
// una contraseña elegida por una persona, así que no hay diccionario que probar.

export function hashApiKey(clave: string): string {
  return createHash('sha256').update(clave, 'utf8').digest('hex');
}

// Límite por hora en memoria. Vale porque el backend corre en UN contenedor; si
// algún día hay varias réplicas, esto tiene que pasar a la BD o a Redis.
const VENTANA_MS = 60 * 60 * 1000;
const usos = new Map<string, number[]>();

// lastUsedAt se escribe como mucho una vez por minuto: actualizarlo en cada
// petición sería una escritura en la BD por cada lectura.
const ultimaMarca = new Map<string, number>();

export const apiKeyMiddleware = createMiddleware(async (c, next) => {
  const clave = c.req.header('X-Api-Key');
  if (!clave) {
    return c.json({ error: 'Falta la cabecera X-Api-Key' }, 401);
  }

  const cliente = await db.apiClient.findUnique({ where: { keyHash: hashApiKey(clave) } });
  if (!cliente || !cliente.active) {
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

  if (ahora - (ultimaMarca.get(cliente.id) ?? 0) > 60_000) {
    ultimaMarca.set(cliente.id, ahora);
    // No bloquea la petición: si falla, solo se pierde una marca de uso.
    db.apiClient.update({ where: { id: cliente.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  }

  c.set('apiClient', cliente);
  await next();
});

export function getApiClient(c: { get: (k: 'apiClient') => unknown }): ApiClient {
  return c.get('apiClient') as ApiClient;
}
