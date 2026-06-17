import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../../config/database';
import { validate } from '../../middleware/validate.middleware';
import { authenticate } from '../../middleware/auth.middleware';
import { requireMinRole } from '../../middleware/rbac.middleware';
import { sendSuccess, sendCreated, sendNotFound, sendError, sendServerError } from '../../utils/response';
import { logger } from '../../utils/logger';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const optDate   = z.string().regex(dateRegex, 'Use YYYY-MM-DD').optional();

const createSchema = z.object({
  vehicleNo:         z.string().min(1).max(20).trim().toUpperCase(),
  type:              z.enum(['Reefer_Truck', 'Container', 'Pickup', 'Van', 'Other']).default('Reefer_Truck'),
  ownership:         z.enum(['own', 'external']).default('own'),
  routePermitExpiry: optDate,
  tokenExpiry:       optDate,
  fitnessExpiry:     optDate,
  insuranceExpiry:   optDate,
  status:            z.enum(['active', 'inactive']).default('active'),
});
const updateSchema = createSchema.partial();

const toDate = (s?: string) => s ? new Date(s) : undefined;

const router = Router();
router.use(authenticate);

router.get('/', async (req: Request, res: Response) => {
  try {
    const { status } = req.query;
    const data = await prisma.vehicle.findMany({
      where:   status ? { status: status as any } : undefined,
      orderBy: { vehicleNo: 'asc' },
    });
    sendSuccess(res, data, `${data.length} vehicles`);
  } catch (err) { logger.error('vehicles.getAll', err); sendServerError(res); }
});

router.get('/expiring', async (_req: Request, res: Response) => {
  try {
    const in30 = new Date(); in30.setDate(in30.getDate() + 30);
    const data = await prisma.vehicle.findMany({
      where: {
        status: 'active',
        OR: [
          { routePermitExpiry: { lte: in30 } },
          { tokenExpiry:       { lte: in30 } },
          { fitnessExpiry:     { lte: in30 } },
          { insuranceExpiry:   { lte: in30 } },
        ],
      },
      orderBy: { vehicleNo: 'asc' },
    });
    sendSuccess(res, data, `${data.length} vehicles with expiring documents`);
  } catch (err) { logger.error('vehicles.expiring', err); sendServerError(res); }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const data = await prisma.vehicle.findUnique({ where: { id: req.params.id } });
    if (!data) return sendNotFound(res, 'Vehicle not found');
    sendSuccess(res, data);
  } catch (err) { logger.error('vehicles.getById', err); sendServerError(res); }
});

router.post('/', requireMinRole('supervisor'), validate(createSchema), async (req: Request, res: Response) => {
  try {
    const data = await prisma.vehicle.create({ data: {
      ...req.body,
      routePermitExpiry: toDate(req.body.routePermitExpiry),
      tokenExpiry:       toDate(req.body.tokenExpiry),
      fitnessExpiry:     toDate(req.body.fitnessExpiry),
      insuranceExpiry:   toDate(req.body.insuranceExpiry),
    }});
    logger.info(`Vehicle created: ${data.vehicleNo}`);
    sendCreated(res, data, 'Vehicle created');
  } catch (err: any) {
    if (err?.code === 'P2002') return sendError(res, 'Vehicle number already exists', 409);
    logger.error('vehicles.create', err); sendServerError(res);
  }
});

router.put('/:id', requireMinRole('supervisor'), validate(updateSchema), async (req: Request, res: Response) => {
  try {
    const data = await prisma.vehicle.update({
      where: { id: req.params.id },
      data: {
        ...req.body,
        routePermitExpiry: toDate(req.body.routePermitExpiry),
        tokenExpiry:       toDate(req.body.tokenExpiry),
        fitnessExpiry:     toDate(req.body.fitnessExpiry),
        insuranceExpiry:   toDate(req.body.insuranceExpiry),
      },
    });
    sendSuccess(res, data, 'Vehicle updated');
  } catch (err: any) {
    if (err?.code === 'P2025') return sendNotFound(res, 'Vehicle not found');
    logger.error('vehicles.update', err); sendServerError(res);
  }
});

router.delete('/:id', requireMinRole('admin'), async (req: Request, res: Response) => {
  try {
    await prisma.vehicle.delete({ where: { id: req.params.id } });
    sendSuccess(res, null, 'Vehicle deleted');
  } catch (err: any) {
    if (err?.code === 'P2025') return sendNotFound(res, 'Vehicle not found');
    logger.error('vehicles.delete', err); sendServerError(res);
  }
});

export default router;
