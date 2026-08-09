// ── Hashing de contraseñas ──────────────────────────────────────────────────────
//
// Usa @node-rs/bcrypt (implementación en Rust) en vez de `bcryptjs`
// (JavaScript puro). El motivo NO es la velocidad sino el BLOQUEO:
//
//   bcryptjs corre en el hilo principal. Medido en producción (2026-07-28), con
//   5 logins en paralelo el bucle de eventos quedaba disponible solo al 3 % del
//   tiempo: mientras alguien iniciaba sesión, el backend estaba efectivamente
//   congelado para todos los demás. Un dashboard que responde en 13 ms pasaba a
//   esperar segundos.
//
//   @node-rs delega al thread pool y no bloquea. Misma prueba: 59 % de
//   disponibilidad (20× mejor) y 3,5× más rápido (4,6 → 16,1 logins/s).
//
// COMPATIBILIDAD: los hashes son bcrypt estándar y se verifican de forma cruzada
// en ambos sentidos (comprobado antes de migrar). Las contraseñas existentes
// siguen funcionando sin que nadie tenga que restablecerla, y si hubiera que
// revertir a bcryptjs, los hashes nuevos también validan.
//
// ⚠️ El COST 12 se conserva. Es lo que protege las contraseñas frente a ataques
// de fuerza bruta; bajarlo para "ir más rápido" debilitaría la seguridad. El
// problema nunca fue el costo, era la implementación.

import { hash as rsHash, verify as rsVerify } from '@node-rs/bcrypt';

/** Coste de bcrypt. No bajar sin entender la implicación de seguridad. */
export const BCRYPT_COST = 12;

export function hashPassword(plain: string): Promise<string> {
  return rsHash(plain, BCRYPT_COST);
}

/**
 * Verifica una contraseña contra su hash. Nunca lanza por un hash malformado:
 * devuelve false. Importa porque los usuarios creados por OAuth tienen el campo
 * `password` vacío — sin esto, intentar entrar con contraseña reventaría el
 * endpoint en vez de devolver "credenciales incorrectas".
 */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  try {
    return await rsVerify(plain, hash);
  } catch {
    return false;
  }
}
