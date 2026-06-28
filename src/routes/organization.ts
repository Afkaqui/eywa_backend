import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '@/middleware/auth';
import { getRequestUser, ApiError } from '@/lib/auth-helpers';
import { OrganizationRepository } from '@/repositories/organization-repository';
import { db } from '@/lib/db';

export const organizationRouter = new Hono();
const orgRepo = new OrganizationRepository(db);

organizationRouter.use('*', authMiddleware);

const orgSchema = z.object({
  type:            z.string().optional(),
  institutionType: z.string().optional().nullable(),
  name:            z.string().min(1),
  description:     z.string().optional().nullable(),
  phone:           z.string().optional().nullable(),
  website:         z.string().optional().nullable(),
  externalLinks:   z.array(z.string()).optional(),
  country:         z.string().optional().nullable(),
  sector:          z.string().optional().nullable(),
});

// GET /api/organization
organizationRouter.get('/', async (c) => {
  const user = getRequestUser(c);
  const org = await orgRepo.findByUser(user.sub);
  return c.json({ organization: org ?? null });
});

// PUT /api/organization
organizationRouter.put('/', async (c) => {
  const user = getRequestUser(c);
  const body = await c.req.json();
  const parsed = orgSchema.safeParse(body);
  if (!parsed.success) throw new ApiError(400, parsed.error.errors[0]?.message ?? 'Datos invalidos');

  const org = await orgRepo.upsert(user.sub, parsed.data);
  return c.json({ organization: org });
});
