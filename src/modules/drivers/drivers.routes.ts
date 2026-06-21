import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../../config/database';
import { validate } from '../../middleware/validate.middleware';
import { authenticate } from '../../middleware/auth.middleware';
import { requireMinRole } from '../../middleware/rbac.middleware';
import { sendSuccess, sendCreated, sendNotFound, sendError, sendServerError } from '../../utils/response';
import { logger } from '../../utils/logger';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const createSchema = z.object({
  name:          z.string().min(1).max(100).trim(),
  code:          z.string().min(1).max(20).trim().toUpperCase(),
  cnic:          z.string().max(20).trim().optional().default(''),
  phone:         z.string().max(20).trim().optional().default(''),
  licenseNo:     z.string().max(30).trim().optional().default(''),
  licenseExpiry: z.string().regex(dateRegex, 'Use YYYY-MM-DD format').optional(),
  joiningDate:   z.string().regex(dateRegex, 'Use YYYY-MM-DD format').optional(),
  status:        z.enum(['active', 'inactive']).default('active'),
});
const updateSchema = createSchema.partial();

const router = Router();
router.use(authenticate);

router.get('/', async (req: Request, res: Response) => {
  try {
    const { status } = req.query;
    const data = await prisma.driver.findMany({
      where:   status ? { status: status as any } : undefined,
      orderBy: { name: 'asc' },
    });
    sendSuccess(res, data, `${data.length} drivers`);
  } catch (err) { logger.error('drivers.getAll', err); sendServerError(res); }
});

router.get('/expiring', async (_req: Request, res: Response) => {
  try {
    const in30 = new Date(); in30.setDate(in30.getDate() + 30);
    const data = await prisma.driver.findMany({
      where:   { licenseExpiry: { lte: in30 }, status: 'active' },
      orderBy: { licenseExpiry: 'asc' },
    });
    sendSuccess(res, data, `${data.length} drivers with expiring licenses`);
  } catch (err) { logger.error('drivers.expiring', err); sendServerError(res); }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const data = await prisma.driver.findUnique({ where: { id: req.params.id } });
    if (!data) return sendNotFound(res, 'Driver not found');
    sendSuccess(res, data);
  } catch (err) { logger.error('drivers.getById', err); sendServerError(res); }
});

router.post('/', requireMinRole('supervisor'), validate(createSchema), async (req: Request, res: Response) => {
  try {
    const data = await prisma.driver.create({ data: {
      ...req.body,
      licenseExpiry: req.body.licenseExpiry ? new Date(req.body.licenseExpiry) : new Date('2099-12-31'),
      joiningDate:   req.body.joiningDate ? new Date(req.body.joiningDate) : undefined,
    }});
    logger.info(`Driver created: ${data.name}`);
    sendCreated(res, data, 'Driver created');
  } catch (err: any) {
    if (err?.code === 'P2002') return sendError(res, 'Driver code already exists', 409);
    logger.error('drivers.create', err); sendServerError(res);
  }
});

router.put('/:id', requireMinRole('supervisor'), validate(updateSchema), async (req: Request, res: Response) => {
  try {
    const data = await prisma.driver.update({
      where: { id: req.params.id },
      data: {
        ...req.body,
        licenseExpiry: req.body.licenseExpiry ? new Date(req.body.licenseExpiry) : undefined,
        joiningDate:   req.body.joiningDate   ? new Date(req.body.joiningDate)   : undefined,
      },
    });
    sendSuccess(res, data, 'Driver updated');
  } catch (err: any) {
    if (err?.code === 'P2025') return sendNotFound(res, 'Driver not found');
    logger.error('drivers.update', err); sendServerError(res);
  }
});

router.delete('/:id', requireMinRole('admin'), async (req: Request, res: Response) => {
  try {
    await prisma.driver.delete({ where: { id: req.params.id } });
    sendSuccess(res, null, 'Driver deleted');
  } catch (err: any) {
    if (err?.code === 'P2025') return sendNotFound(res, 'Driver not found');
    logger.error('drivers.delete', err); sendServerError(res);
  }
});

export default router;
