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
import { ApiError } from '@/lib/auth-helpers';

const app = new Hono();

// Middlewares globales
app.use('*', logger());
app.use('*', corsMiddleware);

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

// Manejo global de errores
app.onError((err, c) => {
  if (err instanceof ApiError) {
    return c.json({ error: err.message }, err.status as 400 | 401 | 403 | 404 | 500);
  }
  console.error('[Error]', err);
  return c.json({ error: 'Error interno del servidor' }, 500);
});

app.notFound((c) => c.json({ error: 'Ruta no encontrada' }, 404));

const port = Number(process.env.PORT ?? 4001);
console.log(`🚀 EYWA API corriendo en http://localhost:${port}`);

serve({ fetch: app.fetch, port });

export default app;
