-- Fondos que NO vienen de la matriz Neo — se cargan aparte a propósito.
-- Origen: convocatorias compartidas por Eduardo (post de LinkedIn, 26-07-2026),
-- verificadas una por una en la fuente oficial de cada programa.
--
-- Antes vivían SOLO en la base de datos: `seed-funds.sql` hacía DELETE FROM
-- funds y re-correrlo los habría borrado sin dejar rastro. Ahora ambos seeds
-- hacen UPSERT por nombre y pueden ejecutarse en cualquier orden, las veces
-- que haga falta.
--
-- Las fechas de cierre son las REALES: tres entran ya vencidas porque el post
-- las anunciaba como abiertas y no lo estaban. Se conservan igual para que la
-- próxima convocatoria tenga su enlace a mano.
BEGIN;

INSERT INTO funds (id, scope, name, instrument_type, eligible_profile, sectors,
                   sector_tags, amounts, deadline, deadline_text, checklist, url, updated_at) VALUES
  (gen_random_uuid(), $f$internacional$f$, $f$BID Lab — Financiamiento para startups de impacto$f$, $f$Deuda / Equity / Cuasi-equity / Grant$f$,
   $f$Startups y empresas innovadoras de América Latina y el Caribe con solución de impacto social o ambiental, TRACCIÓN COMPROBADA y equipo sólido.$f$,
   $f$Impacto social y ambiental, multisectorial$f$, $f$["emprendimiento", "innovacion", "finanzas", "multisectorial"]$f$::jsonb,
   $f$USD 200.000 a USD 5.000.000 según producto y etapa$f$,
   NULL, $f$Ventanilla permanente$f$,
   $f$Tracción comprobada, impacto social/ambiental medible, equipo sólido$f$,
   $f$https://bidlab.org/en/products/financing-products$f$, NOW()),
  (gen_random_uuid(), $f$internacional$f$, $f$CodeLaunch LATAM 2026$f$, $f$Competencia / Capital semilla$f$,
   $f$Startups de tecnología en etapa temprana de América Latina.$f$,
   $f$Tecnología, software$f$, $f$["tecnologia", "emprendimiento"]$f$::jsonb,
   $f$Desde USD 50.000 sin ceder equity + servicios de desarrollo de producto. Dos finalistas pasan al Mundial (Dallas, 11-11-2026).$f$,
   '2026-05-10', $f$Postulación cerrada — el evento es el 14-10-2026, pero ya no se recibe$f$,
   $f$Producto/MVP tecnológico, equipo fundador$f$,
   $f$https://codelaunch.com/events/2026-latam/$f$, NOW()),
  (gen_random_uuid(), $f$internacional$f$, $f$Google for Startups Accelerator: AI First (América Latina)$f$, $f$Aceleración (sin equity)$f$,
   $f$Startups con TRACCIÓN demostrable, idealmente entre Seed y Serie A. Profundamente técnicas, apalancadas en IA/machine learning. Exige CTO comprometido con el programa.$f$,
   $f$Inteligencia artificial, tecnología$f$, $f$["tecnologia", "innovacion"]$f$::jsonb,
   $f$Sin costo y sin dilución: 12 semanas de mentoría de Google + créditos cloud$f$,
   NULL, $f$Convocatoria por cohortes — confirmar fechas con el acelerador regional$f$,
   $f$Tracción demostrable, producto con IA/ML en el núcleo, CTO disponible$f$,
   $f$https://startup.google.com/programs/accelerator/ai-first/latin-america/$f$, NOW()),
  (gen_random_uuid(), $f$internacional$f$, $f$START Fellowship Accelerator 2026$f$, $f$Fellowship / Aceleración$f$,
   $f$Fundadores de 18 a 25 años de América Latina y África, matriculados en universidades asociadas. Inglés C1. Requiere MVP o primer prototipo.$f$,
   $f$Multisectorial — startups en etapa temprana$f$, $f$["emprendimiento", "multisectorial"]$f$::jsonb,
   $f$Hasta 60.000 EUR sin dilución (pitch) + estadía cubierta 3 meses en Suiza$f$,
   '2025-09-14', $f$Cerrada — próxima edición por confirmar$f$,
   $f$MVP/prototipo, matrícula en universidad asociada, inglés C1, edad 18-25$f$,
   $f$https://www.startglobal.org/start-fellowship/accelerator$f$, NOW())
ON CONFLICT (name) DO UPDATE SET
  scope = EXCLUDED.scope, instrument_type = EXCLUDED.instrument_type,
  eligible_profile = EXCLUDED.eligible_profile, sectors = EXCLUDED.sectors,
  sector_tags = EXCLUDED.sector_tags, amounts = EXCLUDED.amounts,
  deadline = EXCLUDED.deadline, deadline_text = EXCLUDED.deadline_text,
  checklist = EXCLUDED.checklist, url = EXCLUDED.url, updated_at = NOW();

COMMIT;
