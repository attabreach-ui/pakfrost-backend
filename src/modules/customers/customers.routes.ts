import { Router, Request, Response } from 'express';
import * as svc from './customers.service';
import { validate } from '../../middleware/validate.middleware';
import { authenticate } from '../../middleware/auth.middleware';
import { requireMinRole } from '../../middleware/rbac.middleware';
import { createCustomerSchema, updateCustomerSchema } from './customers.schema';
import { sendSuccess, sendCreated, sendNotFound, sendError, sendServerError } from '../../utils/response';
import { logger } from '../../utils/logger';

const router = Router();
router.use(authenticate);

router.get('/', async (req: Request, res: Response) => {
  try {
    const activeOnly = req.query.active === 'true';
    const data = await svc.getAll(activeOnly);
    sendSuccess(res, data, `${data.length} customers`);
  } catch (err) { logger.error('customers.getAll', err); sendServerError(res); }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const data = await svc.getById(req.params.id);
    if (!data) return sendNotFound(res, 'Customer not found');
    sendSuccess(res, data);
  } catch (err) { logger.error('customers.getById', err); sendServerError(res); }
});

router.post('/', requireMinRole('supervisor'), validate(createCustomerSchema), async (req: Request, res: Response) => {
  try {
    const data = await svc.create(req.body);
    logger.info(`Customer created: ${data.name}`);
    sendCreated(res, data, 'Customer created');
  } catch (err: any) {
    if (err?.code === 'P2002') return sendError(res, 'Customer code already exists', 409);
    logger.error('customers.create', err); sendServerError(res);
  }
});

router.put('/:id', requireMinRole('supervisor'), validate(updateCustomerSchema), async (req: Request, res: Response) => {
  try {
    const data = await svc.update(req.params.id, req.body);
    sendSuccess(res, data, 'Customer updated');
  } catch (err: any) {
    if (err?.code === 'P2025') return sendNotFound(res, 'Customer not found');
    logger.error('customers.update', err); sendServerError(res);
  }
});

router.delete('/:id', requireMinRole('admin'), async (req: Request, res: Response) => {
  try {
    await svc.remove(req.params.id);
    sendSuccess(res, null, 'Customer deleted');
  } catch (err: any) {
    if (err?.code === 'P2025') return sendNotFound(res, 'Customer not found');
    if (err?.code === 'P2003') return sendError(res, 'Cannot delete — customer has related pallets or products', 409);
    logger.error('customers.delete', err); sendServerError(res);
  }
});

export default router;
