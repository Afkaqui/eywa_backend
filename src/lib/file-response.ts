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
    'Content-Type':   a.mime,
    'Content-Length': String(size), // permite al navegador mostrar el progreso
  };
  headers['Content-Disposition'] = a.descargar === false
    ? `inline; filename="${encodeURIComponent(a.nombre)}"`
    : `attachment; filename="${encodeURIComponent(a.nombre)}"`;

  // Readable de Node -> ReadableStream web, que es lo que acepta Response.
  const web = Readable.toWeb(createReadStream(a.ruta)) as unknown as ReadableStream;
  return new Response(web, { headers });
}
