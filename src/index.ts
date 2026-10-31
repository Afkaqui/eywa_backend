import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { corsMiddleware } from '@/middleware/cors';
import { authRouter }           from '@/routes/auth';
import { usersRouter }          from '@/routes/users';
import { portfolioRouter }      from '@/routes/portfolio';
import { diagnosticRouter }     from '@/routes/diagnostic';
import { coursesRouter }        from '@/routes/courses';
import { organizationRouter }   from '@/routes/organization';
import { simbiocreacionRouter } from '@/routes/simbiocreacion';
import { validatorRouter }        from '@/routes/validator';
import { certificatesRouter }     from '@/routes/certificates';
import { actorsRouter }           from '@/routes/actors';
import { dataroomRouter }         from '@/routes/dataroom';
import { mediaRouter }            from '@/routes/media';
import { fundsRouter }            from '@/routes/funds';
import { notificationsRouter }    from '@/routes/notifications';
import { statsRouter }            from '@/routes/stats';
import { externalRouter }         from '@/routes/external';
import { publicApiRouter }        from '@/routes/public-api';
import { apiClientsRouter }       from '@/routes/api-clients';
import { agroRouter }             from '@/routes/agro';
import { serveStatic }            from '@hono/node-server/serve-static';
import { readFileSync }           from 'node:fs';
import path                       from 'node:path';
import { ApiError } from '@/lib/auth-helpers';

const app = new Hono();

// Middlewares globales
app.use('*', logger());
app.use('*', corsMiddleware);

// ── Vertical AGRO: agro.encsust4in4ble.earth ──────────────────────────────────
// nginx del VPS manda ese host aquí. Todo lo que no es /api se sirve desde
// agro-web/ (app ligera, sin build), y cualquier ruta de la app cae en index.html
// para que /p/LT-XXXX (pasaporte público, QR) funcione con enlace directo.
const AGRO_DIR = path.resolve(process.cwd(), 'agro-web');
const esAgro = (host?: string) => /^agro\./i.test(host ?? '');
app.use('*', async (c, next) => {
  if (!esAgro(c.req.header('host')) || c.req.path.startsWith('/api/')) return next();
  return serveStatic({ root: path.relative(process.cwd(), AGRO_DIR) })(c, async () => {
    c.header('Content-Type', 'text/html; charset=utf-8');
    c.res = c.body(readFileSync(path.join(AGRO_DIR, 'index.html'), 'utf8'));
  });
});

// Health check
app.get('/', (c) => c.json({ status: 'ok', service: 'EYWA API', version: '1.0.0' }));
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Rutas
app.route('/api/auth',            authRouter);
app.route('/api/users',           usersRouter);
app.route('/api/portfolio',       portfolioRouter);
app.route('/api/diagnostic',      diagnosticRouter);
app.route('/api/courses',         coursesRouter);
app.route('/api/organization',    organizationRouter);
app.route('/api/simbiocreacion',  simbiocreacionRouter);
app.route('/api/validator',       validatorRouter);
app.route('/api/certificates',    certificatesRouter);
app.route('/api/actors',          actorsRouter);
app.route('/api/dataroom',        dataroomRouter);
app.route('/api/media',           mediaRouter);
app.route('/api/funds',           fundsRouter);
app.route('/api/notifications',   notificationsRouter);
app.route('/api/stats',           statsRouter);

// API para sistemas de terceros: X-Api-Key en vez de sesión (§15).
app.route('/api/external/v1',     externalRouter);
// Capa pública de la misma API: sin clave, solo lectura de lo que ya es público (§9).
app.route('/api/public/v1',       publicApiRouter);
// Emisión, rotación y revocación de claves (superadmin).
app.route('/api/admin/api-clients', apiClientsRouter);
app.route('/api/agro',            agroRouter);

// Manejo global de errores
app.onError((err, c) => {
  if (err instanceof ApiError) {
    return c.json({ error: err.message }, err.status as 400 | 401 | 403 | 404 | 409 | 500);
  }
  console.error('[Error]', err);
  return c.json({ error: 'Error interno del servidor' }, 500);
});

app.notFound((c) => c.json({ error: 'Ruta no encontrada' }, 404));

const port = Number(process.env.PORT ?? 4001);
console.log(`🚀 EYWA API corriendo en http://localhost:${port}`);

serve({ fetch: app.fetch, port });

export default app;
