import { Context } from 'hono';
import jwt from 'jsonwebtoken';
import type { UserRole } from '@prisma/client';

export interface JwtPayload {
  sub: string;       // userId
  email: string;
  role: UserRole;
  plan: string;
  name?: string;
}

// Extrae y verifica el JWT del header Authorization
export function verifyToken(token: string): JwtPayload {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET no configurado');
  return jwt.verify(token, secret) as JwtPayload;
}

// Genera un JWT firmado (para el endpoint de login)
export function signToken(payload: JwtPayload): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET no configurado');
  return jwt.sign(payload, secret, { expiresIn: '7d' });
}

// Obtiene el usuario autenticado del contexto de Hono
export function getRequestUser(c: Context): JwtPayload {
  return c.get('user') as JwtPayload;
}

// Lanza 403 si el usuario no tiene el rol requerido
export function assertRole(user: JwtPayload, roles: UserRole[]): void {
  if (!roles.includes(user.role)) {
    throw new ApiError(403, 'Permisos insuficientes');
  }
}

// Error tipado para respuestas de la API
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}
