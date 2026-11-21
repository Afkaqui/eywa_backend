// ══ Glosario UNANCHA (PLAN C3) ═════════════════════════════════════════════════════
//
// Términos que se usan con clientes y en reuniones. Una sola fuente: la sirve la
// API pública y la consumen la Academia de UNANCHA y UNANCHA Agro.
//
// Revisión 2026-11-19: cada término se contrastó con una fuente oficial nacional
// (CONCYTEC, MEF, MINAM) o internacional (ONU, CMNUCC, PNUMA, FAO, OCDE, UE, GHG
// Protocol, ICMA, WFTO). Se quitaron las cifras sin respaldo. Los términos de la
// categoría "Metodología UNANCHA" son propios y su fuente es UNANCHA. La taxonomía verde
// oficial del Perú aún no se publica (comisión multisectorial del MEF con el MINAM);
// cuando se apruebe se enlaza en su término.
// Si una definición cambia, se cambia aquí y se actualiza en ambas plataformas.

export interface Fuente {
  nombre: string;
  url?: string;
}

export interface Termino {
  termino: string;
  sigla?: string;
  categoria: 'Metodología UNANCHA' | 'Innovación' | 'Finanzas' | 'Sostenibilidad' | 'Agro';
  definicion: string;
  fuente: Fuente;
}

export const GLOSARIO_VERSION = '2026-11-19';
export const GLOSARIO_ESTADO = 'Definiciones revisadas contra fuentes oficiales nacionales e internacionales (noviembre de 2026); cada término indica su fuente. Los términos de la Metodología UNANCHA son propios. La taxonomía verde oficial del Perú está en elaboración y se enlazará cuando se apruebe.';

const UNANCHA: Fuente = { nombre: 'Metodología UNANCHA' };
const CONCYTEC: Fuente = { nombre: 'CONCYTEC · Niveles de madurez tecnológica y comercial', url: 'https://vinculate.concytec.gob.pe/niveles-de-madurez/' };

export const GLOSARIO: Termino[] = [
  // ── Metodología UNANCHA (conceptos propios) ──
  { termino: 'Máximo Producto Posible', sigla: 'MPP', categoria: 'Metodología UNANCHA', fuente: UNANCHA,
    definicion: 'Todo lo que puede salir de un mismo insumo y a qué sectores se puede vender: por ejemplo, de la mazorca de cacao, el grano, la cáscara y el mucílago. Contrasta con el "producto mínimo viable": en lugar de lanzar lo mínimo, se dimensiona cuánto valor circular puede generar el negocio. Se relaciona con la bioeconomía y la economía circular.' },
  { termino: 'Definición del problema', categoria: 'Metodología UNANCHA', fuente: UNANCHA,
    definicion: 'Antes de proponer una solución se define el problema real con seis elementos: actor afectado, dolor, causa raíz, urgencia, consecuencia si no se actúa y unidad de validación (quién lo quiere y pagaría). Un problema es una brecha que no desaparece del todo; el proyecto ataca una causa y lo mitiga.' },
  { termino: 'Metodología GENES', sigla: 'GENES', categoria: 'Metodología UNANCHA', fuente: UNANCHA,
    definicion: 'Diagnóstico de sostenibilidad de UNANCHA: 14 criterios ponderados en cuatro categorías (perfil, ambiental, social, económico), con un puntaje de 0 a 75 y cinco bandas: Marrón, Verde, Plata, Oro y Fénix. Es una autoevaluación, no una certificación.' },
  { termino: 'Índice de Madurez Industrial', sigla: 'IMI', categoria: 'Metodología UNANCHA', fuente: UNANCHA,
    definicion: 'Indicador en desarrollo en UNANCHA que ubica a una empresa entre las revoluciones industriales (de 1.0 a 5.0) según su maquinaria, energía y operación, como apoyo para sustentar el nivel de madurez tecnológica (TRL) de un proyecto. No es un estándar oficial.' },

  // ── Innovación ──
  { termino: 'Nivel de madurez tecnológica', sigla: 'TRL', categoria: 'Innovación', fuente: CONCYTEC,
    definicion: 'Escala del 1 al 9 que indica cuán probada está una tecnología: de la idea en papel (1) al sistema funcionando en su entorno real (9). La piden casi todos los fondos de innovación. En UNANCHA se usa la escala del CONCYTEC (adaptada de la NASA y la Unión Europea; uso regulado por la R. P. 020-2022-CONCYTEC-P), que agrupa los niveles en investigación básica, investigación aplicada, desarrollo tecnológico e innovación. Su calculadora en Vincúlate da un resultado orientador y referencial.' },
  { termino: 'Nivel de madurez comercial', sigla: 'CRL', categoria: 'Innovación', fuente: CONCYTEC,
    definicion: 'Escala paralela al TRL pero del lado del mercado: de las hipótesis del modelo de negocio a un modelo validado y listo para escalar. Escala de 1 a 9. En la propuesta del CONCYTEC es un complemento opcional del TRL: se evalúa cuando el proyecto ya tiene un TRL elevado, es un emprendimiento tecnológico y cuenta con información de mercado.' },
  { termino: 'Quíntuple hélice', categoria: 'Innovación',
    fuente: { nombre: 'Carayannis y Campbell (2010), modelo de innovación de la quíntuple hélice' },
    definicion: 'Modelo que explica la innovación como la interacción de cinco subsistemas: academia, empresas, gobierno, sociedad civil (incluidos los medios y la cultura) y el medio ambiente. Añade el ambiente a la triple hélice (academia, empresa y Estado) para orientar la innovación hacia la sostenibilidad.' },
  { termino: 'Estrategia del océano azul', categoria: 'Innovación',
    fuente: { nombre: 'W. Chan Kim y Renée Mauborgne, La estrategia del océano azul (2005)' },
    definicion: 'Océano rojo: un mercado existente donde se compite por la misma demanda. Océano azul: un espacio de mercado nuevo, sin competencia directa, que se crea innovando en valor. En UNANCHA se aplica también a los fondos: dos convocatorias del mismo monto, una con 1000 postulantes y otra con 32; conviene la segunda.' },
  { termino: 'Objetivos y resultados clave', sigla: 'OKR', categoria: 'Innovación',
    fuente: { nombre: 'Andrew Grove (Intel) y John Doerr, Mide lo que importa (2018)' },
    definicion: 'Método de gestión que fija pocos objetivos ambiciosos, cada uno con resultados clave medibles, normalmente por trimestre y con seguimiento frecuente para corregir a tiempo. Se diferencia del KPI, que es un indicador de desempeño que suele medir resultados ya ocurridos.' },

  // ── Finanzas ──
  { termino: 'Financiamiento combinado', sigla: 'Blended finance', categoria: 'Finanzas',
    fuente: { nombre: 'OCDE · Principios de financiamiento combinado', url: 'https://www.oecd.org/dac/financing-sustainable-development/blended-finance-principles/' },
    definicion: 'Uso estratégico de fondos para el desarrollo (públicos o de cooperación) para movilizar financiamiento adicional, sobre todo privado, hacia el desarrollo sostenible. Permite proyectos que ninguna fuente cubriría sola.' },
  { termino: 'Beneficio tributario a la I+D+i', categoria: 'Finanzas',
    fuente: { nombre: 'CONCYTEC · Portal de beneficios tributarios (Ley 30309 y modificatorias)', url: 'https://portalbeneficiostributarios.concytec.gob.pe/' },
    definicion: 'Incentivo de la Ley 30309 que permite a las empresas deducir del impuesto a la renta un porcentaje adicional a lo que gastan en proyectos de investigación, desarrollo e innovación calificados por el CONCYTEC. El porcentaje depende del tamaño de la empresa y de quién ejecuta el proyecto. Según la Ley 32539 (diciembre de 2025), aplica a proyectos que inicien hasta el 31 de diciembre de 2028. Se le dice a veces "innovación por impuestos".' },
  { termino: 'Obras por impuestos', sigla: 'OxI', categoria: 'Finanzas',
    fuente: { nombre: 'ProInversión · Obras por Impuestos (Ley 29230)', url: 'https://www.obrasporimpuestos.pe/' },
    definicion: 'Mecanismo de la Ley 29230 por el que una empresa financia y ejecuta un proyecto de inversión pública y recupera lo invertido como certificados que se aplican a su impuesto a la renta.' },
  { termino: 'Debida diligencia', categoria: 'Finanzas',
    fuente: { nombre: 'OCDE · Guía de debida diligencia para una conducta empresarial responsable (2018)' },
    definicion: 'Revisión a fondo que hace un financiador o inversionista antes de comprometer recursos: documentos, finanzas, equipo, riesgos legales, sociales y ambientales. Para la OCDE es también el proceso continuo con que una empresa identifica y gestiona sus impactos negativos.' },
  { termino: 'Aporte de contrapartida', categoria: 'Finanzas',
    fuente: { nombre: 'Bases de los concursos de ProInnóvate y PROCIENCIA' },
    definicion: 'Parte del presupuesto del proyecto que debe poner el beneficiario. Puede ser monetaria o no monetaria (horas del equipo, equipos o infraestructura valorizados), según lo que permitan las bases de cada convocatoria; el porcentaje mínimo cambia de un fondo a otro.' },
  { termino: 'Tarifa de éxito', categoria: 'Finanzas', fuente: UNANCHA,
    definicion: 'Pago a quien estructuró el proyecto, condicionado a que el financiamiento se obtenga. Antes de pactarla hay que revisar las bases del fondo: muchas no permiten pagarla con los recursos del proyecto.' },
  { termino: 'Seguro paramétrico', categoria: 'Finanzas',
    fuente: { nombre: 'Banco Mundial · Seguros paramétricos frente a riesgos de desastres' },
    definicion: 'Seguro que paga automáticamente cuando un parámetro medible (lluvia, temperatura, intensidad de un sismo) supera un umbral pactado, sin esperar la evaluación de daños. Protege la continuidad del negocio ante eventos como El Niño.' },
  { termino: 'Bono verde', categoria: 'Finanzas',
    fuente: { nombre: 'ICMA · Principios de los Bonos Verdes', url: 'https://www.icmagroup.org/sustainable-finance/the-principles-guidelines-and-handbooks/green-bond-principles-gbp/' },
    definicion: 'Instrumento de deuda cuyos fondos se destinan solo a proyectos con beneficios ambientales claros, con reportes sobre el uso de los recursos y su impacto. Hay variantes: bonos sociales, sostenibles y vinculados a la sostenibilidad.' },

  // ── Sostenibilidad ──
  { termino: 'Brecha de infraestructura o de acceso a servicios', categoria: 'Sostenibilidad',
    fuente: { nombre: 'MEF · Invierte.pe, indicadores de brechas', url: 'https://www.mef.gob.pe/es/indicadores-de-brechas' },
    definicion: 'Diferencia entre la oferta disponible de infraestructura o de acceso a un servicio público y la demanda que debería cubrirse, en un momento y un territorio dados. En el Perú se mide con indicadores oficiales por sector y orienta la inversión pública. En UNANCHA también se usa "brecha sectorial" para un problema que afecta a muchas personas en una región.' },
  { termino: 'Objetivos de Desarrollo Sostenible', sigla: 'ODS', categoria: 'Sostenibilidad',
    fuente: { nombre: 'ONU · Agenda 2030 (resolución A/RES/70/1)', url: 'https://www.un.org/sustainabledevelopment/es/objetivos-de-desarrollo-sostenible/' },
    definicion: 'Los 17 objetivos y 169 metas de la Agenda 2030, adoptada por los Estados de la ONU en 2015, para erradicar la pobreza, proteger el planeta y asegurar la prosperidad hacia 2030.' },
  { termino: 'ESG (ambiental, social y de gobernanza)', sigla: 'ESG', categoria: 'Sostenibilidad',
    fuente: { nombre: 'Pacto Mundial de la ONU, Who Cares Wins (2004); Principios de Inversión Responsable (2006)' },
    definicion: 'Los tres grupos de criterios con que inversionistas y financiadores evalúan a una organización más allá de lo financiero: ambientales (clima, recursos, residuos), sociales (trabajadores, comunidades, clientes) y de gobernanza (ética, transparencia, control).' },
  { termino: 'Gases de efecto invernadero y huella de carbono', sigla: 'GEI', categoria: 'Sostenibilidad',
    fuente: { nombre: 'MINAM · Huella de Carbono Perú', url: 'https://huellacarbonoperu.minam.gob.pe/huellaperu/' },
    definicion: 'Los GEI (dióxido de carbono, metano, óxido nitroso y otros) retienen calor en la atmósfera. La huella de carbono es el total de GEI que emite una organización, expresado en toneladas de CO2 equivalente. Huella de Carbono Perú es la herramienta oficial del MINAM para medirla, reportarla y reconocer su reducción.' },
  { termino: 'Alcances 1, 2 y 3', categoria: 'Sostenibilidad',
    fuente: { nombre: 'GHG Protocol · Estándar corporativo', url: 'https://ghgprotocol.org/corporate-standard' },
    definicion: 'Clasificación de las emisiones de una organización. Alcance 1: emisiones directas de fuentes propias o controladas (vehículos, calderas). Alcance 2: indirectas por la energía comprada (electricidad, calor, vapor). Alcance 3: las demás indirectas de la cadena de valor (proveedores, transporte, uso de los productos).' },
  { termino: 'Contribuciones Nacionalmente Determinadas', sigla: 'NDC', categoria: 'Sostenibilidad',
    fuente: { nombre: 'CMNUCC · Acuerdo de París', url: 'https://unfccc.int/process-and-meetings/the-paris-agreement/nationally-determined-contributions-ndcs' },
    definicion: 'Compromisos que cada país presenta ante el Acuerdo de París para reducir sus emisiones y adaptarse al cambio climático; se actualizan cada cinco años. Medir bien (por ejemplo, el bosque en pie) ayuda a sustentarlas y a atraer financiamiento climático.' },
  { termino: 'Mitigación y adaptación al cambio climático', categoria: 'Sostenibilidad',
    fuente: { nombre: 'IPCC · Glosario; Ley 30754, Ley Marco sobre Cambio Climático' },
    definicion: 'Mitigación: reducir las emisiones de GEI o aumentar su captura. Adaptación: ajustar sistemas naturales y humanos al clima actual o esperado para reducir daños o aprovechar oportunidades. Muchos fondos piden indicar a cuál de las dos contribuye el proyecto.' },
  { termino: 'Soluciones basadas en la naturaleza', sigla: 'SbN', categoria: 'Sostenibilidad',
    fuente: { nombre: 'PNUMA · Resolución UNEA-5/5 (2022); UICN', url: 'https://www.iucn.org/es/resources/issues-brief/soluciones-basadas-en-la-naturaleza' },
    definicion: 'Acciones para proteger, conservar, restaurar, usar de forma sostenible y gestionar ecosistemas, que responden a desafíos sociales, económicos y ambientales y a la vez benefician a las personas y a la biodiversidad (definición de la Asamblea de la ONU para el Medio Ambiente, 2022).' },
  { termino: 'Servicios ecosistémicos', categoria: 'Sostenibilidad',
    fuente: { nombre: 'MINAM · Ley 30215, Mecanismos de Retribución por Servicios Ecosistémicos (MERESE)', url: 'https://www.minam.gob.pe/economia-y-financiamiento-ambiental/mecanismos-de-retribucion-por-servicios-ecosistemicos/' },
    definicion: 'Beneficios que las personas obtienen de los ecosistemas, como la regulación hídrica, la captura de carbono o la polinización. Con los MERESE, quienes se benefician (por ejemplo, una empresa de agua) retribuyen a quienes conservan la fuente.' },
  { termino: 'Taxonomía verde', categoria: 'Sostenibilidad',
    fuente: { nombre: 'MINAM · Finanzas verdes', url: 'https://www.gob.pe/institucion/minam/campa%C3%B1as/7006-finanzas-verdes' },
    definicion: 'Sistema de clasificación oficial que define qué actividades económicas cuentan como ambientalmente sostenibles, para que bancos, inversionistas y empresas usen los mismos criterios y se eviten afirmaciones verdes engañosas. En el Perú la elabora una comisión multisectorial liderada por el MEF con el MINAM; aún no está aprobada.' },
  { termino: 'Bioeconomía', categoria: 'Sostenibilidad',
    fuente: { nombre: 'FAO · Bioeconomía sostenible y circular', url: 'https://www.fao.org/in-action/sustainable-and-circular-bioeconomy/en' },
    definicion: 'Producción, uso y conservación de recursos biológicos (cultivos, bosques, biodiversidad), incluidos los conocimientos, la ciencia y la innovación asociados, para proveer información, productos, procesos y servicios a todos los sectores económicos de forma sostenible.' },
  { termino: 'Economía circular', categoria: 'Sostenibilidad',
    fuente: { nombre: 'Fundación Ellen MacArthur; PRODUCE, Hoja de Ruta hacia una Economía Circular en el Sector Industria (D. S. 003-2020-PRODUCE)', url: 'https://www.ellenmacarthurfoundation.org/es/temas/presentacion-economia-circular/vision-general' },
    definicion: 'Modelo que elimina los residuos y la contaminación desde el diseño, mantiene productos y materiales en uso el mayor tiempo posible y regenera la naturaleza, en lugar de producir, usar y desechar. Ver Máximo Producto Posible.' },

  // ── Agro ──
  { termino: 'Reglamento europeo contra la deforestación', sigla: 'EUDR', categoria: 'Agro',
    fuente: { nombre: 'Unión Europea · Reglamento (UE) 2023/1115 y su modificación (UE) 2025/2650', url: 'https://eur-lex.europa.eu/eli/reg/2023/1115/oj' },
    definicion: 'Norma de la Unión Europea que exige demostrar que productos como el cacao, el café, la palma, la soya, el caucho, la madera y el ganado no provienen de tierras deforestadas después del 31 de diciembre de 2020, con la geolocalización de cada parcela y una declaración de debida diligencia. Se aplica desde el 30 de diciembre de 2026 a medianas y grandes empresas y desde el 30 de junio de 2027 a micro y pequeñas.' },
  { termino: 'Comercio justo', categoria: 'Agro',
    fuente: { nombre: 'Organización Mundial del Comercio Justo (WFTO)', url: 'https://wfto.com/fair-trade/definition-fair-trade/' },
    definicion: 'Relación comercial basada en el diálogo, la transparencia y el respeto, que busca mayor equidad en el comercio internacional y mejores condiciones para productores y trabajadores marginados. Las certificaciones de comercio justo (por ejemplo, Fairtrade) lo verifican de forma independiente; la trazabilidad de UNANCHA Agro ayuda a documentar precios y pagos, pero no reemplaza esa certificación.' },
  { termino: 'Pasaporte digital', categoria: 'Agro', fuente: { nombre: 'UNANCHA Agro' },
    definicion: 'Registro público de un lote o saco, accesible con un QR, que muestra su origen, su georreferencia, la declaración de no deforestación y, en el caso de un saco, cuándo se vendió y cuánto recibió el productor. El nombre del productor solo aparece si lo autoriza.' },
  { termino: 'Centro de acopio digital', categoria: 'Agro', fuente: { nombre: 'UNANCHA Agro' },
    definicion: 'Registro de cada entrega de producto con código, fecha y peso, y luego de su venta con el precio de referencia del día. Sirve para transparentar los pagos al productor y para la trazabilidad que exige el EUDR.' },
];
