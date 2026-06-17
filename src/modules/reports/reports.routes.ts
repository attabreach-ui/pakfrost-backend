import { Router, Request, Response } from 'express';
import prisma from '../../config/database';
import { authenticate } from '../../middleware/auth.middleware';
import { sendSuccess, sendServerError } from '../../utils/response';
import { logger } from '../../utils/logger';

const router = Router();
router.use(authenticate);

// GET /reports/stats — Dashboard main stats
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const now   = new Date();
    const d7    = new Date(); d7.setDate(d7.getDate() + 7);
    const d30   = new Date(); d30.setDate(d30.getDate() + 30);
    const today = new Date(); today.setHours(0, 0, 0, 0);

    const [
      totalPallets, totalCartons, totalWeight,
      expired, expiring7, expiring30,
      stockInToday, stockOutToday,
    ] = await Promise.all([
      prisma.pallet.count({ where: { status: 'active' } }),
      prisma.pallet.aggregate({ where: { status: 'active' }, _sum: { cartons: true } }),
      prisma.pallet.aggregate({ where: { status: 'active' }, _sum: { totalWeight: true } }),
      prisma.pallet.count({ where: { status: 'active', expiryDate: { lte: now } } }),
      prisma.pallet.count({ where: { status: 'active', expiryDate: { gt: now, lte: d7 } } }),
      prisma.pallet.count({ where: { status: 'active', expiryDate: { gt: now, lte: d30 } } }),
      prisma.stockMovement.aggregate({ where: { type: 'IN',  createdAt: { gte: today } }, _sum: { cartons: true } }),
      prisma.stockMovement.aggregate({ where: { type: 'OUT', createdAt: { gte: today } }, _sum: { cartons: true } }),
    ]);

    sendSuccess(res, {
      totalPallets,
      totalCartons:   totalCartons._sum.cartons    ?? 0,
      totalWeight:    Number(totalWeight._sum.totalWeight ?? 0),
      expired,
      expiring7Days:  expiring7,
      expiring30Days: expiring30,
      stockInToday:   stockInToday._sum.cartons  ?? 0,
      stockOutToday:  stockOutToday._sum.cartons ?? 0,
    });
  } catch (err) { logger.error('reports.stats', err); sendServerError(res); }
});

// GET /reports/chart — 7-day movement chart
router.get('/chart', async (req: Request, res: Response) => {
  try {
    const days = 7;
    const result = [];
    for (let i = days - 1; i >= 0; i--) {
      const start = new Date(); start.setDate(start.getDate() - i); start.setHours(0, 0, 0, 0);
      const end   = new Date(); end.setDate(end.getDate() - i);     end.setHours(23, 59, 59, 999);
      const [inn, out] = await Promise.all([
        prisma.stockMovement.aggregate({ where: { type: 'IN',  createdAt: { gte: start, lte: end } }, _sum: { cartons: true } }),
        prisma.stockMovement.aggregate({ where: { type: 'OUT', createdAt: { gte: start, lte: end } }, _sum: { cartons: true } }),
      ]);
      result.push({
        date: start.toISOString().slice(0, 10),
        in:   inn._sum.cartons  ?? 0,
        out:  out._sum.cartons ?? 0,
      });
    }
    sendSuccess(res, result, '7-day chart data');
  } catch (err) { logger.error('reports.chart', err); sendServerError(res); }
});

// GET /reports/stock-ledger — Customer wise stock summary
router.get('/stock-ledger', async (req: Request, res: Response) => {
  try {
    const { customerId } = req.query;
    const data = await prisma.pallet.groupBy({
      by:    ['customerId', 'customerName', 'productName', 'productCode'],
      where: {
        status: 'active',
        ...(customerId && { customerId: String(customerId) }),
      },
      _sum:   { cartons: true, totalWeight: true },
      _count: { id: true },
      orderBy: { customerName: 'asc' },
    });
    sendSuccess(res, data, `${data.length} stock ledger entries`);
  } catch (err) { logger.error('reports.stockLedger', err); sendServerError(res); }
});

// GET /reports/document-expiry — vehicles and drivers expiring soon
router.get('/document-expiry', async (req: Request, res: Response) => {
  try {
    const in30 = new Date(); in30.setDate(in30.getDate() + 30);
    const [vehicles, drivers, customers] = await Promise.all([
      prisma.vehicle.findMany({
        where: {
          status: 'active',
          OR: [
            { routePermitExpiry: { lte: in30 } },
            { tokenExpiry:       { lte: in30 } },
            { fitnessExpiry:     { lte: in30 } },
            { insuranceExpiry:   { lte: in30 } },
          ],
        },
      }),
      prisma.driver.findMany({
        where: { status: 'active', licenseExpiry: { lte: in30 } },
        orderBy: { licenseExpiry: 'asc' },
      }),
      prisma.customer.findMany({
        where: { isActive: true, contractExpiry: { lte: in30 } },
        orderBy: { contractExpiry: 'asc' },
      }),
    ]);
    sendSuccess(res, { vehicles, drivers, customers }, 'Document expiry alerts');
  } catch (err) { logger.error('reports.docExpiry', err); sendServerError(res); }
});

export default router;
