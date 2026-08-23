-- Quién cambió la contraseña, no solo cuándo.
--
-- `password_changed_at` ya existía, pero no distingue entre "el usuario la
-- cambió" y "un administrador se la cambió". Con la acción de superadmin esa
-- diferencia importa: es lo que permite saber, después, que la clave de una
-- cuenta pasó por manos ajenas.
--
-- Aditiva y sin pérdida: en NULL significa "la cambió el propio usuario"
-- (o no hay registro), que es el comportamiento de todo lo anterior.
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "password_changed_by" UUID;

COMMENT ON COLUMN "profiles"."password_changed_by" IS
  'Administrador que fijó la contraseña. NULL = la cambió el propio usuario.';
