// ══ Job nocturno: re-verificación del catálogo de fondos (PENDIENTES §16) ══════
//
// Reemplaza a la "gema" de Gemini que mantenía el catálogo. Lo lanza el cron del VPS:
//
//   0 23 * * *  docker exec eywa_api node dist/jobs/verificar-fondos.js
//
// Qué hace con cada fondo: visita su página (respetando robots.txt, una petición cada
// 2 s por sitio), clasifica su estado y, si encuentra una fecha de cierre nueva, la
// PROPONE en la cola de revisión con el fragmento de texto del que salió. Nunca la
// aplica sola (ver `decidir`). Tampoco toca nombre, montos, sectores ni nada que no
// sean sus campos de verificación.
//
// `--simular` recorre todo e imprime las decisiones sin escribir en la BD.

import { db } from '@/lib/db';
import { visitar, enParalelo } from '@/lib/fondos-red';
import { decidir } from '@/lib/fondos-verificacion';

const SIMULAR = process.argv.includes('--simular');

const claveFecha = (d: Date) => `fecha:${d.toISOString().slice(0, 10)}`;

async function main() {
  const run = SIMULAR ? null : await db.fundSyncRun.create({ data: { kind: 'verificacion' } });
  const fondos = await db.fund.findMany({
    select: { id: true, name: true, url: true, deadline: true, dismissedDetection: true },
  });

  const conteo: Record<string, number> = {};
  let actualizados = 0, marcados = 0, errores = 0;

  await enParalelo(fondos, 6, async (f) => {
    try {
      if (!f.url) {
        conteo.sin_url = (conteo.sin_url ?? 0) + 1;
        return;
      }
      const v = await visitar(f.url);

      let estado: string;
      let revisar = false;
      let motivo: string | null = null;
      let clave: string | null = null; // identifica el hallazgo, para no re-proponer lo descartado
      let fechaDetectada: Date | null = null;
      let evidencia: string | null = null;

      if (v.omitida === 'linkedin') {
        estado = 'sin_datos';
        clave = 'linkedin';
        revisar = true;
        motivo = 'El enlace es de LinkedIn y no lleva al fondo. Reemplazar por la URL oficial de la convocatoria.';
      } else if (v.omitida === 'robots') {
        estado = 'bloqueado'; // el sitio pide no ser rastreado: se respeta
      } else if (v.omitida === 'url_invalida') {
        estado = 'error';
        clave = 'url_invalida';
        revisar = true;
        motivo = 'La URL registrada no es válida.';
      } else {
        const d = decidir({ http: v.http, texto: v.texto, actual: f.deadline });
        estado = d.estado;
        revisar = d.revisar;
        motivo = d.motivo;
        fechaDetectada = d.fechaDetectada;
        evidencia = d.evidencia;
        if (d.estado === 'enlace_roto') clave = 'enlace_roto';
        else if (d.revisar && d.fechaDetectada) clave = claveFecha(d.fechaDetectada);
      }

      // Lo que un gestor ya descartó no se vuelve a proponer.
      if (revisar && clave && f.dismissedDetection === clave) { revisar = false; motivo = null; }

      conteo[estado] = (conteo[estado] ?? 0) + 1;
      if (revisar) marcados++;

      if (SIMULAR) {
        if (revisar || fechaDetectada) console.log(`[${estado}] ${f.name} → ${fechaDetectada?.toISOString().slice(0, 10) ?? '-'} · ${motivo ?? ''}`);
        return;
      }

      await db.fund.update({
        where: { id: f.id },
        data: {
          verifyStatus: estado,
          verifiedAt: new Date(),
          verifyHttp: v.http,
          // La detección se guarda aunque no se proponga: es la evidencia de la última visita.
          ...(fechaDetectada ? { detectedDeadline: fechaDetectada, detectedEvidence: evidencia?.slice(0, 400) ?? null } : {}),
          needsReview: revisar,
          reviewReason: revisar ? motivo : null,
        },
      });
      actualizados++;
    } catch (e) {
      errores++;
      console.error(`[error] ${f.name}:`, e instanceof Error ? e.message : e);
    }
  });

  const resumen = { estados: conteo, marcados_para_revision: marcados };
  console.log(`${new Date().toISOString()} · ${fondos.length} fondos · ${JSON.stringify(resumen)} · errores ${errores}`);

  if (run) {
    await db.fundSyncRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), checked: fondos.length, updated: actualizados, flagged: marcados, errors: errores, summary: resumen },
    });
  }
}

main()
  .catch((e) => { console.error('[verificar-fondos] fallo general:', e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
