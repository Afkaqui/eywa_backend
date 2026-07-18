// Taxonomía TEMÁTICA de EYWA para etiquetar fondos (2026-07-18).
//
// Por qué existe: los sectores de los fondos venían como texto libre del Excel de
// Neo ("Medio ambiente, salud.", "IA, Gobierno Digital.") y los de las empresas son
// una lista de 41 INDUSTRIAS ("Energy - Renewable", "Food - Agro"). Comparar texto
// contra texto daba falsos positivos y negativos.
//
// Solución: los fondos se etiquetan con estos temas, y cada industria de empresa
// se mapea a los temas que le son relevantes. El match es entonces EXACTO
// (intersección de conjuntos), no coincidencia de cadenas.

export const FUND_TAGS: Record<string, string> = {
  clima:          'Clima y carbono',
  ambiente:       'Medio ambiente y biodiversidad',
  agua:           'Agua y océanos',
  agro:           'Agro y alimentación',
  energia:        'Energía',
  circular:       'Economía circular',
  salud:          'Salud',
  educacion:      'Educación',
  tecnologia:     'Tecnología e IA',
  finanzas:       'Finanzas e inclusión financiera',
  emprendimiento: 'Emprendimiento y MYPE',
  innovacion:     'Ciencia e innovación',
  genero:         'Género',
  inclusion:      'Inclusión social y derechos',
  gobernanza:     'Gobernanza y transparencia',
  movilidad:      'Turismo y movilidad',
  multisectorial: 'Multisectorial',
};

export const FUND_TAG_KEYS = Object.keys(FUND_TAGS);

// Industria de la empresa (INDUSTRY_SECTORS) → temas de fondo relevantes.
// "multisectorial" no se mapea aquí: esos fondos aplican a todos y se suman aparte.
export const SECTOR_TO_TAGS: Record<string, string[]> = {
  'Information Technologies':   ['tecnologia'],
  'Food - Agro':                ['agro'],
  'Food - Farming':             ['agro'],
  'Food - Fishing':             ['agro', 'agua'],
  'Food - Gastronomy':          ['agro', 'emprendimiento'],
  'Food - Nutrition':           ['agro', 'salud'],
  'Biotechnology - Medical':    ['salud', 'innovacion'],
  'Biotechnology - Nutrition':  ['agro', 'salud'],
  'Biotechnology - Equipment':  ['salud', 'innovacion'],
  'Construction - Real Estate': ['ambiente', 'circular'],
  'Construction - Architecture':['ambiente', 'circular'],
  'Construction - Design':      ['circular'],
  'Transport':                  ['movilidad', 'clima'],
  'Sports':                     ['inclusion'],
  'Commerce':                   ['emprendimiento', 'finanzas'],
  'Tourism':                    ['movilidad'],
  'Energy - Non-renewable':     ['energia'],
  'Energy - Renewable':         ['energia', 'clima'],
  'Mining':                     ['ambiente'],
  'Manufacture - Textile':      ['circular'],
  'Manufacture - Artisan':      ['circular', 'emprendimiento'],
  'Digital Fabrication':        ['tecnologia', 'innovacion'],
  'Finance':                    ['finanzas'],
  'Aerospace':                  ['innovacion', 'tecnologia'],
  'Chemistry':                  ['innovacion'],
  'Engineering':                ['innovacion', 'tecnologia'],
  'Forestry and Paper':         ['ambiente', 'circular'],
  'Metallurgy':                 ['circular', 'ambiente'],
  'Industrial Manufacturing':   ['circular'],
  'Logistics':                  ['movilidad'],
  'Electronics':                ['tecnologia', 'circular'],
  'Automotive':                 ['movilidad', 'clima'],
  'Fashion Industry':           ['circular'],
  'Education':                  ['educacion'],
  'Farmaceutical':              ['salud'],
  'Mechanics':                  ['innovacion'],
  'Leatherworking':             ['circular'],
  'Livestock':                  ['agro'],
  'Environment':                ['ambiente', 'clima'],
  'Restoration':                ['ambiente'],
  'Others':                     [],
};

// El campo `sector` de la organización permite TEXTO LIBRE, así que en producción
// hay valores en español ("Energía Renovable", "Manufactura") que no están en la
// lista inglesa. Sin estos alias el match daba 0 para esos usuarios.
const SPANISH_ALIASES: Record<string, string[]> = {
  'tecnologias de la informacion': ['tecnologia'],
  'tecnologia':                    ['tecnologia'],
  'informatica':                   ['tecnologia'],
  'software':                      ['tecnologia'],
  'agricultura':                   ['agro'],
  'agro':                          ['agro'],
  'agroindustria':                 ['agro'],
  'alimentos':                     ['agro'],
  'gastronomia':                   ['agro', 'emprendimiento'],
  'pesca':                         ['agro', 'agua'],
  'ganaderia':                     ['agro'],
  'nutricion':                     ['agro', 'salud'],
  'biotecnologia':                 ['salud', 'innovacion'],
  'salud':                         ['salud'],
  'farmaceutica':                  ['salud'],
  'medicina':                      ['salud'],
  'educacion':                     ['educacion'],
  'energia':                       ['energia'],
  'energia renovable':             ['energia', 'clima'],
  'energias renovables':           ['energia', 'clima'],
  'energia no renovable':          ['energia'],
  'mineria':                       ['ambiente'],
  'medio ambiente':                ['ambiente', 'clima'],
  'ambiente':                      ['ambiente', 'clima'],
  'construccion':                  ['ambiente', 'circular'],
  'arquitectura':                  ['ambiente', 'circular'],
  'inmobiliaria':                  ['ambiente', 'circular'],
  'transporte':                    ['movilidad', 'clima'],
  'logistica':                     ['movilidad'],
  'automotriz':                    ['movilidad', 'clima'],
  'turismo':                       ['movilidad'],
  'comercio':                      ['emprendimiento', 'finanzas'],
  'finanzas':                      ['finanzas'],
  'manufactura':                   ['circular'],
  'manufactura textil':            ['circular'],
  'textil':                        ['circular'],
  'moda':                          ['circular'],
  'artesania':                     ['circular', 'emprendimiento'],
  'industria':                     ['circular'],
  'metalurgia':                    ['circular', 'ambiente'],
  'quimica':                       ['innovacion'],
  'ingenieria':                    ['innovacion', 'tecnologia'],
  'electronica':                   ['tecnologia', 'circular'],
  'aeroespacial':                  ['innovacion', 'tecnologia'],
  'forestal':                      ['ambiente', 'circular'],
  'papel':                         ['ambiente', 'circular'],
  'deportes':                      ['inclusion'],
  'mecanica':                      ['innovacion'],
  'cuero':                         ['circular'],
  'restauracion':                  ['ambiente'],
  'otros':                         [],
};

function norm(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// Índice normalizado de la lista oficial (inglés) para tolerar mayúsculas/tildes
const NORMALIZED_OFFICIAL: Record<string, string[]> = Object.fromEntries(
  Object.entries(SECTOR_TO_TAGS).map(([k, v]) => [norm(k), v])
);

/**
 * Temas relevantes para la industria de una empresa.
 * Tolera la lista oficial (inglés), alias en español y texto libre parecido.
 * Devuelve [] si no reconoce nada (la UI entonces no promete un match).
 */
export function tagsForSector(sector: string | null | undefined): string[] {
  if (!sector) return [];
  const n = norm(sector);

  const exact = NORMALIZED_OFFICIAL[n] ?? SPANISH_ALIASES[n];
  if (exact) return exact;

  // Coincidencia parcial: "Energía Renovable S.A." → "energia renovable"
  for (const [alias, tags] of Object.entries(SPANISH_ALIASES)) {
    if (alias.length > 4 && n.includes(alias)) return tags;
  }
  return [];
}
