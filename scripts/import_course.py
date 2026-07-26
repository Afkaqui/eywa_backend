# -*- coding: utf-8 -*-
"""
Importador de cursos de la Academia EYWA: JSON de autoría -> SQL idempotente.

    python scripts/import_course.py "ruta/al/curso.json" [--publicar]

Genera SQL que se puede aplicar tantas veces como haga falta: la clave es
`courses.slug`. Re-importar el mismo slug ACTUALIZA el curso y reemplaza sus
semanas/recursos/preguntas, en vez de duplicarlo. (A diferencia de los seeds de
actores y fondos, que hacen DELETE FROM y borran lo agregado a mano.)

VALIDA ANTES DE GENERAR y aborta si algo no cuadra. La razón: un curso con una
URL rota o una categoría inválida no falla de forma ruidosa — se publica y el
alumno se encuentra el problema. Mejor que reviente aquí.

Por defecto importa el curso SIN PUBLICAR. Publicar es una decisión explícita
(--publicar), porque un curso visible con contenido de relleno le promete al
alumno algo que no existe.
"""
import json
import re
import sys
import unicodedata

# Valores que la base de datos acepta de verdad (enums de Prisma).
CATEGORIAS = ['agrotech', 'edutech', 'banca_sostenible', 'esg', 'general']
NIVELES    = ['basico', 'intermedio', 'avanzado']
# La columna section_resources.type es texto libre, pero el visor solo distingue
# estos; cualquier otro se mapea a 'link' para no romper el render.
TIPOS_NATIVOS = ['pdf', 'link', 'forum']
TIPO_MAP = {
    'articulo': 'link', 'artículo': 'link',
    'ejercicio': 'link',
    'video': 'link',
    'enlace': 'link',
}
# Alias de categorías que la gente escribe pero no existen en la BD.
CATEGORIA_ALIAS = {
    'sostenibilidad': 'esg',
    'asg': 'esg',
    'finanzas_sostenibles': 'banca_sostenible',
}

PLACEHOLDER_RE = re.compile(r'example\.com|…|\.\.\.|XXXX|TODO|CAMBIAR', re.I)


def q(v):
    """Escapa un valor para SQL."""
    if v is None:
        return 'NULL'
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def validar(d, publicar):
    """Devuelve (errores, avisos). Los errores abortan; los avisos solo informan."""
    err, warn = [], []

    for campo in ('slug', 'titulo', 'descripcion', 'semanas'):
        if not d.get(campo):
            err.append(f'Falta el campo obligatorio "{campo}"')
    if err:
        return err, warn

    # Categoría / nivel
    cat = d.get('categoria', 'general')
    if cat not in CATEGORIAS:
        if cat in CATEGORIA_ALIAS:
            warn.append(f'categoria "{cat}" no existe en la BD -> se mapea a "{CATEGORIA_ALIAS[cat]}"')
        else:
            err.append(f'categoria "{cat}" no existe. Permitidas: {CATEGORIAS}')
    if d.get('nivel', 'basico') not in NIVELES:
        err.append(f'nivel "{d.get("nivel")}" no existe. Permitidos: {NIVELES}')

    # Semanas y recursos
    if not d['semanas']:
        err.append('El curso no tiene semanas')
    numeros = [s.get('numero') for s in d['semanas']]
    if len(set(numeros)) != len(numeros):
        err.append(f'Hay números de semana repetidos: {numeros}')

    placeholders = []
    for s in d['semanas']:
        n = s.get('numero')
        if not s.get('titulo'):
            err.append(f'Semana {n} sin título')
        if not s.get('video'):
            warn.append(f'Semana {n} sin video')
        for r in s.get('recursos', []):
            if not r.get('url'):
                err.append(f'Semana {n}: recurso "{r.get("titulo")}" sin URL')
                continue
            if PLACEHOLDER_RE.search(r['url']):
                placeholders.append(f'S{n} "{r.get("titulo")}": {r["url"]}')
            tipo = (r.get('tipo') or 'link').lower()
            if tipo not in TIPOS_NATIVOS and tipo not in TIPO_MAP:
                warn.append(f'S{n}: tipo "{tipo}" desconocido -> se guarda como "link"')

    # Publicar con contenido de relleno es lo que NO puede pasar en silencio.
    if placeholders:
        msg = 'URLs de relleno (sin contenido real):\n      - ' + '\n      - '.join(placeholders)
        (err if publicar else warn).append(msg)

    # Examen
    examen = d.get('examen') or []
    if not examen:
        warn.append('Sin examen: el curso NO podrá emitir certificado')
    for i, p in enumerate(examen, 1):
        ops = p.get('opciones') or []
        if len(ops) < 2:
            err.append(f'Pregunta {i}: necesita al menos 2 opciones')
        ci = p.get('respuesta_correcta')
        if not isinstance(ci, int) or not (0 <= ci < len(ops)):
            err.append(f'Pregunta {i}: respuesta_correcta={ci} fuera de rango (0..{len(ops) - 1})')

    return err, warn


def generar_sql(d, publicar):
    cat = d.get('categoria', 'general')
    cat = CATEGORIA_ALIAS.get(cat, cat)
    nivel = d.get('nivel', 'basico')
    slug = d['slug']
    semanas = d['semanas']

    out = []
    a = out.append
    a('-- Generado por scripts/import_course.py — IDEMPOTENTE (clave: courses.slug)')
    a(f'-- Curso: {d["titulo"]}')
    a('BEGIN;')
    a('')
    a('-- 1. Curso (inserta o actualiza por slug)')
    a(f"""INSERT INTO courses (id, slug, title, description, category, level, duration_hours,
                     instructor, lessons_count, is_published, pass_threshold, created_at, updated_at)
VALUES (gen_random_uuid(), {q(slug)}, {q(d['titulo'])}, {q(d['descripcion'])},
        {q(cat)}::"CourseCategory", {q(nivel)}::"CourseLevel", {q(d.get('duracion_horas', 1))},
        {q(d.get('instructor', 'EYWA Academy'))}, {q(len(semanas))}, {q(bool(publicar))},
        {q(d.get('umbral_aprobacion', 80))}, now(), now())
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title, description = EXCLUDED.description,
  category = EXCLUDED.category, level = EXCLUDED.level,
  duration_hours = EXCLUDED.duration_hours, instructor = EXCLUDED.instructor,
  lessons_count = EXCLUDED.lessons_count, is_published = EXCLUDED.is_published,
  pass_threshold = EXCLUDED.pass_threshold, updated_at = now();""")
    a('')
    a('-- 2. Fuera el contenido anterior de ESTE curso (cascade limpia los recursos).')
    a('--    El progreso y los certificados de los alumnos NO se tocan.')
    a(f"DELETE FROM course_sections WHERE course_id = (SELECT id FROM courses WHERE slug = {q(slug)});")
    a(f"DELETE FROM exam_questions  WHERE course_id = (SELECT id FROM courses WHERE slug = {q(slug)});")
    a('')
    a('-- 3. Semanas y sus recursos')
    for s in semanas:
        num = s['numero']
        a(f"""INSERT INTO course_sections (id, course_id, sort_order, title, description, video_url, created_at, updated_at)
VALUES (gen_random_uuid(), (SELECT id FROM courses WHERE slug = {q(slug)}),
        {q(num)}, {q(s['titulo'])}, {q(s.get('descripcion'))}, {q(s.get('video'))}, now(), now());""")
        for j, r in enumerate(s.get('recursos', [])):
            tipo = (r.get('tipo') or 'link').lower()
            tipo = tipo if tipo in TIPOS_NATIVOS else TIPO_MAP.get(tipo, 'link')
            a(f"""INSERT INTO section_resources (id, section_id, type, title, url, sort_order)
VALUES (gen_random_uuid(),
        (SELECT s.id FROM course_sections s JOIN courses c ON c.id = s.course_id
         WHERE c.slug = {q(slug)} AND s.sort_order = {q(num)}),
        {q(tipo)}, {q(r['titulo'])}, {q(r['url'])}, {q(j)});""")
        a('')

    examen = d.get('examen') or []
    if examen:
        a('-- 4. Examen final (correct_index NUNCA se envía al navegador)')
        for i, p in enumerate(examen):
            ops = json.dumps(p['opciones'], ensure_ascii=False)
            a(f"""INSERT INTO exam_questions (id, course_id, sort_order, question, options, correct_index)
VALUES (gen_random_uuid(), (SELECT id FROM courses WHERE slug = {q(slug)}),
        {q(i)}, {q(p['pregunta'])}, {q(ops)}::jsonb, {q(p['respuesta_correcta'])});""")
        a('')

    a('COMMIT;')
    return '\n'.join(out)


def main():
    # En Windows la consola usa cp1252 y las tildes salen corruptas al redirigir a
    # un archivo; Postgres rechaza el SQL con "invalid byte sequence for UTF8".
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding='utf-8')
        except AttributeError:
            pass  # Python < 3.7

    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    publicar = '--publicar' in sys.argv
    if not args:
        print(__doc__)
        sys.exit(1)

    with open(args[0], encoding='utf-8') as f:
        d = json.load(f)

    err, warn = validar(d, publicar)

    for w in warn:
        print(f'  AVISO: {w}', file=sys.stderr)
    if err:
        print('\nABORTADO. Corrige esto antes de importar:', file=sys.stderr)
        for e in err:
            print(f'  ERROR: {e}', file=sys.stderr)
        sys.exit(1)

    estado = 'PUBLICADO' if publicar else 'BORRADOR (usa --publicar para publicarlo)'
    print(f'  -> {d["titulo"]}: {len(d["semanas"])} semanas, '
          f'{sum(len(s.get("recursos", [])) for s in d["semanas"])} recursos, '
          f'{len(d.get("examen") or [])} preguntas · {estado}', file=sys.stderr)

    sys.stdout.write(generar_sql(d, publicar))


if __name__ == '__main__':
    main()
