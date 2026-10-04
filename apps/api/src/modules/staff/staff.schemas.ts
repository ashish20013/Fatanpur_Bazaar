import { z } from 'zod';
import { ALL_PERMISSIONS } from '@fb/shared-types';

export const CreateStaffSchema = z.object({
  phone: z.string().trim().regex(/^[6-9]\d{9}$/),
  name: z.string().trim().min(2).max(100),
  // CUSTOMER can never be created here; public registration is the only path for customers.
  role: z.enum(['SUPERVISOR', 'DELIVERY_BOY', 'ADMIN']),
  employeeCode: z.string().trim().regex(/^[A-Z0-9-]{3,20}$/).optional(),
  vehicleType: z.enum(['CYCLE', 'BIKE', 'SCOOTER', 'OTHER']).optional(),
  designation: z.string().trim().max(80).optional(),
  vehicleNumber: z.string().trim().max(20).optional(),
  supervisorId: z.number().int().positive().optional(),
  permissions: z.array(z.enum(ALL_PERMISSIONS as [string, ...string[]])).max(40).optional(),
});
export type CreateStaffDto = z.infer<typeof CreateStaffSchema>;

export const DisableSchema = z.object({ reason: z.string().trim().min(3).max(255) });
export const RoleChangeSchema = z.object({ role: z.enum(['SUPERVISOR', 'DELIVERY_BOY', 'ADMIN', 'CUSTOMER']), reason: z.string().trim().min(3).max(255) });
export const PermissionsSchema = z.object({
  grants: z.array(z.object({ code: z.enum(ALL_PERMISSIONS as [string, ...string[]]), granted: z.boolean() })).max(40),
});
