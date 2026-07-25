// ── Correo transaccional (Resend) ───────────────────────────────────────────────
//
// Habla directo con la API REST de Resend vía fetch, SIN el SDK: una dependencia
// menos que mantener (y ya nos costó caro el churn de versiones de pdf-parse).
//
// Si RESEND_API_KEY está vacía el envío queda DESHABILITADO y sendMail devuelve
// { ok:false, disabled:true } — quien llama decide qué hacer. Nunca lanza: un
// fallo de correo no debe tumbar el endpoint que lo invoca.

const RESEND_URL = 'https://api.resend.com/emails';

const API_KEY  = process.env.RESEND_API_KEY;
const FROM     = process.env.MAIL_FROM;
// Base de los enlaces que van dentro del correo (sin barra final).
const APP_URL  = (process.env.PUBLIC_APP_URL ?? '').replace(/\/+$/, '');

export function isMailConfigured(): boolean {
  return Boolean(API_KEY && FROM);
}

export function appUrl(path = ''): string {
  return `${APP_URL}${path}`;
}

export interface SendResult {
  ok: boolean;
  disabled?: boolean; // true si no hay credenciales configuradas
  id?: string;        // id del envío en Resend
  error?: string;
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string; // alternativa en texto plano: mejora la entregabilidad
}): Promise<SendResult> {
  if (!isMailConfigured()) {
    console.warn('[mailer] envío deshabilitado: falta RESEND_API_KEY o MAIL_FROM');
    return { ok: false, disabled: true };
  }

  try {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        // Explícito a propósito (mismo motivo que en el validador: hay APIs detrás
        // de proxies que rechazan clientes sin User-Agent reconocible).
        'User-Agent':    'eywa-mailer/1.0',
      },
      body: JSON.stringify({
        from:    FROM,
        to:      [opts.to],
        subject: opts.subject,
        html:    opts.html,
        text:    opts.text,
      }),
      signal: AbortSignal.timeout(20_000),
    });

    const data = await res.json().catch(() => ({})) as any;
    if (!res.ok) {
      const msg = data?.message ?? data?.error ?? `HTTP ${res.status}`;
      console.error('[mailer] Resend rechazó el envío:', msg);
      return { ok: false, error: String(msg) };
    }
    return { ok: true, id: data?.id };
  } catch (err) {
    console.error('[mailer] fallo de red al enviar:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'error desconocido' };
  }
}

// ── Plantilla base con la marca EYWA ────────────────────────────────────────────
// Correo en HTML con estilos EN LÍNEA: los clientes de correo (Gmail, Outlook)
// descartan <style> y cualquier CSS externo. Paleta emerald según IDENTIDAD.md.
export function baseTemplate(opts: {
  title: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string;
}): string {
  const cta = opts.ctaLabel && opts.ctaUrl
    ? `<tr><td style="padding:8px 0 24px;">
         <a href="${opts.ctaUrl}"
            style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;
                   font-weight:600;font-size:15px;padding:12px 24px;border-radius:8px;">
           ${opts.ctaLabel}
         </a>
       </td></tr>`
    : '';

  return `<!doctype html>
<html lang="es"><body style="margin:0;padding:0;background:#f9fafb;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
         style="background:#f9fafb;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;
                    border-radius:16px;padding:32px;
                    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
        <tr><td style="padding-bottom:8px;">
          <span style="font-size:20px;font-weight:700;color:#111827;letter-spacing:-0.02em;">EYWA</span>
        </td></tr>
        <tr><td style="border-bottom:1px solid #e5e7eb;padding-bottom:20px;">
          <div style="font-size:13px;color:#6b7280;">Plataforma de sostenibilidad e impacto</div>
        </td></tr>
        <tr><td style="padding:24px 0 12px;">
          <h1 style="margin:0;font-size:20px;font-weight:600;color:#111827;">${opts.title}</h1>
        </td></tr>
        <tr><td style="padding-bottom:20px;font-size:15px;line-height:1.6;color:#374151;">
          ${opts.bodyHtml}
        </td></tr>
        ${cta}
        <tr><td style="border-top:1px solid #e5e7eb;padding-top:20px;font-size:12px;
                       line-height:1.5;color:#9ca3af;">
          ${opts.footerNote ?? ''}
          <div style="margin-top:8px;">Este es un correo automático, no respondas a esta dirección.</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
