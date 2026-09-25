// ── Servir archivos del disco por STREAM ────────────────────────────────────────
//
// Antes cada descarga hacía:
//     const data = await readFile(ruta);      // archivo COMPLETO en memoria
//     return c.body(new Uint8Array(data));    // …y una COPIA más
//
// Con el límite de 20 MB del Dataroom, una sola descarga podía usar ~40 MB de RAM,
// y diez simultáneas ~400 MB — en un contenedor que en reposo vive con 17,6 MiB.
// La memoria escalaba con el TAMAÑO del archivo y con la concurrencia.
//
// Con stream, el archivo se envía por trozos: la memoria ya no depende del tamaño.

import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { Readable } from 'stream';

export interface ArchivoServido {
  ruta: string;
  nombre: string;   // nombre que verá el usuario al descargar
  mime: string;
  /** `false` para mostrar en línea (imágenes); `true` fuerza descarga. */
  descargar?: boolean;
  /** Cabecera Range de la petición, si la hay. Necesaria para vídeo y audio. */
  rango?: string | null;
}

/**
 * Devuelve una Response que envía el archivo por stream, o `null` si no existe
 * en disco (quien llama decide el error: los mensajes cambian según el módulo).
 */
export async function servirArchivo(a: ArchivoServido): Promise<Response | null> {
  let size: number;
  try {
    const info = await stat(a.ruta);
    if (!info.isFile()) return null;
    size = info.size;
  } catch {
    return null; // el archivo se borró del disco pero la fila sigue en la BD
  }

  const headers: Record<string, string> = {
    'Content-Type': a.mime,
    // Sin esto el navegador no puede adelantar un vídeo: tendría que descargar
    // el archivo entero antes de reproducir. Con un mp4 de 566 MB eso es inviable.
    'Accept-Ranges': 'bytes',
  };
  headers['Content-Disposition'] = a.descargar === false
    ? `inline; filename="${encodeURIComponent(a.nombre)}"`
    : `attachment; filename="${encodeURIComponent(a.nombre)}"`;

  // ── Petición por rango (el reproductor pide un trozo) ───────────────────────
  const m = /^bytes=(\d*)-(\d*)$/.exec(a.rango ?? '');
  if (m) {
    const inicio = m[1] === '' ? size - Number(m[2]) : Number(m[1]);
    const fin    = m[2] === '' || m[1] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);

    if (Number.isNaN(inicio) || inicio < 0 || inicio > fin || inicio >= size) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    }
    const trozo = Readable.toWeb(
      createReadStream(a.ruta, { start: inicio, end: fin })) as unknown as ReadableStream;
    return new Response(trozo, {
      status: 206,
      headers: { ...headers,
        'Content-Range':  `bytes ${inicio}-${fin}/${size}`,
        'Content-Length': String(fin - inicio + 1) },
    });
  }

  // Sin rango: el comportamiento de siempre, el archivo completo.
  headers['Content-Length'] = String(size); // permite al navegador mostrar el progreso
  const web = Readable.toWeb(createReadStream(a.ruta)) as unknown as ReadableStream;
  return new Response(web, { headers });
}
