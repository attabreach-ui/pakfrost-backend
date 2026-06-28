import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../../config/database';
import { validate } from '../../middleware/validate.middleware';
import { authenticate } from '../../middleware/auth.middleware';
import { requireMinRole } from '../../middleware/rbac.middleware';
import { sendSuccess, sendCreated, sendNotFound, sendError, sendServerError } from '../../utils/response';
import { logger } from '../../utils/logger';

// ── Schema ──────────────────────────────────────────────────────────────────
const createSchema = z.object({
  customerId:      z.string().uuid('Invalid customer ID'),
  name:            z.string().min(1).max(100).trim(),
  code:            z.string().min(1).max(30).trim().toUpperCase(),
  category:        z.string().max(50).trim().optional().default(''),
  cartonsPerPallet: z.number().int().min(0).default(0),
  weightPerCarton: z.number().positive('Weight must be positive'),
  uom:             z.enum(['Kg', 'Lbs']).default('Kg'),
});
const updateSchema = createSchema.partial();

// ── Router ──────────────────────────────────────────────────────────────────
const router = Router();
router.use(authenticate);

router.get('/', async (req: Request, res: Response) => {
  try {
    const { customerId } = req.query;
    const data = await prisma.product.findMany({
      where:   customerId ? { customerId: String(customerId) } : undefined,
      include: { customer: { select: { id: true, name: true, code: true } } },
      orderBy: { name: 'asc' },
    });
    sendSuccess(res, data, `${data.length} products`);
  } catch (err) { logger.error('products.getAll', err); sendServerError(res); }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const data = await prisma.product.findUnique({
      where:   { id: req.params.id },
      include: { customer: { select: { id: true, name: true, code: true } } },
    });
    if (!data) return sendNotFound(res, 'Product not found');
    sendSuccess(res, data);
  } catch (err) { logger.error('products.getById', err); sendServerError(res); }
});

router.post('/', requireMinRole('supervisor'), validate(createSchema), async (req: Request, res: Response) => {
  try {
    const data = await prisma.product.create({ data: req.body });
    logger.info(`Product created: ${data.name}`);
    sendCreated(res, data, 'Product created');
  } catch (err: any) {
    if (err?.code === 'P2002') return sendError(res, 'Product code already exists', 409);
    if (err?.code === 'P2003') return sendError(res, 'Customer not found', 404);
    logger.error('products.create', err); sendServerError(res);
  }
});

router.put('/:id', requireMinRole('supervisor'), validate(updateSchema), async (req: Request, res: Response) => {
  try {
    const data = await prisma.product.update({ where: { id: req.params.id }, data: req.body });
    sendSuccess(res, data, 'Product updated');
  } catch (err: any) {
    if (err?.code === 'P2025') return sendNotFound(res, 'Product not found');
    logger.error('products.update', err); sendServerError(res);
  }
});

router.delete('/:id', requireMinRole('admin'), async (req: Request, res: Response) => {
  try {
    await prisma.product.delete({ where: { id: req.params.id } });
    sendSuccess(res, null, 'Product deleted');
  } catch (err: any) {
    if (err?.code === 'P2025') return sendNotFound(res, 'Product not found');
    if (err?.code === 'P2003') return sendError(res, 'Cannot delete — product has related pallets', 409);
    logger.error('products.delete', err); sendServerError(res);
  }
});

export default router;
