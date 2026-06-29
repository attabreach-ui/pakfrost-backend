import { Router, Request, Response } from 'express';
import prisma from '../../config/database';
import { authenticate } from '../../middleware/auth.middleware';
import { requireMinRole } from '../../middleware/rbac.middleware';
import { sendSuccess, sendNotFound, sendServerError } from '../../utils/response';
import { logger } from '../../utils/logger';

const router = Router();
router.use(authenticate);
router.use(requireMinRole('operator'));

// GET /movements — full history with filters
router.get('/', async (req: Request, res: Response) => {
  try {
    const { type, customerId, dateFrom, dateTo, search, page = '1', limit = '50' } = req.query;

    const pageNum  = Math.max(1, parseInt(String(page)));
    const pageSize = Math.min(200, Math.max(1, parseInt(String(limit))));
    const skip     = (pageNum - 1) * pageSize;

    const where: any = {
      ...(type       && { type       }),
      ...(customerId && { customerId: String(customerId) }),
      ...(dateFrom   && { createdAt: { gte: new Date(String(dateFrom)) } }),
      ...(dateTo     && { createdAt: { lte: new Date(String(dateTo))   } }),
      ...(search     && {
        OR: [
          { docNumber:   { contains: String(search), mode: 'insensitive' } },
          { customerName:{ contains: String(search), mode: 'insensitive' } },
          { productName: { contains: String(search), mode: 'insensitive' } },
          { vehicleNo:   { contains: String(search), mode: 'insensitive' } },
        ],
      }),
    };

    const [total, data] = await Promise.all([
      prisma.stockMovement.count({ where }),
      prisma.stockMovement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: { pallet: { select: { room: true, side: true, row: true, slot: true, expiryDate: true } } },
      }),
    ]);

    sendSuccess(res, {
      data,
      pagination: { total, page: pageNum, limit: pageSize, pages: Math.ceil(total / pageSize) },
    }, `${total} movements`);
  } catch (err) { logger.error('movements.getAll', err); sendServerError(res); }
});

// GET /movements/igp/:number — full IGP detail
router.get('/igp/:number', async (req: Request, res: Response) => {
  try {
    const igpNumber = req.params.number;
    const [pallets, movements] = await Promise.all([
      prisma.pallet.findMany({
        where:   { igpNumber },
        include: { product: true, customer: true },
      }),
      prisma.stockMovement.findMany({
        where:   { docNumber: igpNumber, type: 'IN' },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    if (pallets.length === 0) return sendNotFound(res, `IGP ${igpNumber} not found`);
    sendSuccess(res, { igpNumber, pallets, movements });
  } catch (err) { logger.error('movements.igp', err); sendServerError(res); }
});

// GET /movements/ogp/:number — full OGP detail
router.get('/ogp/:number', async (req: Request, res: Response) => {
  try {
    const ogpNumber = req.params.number;
    const movements = await prisma.stockMovement.findMany({
      where:   { docNumber: ogpNumber, type: 'OUT' },
      orderBy: { createdAt: 'asc' },
      include: { pallet: { select: { room: true, side: true, row: true, slot: true, weightPerCarton: true, expiryDate: true } } },
    });
    if (movements.length === 0) return sendNotFound(res, `OGP ${ogpNumber} not found`);
    sendSuccess(res, { ogpNumber, movements });
  } catch (err) { logger.error('movements.ogp', err); sendServerError(res); }
});

export default router;
