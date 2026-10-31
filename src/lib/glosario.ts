// ══ Glosario EYWA (PLAN C3) ═════════════════════════════════════════════════════
//
// Términos que se usan con clientes y en reuniones. Una sola fuente: la sirve la
// API pública y la consumen la Academia de EYWA y EYWA Agro.
//
// ⚠️ Definiciones redactadas por EYWA a partir de la reunión del 2026-10-08 y de
// uso general: "por validar con Eduardo". El glosario oficial de taxonomía verde
// del MINAM se enlazará cuando llegue (PLAN A7). Si una definición cambia, se
// cambia aquí y se actualiza en ambas plataformas.

export interface Termino {
  termino: string;
  sigla?: string;
  categoria: 'Metodología EYWA' | 'Innovación' | 'Finanzas' | 'Sostenibilidad' | 'Agro';
  definicion: string;
}

export const GLOSARIO_VERSION = '2026-10-31';
export const GLOSARIO_ESTADO = 'Borrador por validar con Eduardo Noriega. El glosario oficial de taxonomía verde del MINAM se enlazará al recibirlo.';

export const GLOSARIO: Termino[] = [
  // Metodología EYWA
  { termino: 'Máximo Producto Posible', sigla: 'MPP', categoria: 'Metodología EYWA',
    definicion: 'Todo lo que puede salir de un mismo insumo y a qué sectores se puede vender: por ejemplo, de la mazorca de cacao, el grano, la cáscara y el mucílago. Contrasta con el "producto mínimo viable": en lugar de lanzar lo mínimo, se dimensiona cuánto valor circular puede generar el negocio. Es lo que buscan los fondos de bioeconomía.' },
  { termino: 'Definición del problema', categoria: 'Metodología EYWA',
    definicion: 'Antes de proponer una solución se define el problema real con seis elementos: actor afectado, dolor, causa raíz, urgencia, consecuencia si no se actúa y unidad de validación (quién lo quiere y pagaría). Un problema es una brecha que no desaparece del todo; el proyecto ataca una causa y lo mitiga.' },
  { termino: 'Brecha sectorial', categoria: 'Metodología EYWA',
    definicion: 'Problema que afecta a muchas personas en un país o región (hambre, salud, educación, infraestructura). Es la escala a la que se mide un problema real.' },
  { termino: 'Quíntuple hélice', categoria: 'Metodología EYWA',
    definicion: 'Los cinco actores de un ecosistema de innovación: gobierno (tiene recursos), academia (valida), sociedad civil (conecta y agrupa), empresas (resuelven y financian) y ambiente (lo sostiene todo). Si el ambiente no se regenera, el resto no funciona.' },
  { termino: 'Metodología GENES', sigla: 'GENES', categoria: 'Metodología EYWA',
    definicion: 'Diagnóstico de sostenibilidad de EYWA: 14 criterios ponderados en cuatro categorías (perfil, ambiental, social, económico), con un puntaje de 0 a 75 y cinco bandas: Marrón, Verde, Plata, Oro y Fénix. Es una autoevaluación, no una certificación.' },
  { termino: 'Índice de Madurez Industrial', sigla: 'IMI', categoria: 'Metodología EYWA',
    definicion: 'Ubica a una empresa entre las revoluciones industriales (de 1.0 a 5.0) según su maquinaria, energía y operación. En América Latina suele estar entre 1.5 y 2.3. Sirve para sustentar el nivel tecnológico (TRL) de un proyecto. En EYWA aún está en desarrollo.' },
  // Innovación
  { termino: 'Nivel de madurez tecnológica', sigla: 'TRL', categoria: 'Innovación',
    definicion: 'Escala del 1 al 9 que indica cuán probada está una tecnología: de la idea en papel (1) al sistema funcionando en su entorno real (9). La piden casi todos los fondos de innovación.' },
  { termino: 'Nivel de madurez comercial', sigla: 'CRL', categoria: 'Innovación',
    definicion: 'Escala equivalente al TRL pero del lado del mercado: de la hipótesis de cliente a las ventas recurrentes.' },
  { termino: 'Océano azul / océano rojo', categoria: 'Innovación',
    definicion: 'Océano rojo: un mercado o un fondo con mucha competencia. Océano azul: uno con pocos competidores. Ejemplo: dos fondos con el mismo monto, uno con 1000 postulantes y otro con 32; conviene el segundo.' },
  { termino: 'OKR', sigla: 'OKR', categoria: 'Innovación',
    definicion: 'Objetivos y resultados clave: se fijan metas y se revisan semana a semana para corregir a tiempo. A diferencia del KPI, que suele medir cuando el problema ya ocurrió, el OKR sirve para actuar antes.' },
  { termino: 'Debida diligencia', categoria: 'Finanzas',
    definicion: 'Revisión a fondo que hace un financiador antes de desembolsar: documentos, finanzas, equipo y riesgos. Cada miembro del equipo debe poder responder por su área.' },
  // Finanzas
  { termino: 'Financiamiento combinado', sigla: 'Blended finance', categoria: 'Finanzas',
    definicion: 'Combinar varias fuentes (fondos públicos, cooperación, banca, beneficios tributarios) para financiar un mismo resultado. Permite proyectos que ninguna fuente cubriría sola.' },
  { termino: 'Innovación por impuestos', categoria: 'Finanzas',
    definicion: 'Beneficio tributario en el Perú que permite deducir del impuesto a la renta un porcentaje mayor al invertido en proyectos de innovación calificados. Hay mecanismos parecidos: obras por impuestos y servicios por impuestos. Los porcentajes y requisitos dependen de la norma vigente.' },
  { termino: 'Tarifa de éxito', categoria: 'Finanzas',
    definicion: 'Pago a quien estructuró el proyecto, ligado a que el financiamiento se obtenga y se desembolse por hitos. Suele incluirse dentro del presupuesto del propio proyecto.' },
  { termino: 'Aporte de contrapartida', categoria: 'Finanzas',
    definicion: 'Parte del proyecto que debe poner la empresa (a menudo el 20 %). No siempre es dinero: inversiones previas valorizadas pueden contar.' },
  { termino: 'Seguro paramétrico', categoria: 'Finanzas',
    definicion: 'Seguro que paga automáticamente cuando un parámetro climático supera un umbral (lluvia, temperatura, un fenómeno de El Niño), sin esperar la evaluación de daños. Protege la continuidad del negocio.' },
  // Sostenibilidad
  { termino: 'Soluciones basadas en la naturaleza', sigla: 'SbN', categoria: 'Sostenibilidad',
    definicion: 'Acciones que protegen o restauran ecosistemas y a la vez resuelven un problema social o económico. Hay fondos específicos para ellas, con prioridad para países como el Perú.' },
  { termino: 'Contribuciones Nacionalmente Determinadas', sigla: 'NDC', categoria: 'Sostenibilidad',
    definicion: 'Compromisos de cada país ante el Acuerdo de París para reducir emisiones. Medir bien (por ejemplo, bosque en pie) permite sustentarlas y atraer financiamiento climático.' },
  { termino: 'Taxonomía verde', categoria: 'Sostenibilidad',
    definicion: 'Clasificación oficial que define qué actividades económicas cuentan como sostenibles, para que bancos, fondos y empresas usen los mismos términos. En el Perú la impulsa el MINAM.' },
  { termino: 'Bioeconomía', categoria: 'Sostenibilidad',
    definicion: 'Economía basada en el uso sostenible de recursos biológicos (cultivos, bosques, biodiversidad) para producir alimentos, materiales y energía, regenerando lo que se usa.' },
  { termino: 'Economía circular', categoria: 'Sostenibilidad',
    definicion: 'Modelo en el que los residuos de un proceso son insumo de otro, en lugar de producir, usar y desechar. Ver Máximo Producto Posible.' },
  // Agro
  { termino: 'Reglamento europeo contra la deforestación', sigla: 'EUDR', categoria: 'Agro',
    definicion: 'Norma de la Unión Europea que exige demostrar que productos como el cacao y el café no provienen de tierras deforestadas después del 31 de diciembre de 2020, con la geolocalización de cada parcela.' },
  { termino: 'Pasaporte digital', categoria: 'Agro',
    definicion: 'Registro público de un lote o saco, accesible con un QR, que muestra su origen, su georreferencia, la declaración de no deforestación y, en el caso de un saco, cuándo se vendió y cuánto recibió el productor.' },
  { termino: 'Centro de acopio digital', categoria: 'Agro',
    definicion: 'Registro de cada entrega de producto con código, fecha y peso, y luego de su venta con el precio de referencia del día. Permite demostrar el comercio justo sin un certificado costoso.' },
  { termino: 'Comercio justo', categoria: 'Agro',
    definicion: 'Que el productor reciba el precio pactado sobre el valor real de venta. Con trazabilidad se puede demostrar sin pagar una certificación externa.' },
];
