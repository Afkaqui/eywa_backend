import { createMiddleware } from 'hono/factory';
import { verifyToken, ApiError } from '@/lib/auth-helpers';

// Middleware que valida el JWT en el header Authorization: Bearer <token>
// Pone el payload decodificado en c.get('user')
export const authMiddleware = createMiddleware(async (c, next) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Token requerido' }, 401);
  }

  const token = authHeader.slice(7);

  try {
    const payload = verifyToken(token);
    c.set('user', payload);
    await next();
  } catch {
    return c.json({ error: 'Token inválido o expirado' }, 401);
  }
});
