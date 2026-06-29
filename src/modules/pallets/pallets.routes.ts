import { Router, Request, Response } from 'express';
import prisma from '../../config/database';
import { authenticate } from '../../middleware/auth.middleware';
import { requireMinRole } from '../../middleware/rbac.middleware';
import { sendSuccess, sendNotFound, sendServerError } from '../../utils/response';
import { logger } from '../../utils/logger';

const router = Router();
router.use(authenticate);
router.use(requireMinRole('operator'));

// GET /pallets — all active pallets with filters
router.get('/', async (req: Request, res: Response) => {
  try {
    const { customerId, productId, room, status } = req.query;
    const data = await prisma.pallet.findMany({
      where: {
        ...(customerId && { customerId: String(customerId) }),
        ...(productId  && { productId:  String(productId)  }),
        ...(room       && { room:        String(room)       }),
        status: (status as any) || 'active',
      },
      include: {
        product:  { select: { id: true, name: true, code: true, category: true } },
        customer: { select: { id: true, name: true, code: true } },
      },
      orderBy: { dateIn: 'asc' },
    });
    sendSuccess(res, data, `${data.length} pallets`);
  } catch (err) { logger.error('pallets.getAll', err); sendServerError(res); }
});

// GET /pallets/fifo — FIFO sorted active pallets
router.get('/fifo', async (req: Request, res: Response) => {
  try {
    const { customerId, productId } = req.query;
    const data = await prisma.pallet.findMany({
      where: {
        status: 'active',
        ...(customerId && { customerId: String(customerId) }),
        ...(productId  && { productId:  String(productId)  }),
      },
      orderBy: { dateIn: 'asc' }, // oldest first = FIFO
      include: { product: { select: { name: true, code: true } }, customer: { select: { name: true, code: true } } },
    });
    sendSuccess(res, data, `${data.length} pallets (FIFO order)`);
  } catch (err) { logger.error('pallets.fifo', err); sendServerError(res); }
});

// GET /pallets/expiring — expiring within N days
router.get('/expiring', async (req: Request, res: Response) => {
  try {
    const days  = parseInt(String(req.query.days || '30'));
    const today = new Date();
    const limit = new Date(); limit.setDate(limit.getDate() + days);

    const expired  = await prisma.pallet.findMany({
      where: { status: 'active', expiryDate: { lte: today } },
      orderBy: { expiryDate: 'asc' },
      include: { customer: { select: { name: true, code: true } } },
    });

    const expiring = await prisma.pallet.findMany({
      where: { status: 'active', expiryDate: { gt: today, lte: limit } },
      orderBy: { expiryDate: 'asc' },
      include: { customer: { select: { name: true, code: true } } },
    });

    sendSuccess(res, { expired, expiring, days }, `${expired.length} expired, ${expiring.length} expiring in ${days} days`);
  } catch (err) { logger.error('pallets.expiring', err); sendServerError(res); }
});

// GET /pallets/location — pallets at a specific slot
router.get('/location', async (req: Request, res: Response) => {
  try {
    const { room, side, row, slot } = req.query;
    if (!room || !side || !row || !slot) {
      return sendSuccess(res, [], 'Provide room, side, row, slot query params');
    }
    const data = await prisma.pallet.findMany({
      where: { status: 'active', room: String(room), side: String(side), row: String(row), slot: String(slot) },
    });
    sendSuccess(res, data, `${data.length} pallets at location`);
  } catch (err) { logger.error('pallets.location', err); sendServerError(res); }
});

// GET /pallets/:id — single pallet detail
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const data = await prisma.pallet.findUnique({
      where: { id: req.params.id },
      include: {
        product:   { select: { name: true, code: true, category: true } },
        customer:  { select: { name: true, code: true } },
        movements: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!data) return sendNotFound(res, 'Pallet not found');
    sendSuccess(res, data);
  } catch (err) { logger.error('pallets.getById', err); sendServerError(res); }
});

export default router;
