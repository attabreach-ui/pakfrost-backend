import { Router, Request, Response } from 'express';
import prisma from '../../config/database';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { sendServerError, sendSuccess } from '../../utils/response';
import { logger } from '../../utils/logger';

const router = Router();

router.use(authenticate);
router.use(requireRole('admin'));

router.post('/reset-data', async (_req: Request, res: Response) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const stockMovements = await tx.stockMovement.deleteMany();
      const pallets = await tx.pallet.deleteMany();
      const temperatures = await tx.temperatureReading.deleteMany();
      const products = await tx.product.deleteMany();
      const customers = await tx.customer.deleteMany();
      const drivers = await tx.driver.deleteMany();
      const vehicles = await tx.vehicle.deleteMany();
      const counters = await tx.docCounter.deleteMany();
      const snapshots = await tx.gatePassSnapshot.deleteMany();

      return {
        stockMovements: stockMovements.count,
        pallets: pallets.count,
        temperatures: temperatures.count,
        products: products.count,
        customers: customers.count,
        drivers: drivers.count,
        vehicles: vehicles.count,
        counters: counters.count,
        snapshots: snapshots.count,
      };
    });

    logger.warn('Admin reset all operational data', result);
    sendSuccess(res, result, 'All operational data reset. Users were preserved.');
  } catch (err) {
    logger.error('admin.reset-data', err);
    sendServerError(res);
  }
});

export default router;
