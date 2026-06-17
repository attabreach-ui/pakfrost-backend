import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import { createUserSchema, updateUserSchema, changePasswordSchema, adminSetPasswordSchema } from './users.schema';
import * as usersController from './users.controller';

const router = Router();
router.use(authenticate);

router.get('/',    requireRole('admin'), usersController.getAll);
router.get('/:id', requireRole('admin'), usersController.getOne);
router.post('/',   requireRole('admin'), validate(createUserSchema),       usersController.create);
router.put('/:id', requireRole('admin'), validate(updateUserSchema),        usersController.update);
router.delete('/:id', requireRole('admin'),                                 usersController.remove);

// Password — self or admin
router.put('/:id/password',       validate(changePasswordSchema),  usersController.changePassword);
router.put('/:id/password/reset', requireRole('admin'), validate(adminSetPasswordSchema), usersController.adminSetPassword);

export default router;
