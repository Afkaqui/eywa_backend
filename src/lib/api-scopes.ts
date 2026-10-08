import type { Prisma } from '@prisma/client';

// Permisos de la API externa (§15). Cada clave lleva los suyos; una ruta sin su
// permiso responde 403 aunque la clave sea válida. Así un cliente que solo debe
// consultar el directorio no puede dar de alta empresas.
export const API_SCOPES = {
  'criterios:leer':          'Ver los criterios GENES',
  'organizaciones:escribir': 'Dar de alta y actualizar empresas y su diagnóstico',
  'organizaciones:leer':     'Consultar las empresas que dio de alta',
  'empresas:leer':           'Consultar el directorio de empresas con perfil público',
} as const;

export type ApiScope = keyof typeof API_SCOPES;

export function esScopeValido(s: string): s is ApiScope {
  return s in API_SCOPES;
}

// Las empresas que da de alta un cliente de la API cuelgan de un perfil de
// servicio (no es una persona). Ese perfil no debe contarse ni listarse como
// usuario: inflaba "Total usuarios" y aparecía en el Portfolio como una empresa
// con "Registro incompleto".
export const NO_ES_PERFIL_DE_SERVICIO = { apiClients: { none: {} } } satisfies Prisma.ProfileWhereInput;
