// ── Schema ─────────────────────────────────────────────────────────────────
import { z } from 'zod';

export const createCustomerSchema = z.object({
  name:            z.string().min(1).max(100).trim(),
  code:            z.string().min(1).max(20).trim().toUpperCase(),
  contactPerson:   z.string().max(100).optional(),
  phone:           z.string().max(20).optional(),
  email:           z.string().email().optional().or(z.literal('')),
  address:         z.string().optional(),
  tempRequirement: z.string().max(50).optional(),
  contractExpiry:  z.string().datetime().optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  isActive:        z.boolean().default(true),
});

export const updateCustomerSchema = createCustomerSchema.partial();
export type CreateCustomerDto = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerDto = z.infer<typeof updateCustomerSchema>;
