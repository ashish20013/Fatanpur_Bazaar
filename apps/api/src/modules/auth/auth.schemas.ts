import { z } from 'zod';

const phone = z.string().trim().regex(/^[6-9]\d{9}$/, 'मोबाइल नंबर 10 अंकों का होना चाहिए');

export const OtpSendSchema = z.object({
  phone,
  purpose: z.enum(['LOGIN', 'STAFF_LOGIN']).default('LOGIN'),
});
export type OtpSendDto = z.infer<typeof OtpSendSchema>;

/**
 * ⚠️ There is deliberately NO `role` field. z.object() strips unknown keys, so
 * { role: 'ADMIN' } never reaches the service (ROLE_PERMISSION_MATRIX §0, layer 2).
 */
export const OtpVerifySchema = z.object({
  phone,
  otp: z.string().trim().regex(/^\d{6}$/, 'OTP 6 अंकों का होता है'),
  name: z.string().trim().min(1).max(100).optional(),
  referralCode: z.string().trim().toUpperCase().regex(/^[A-Z2-9]{6,12}$/).optional(),
  deviceId: z.string().max(64).optional(),
  platform: z.enum(['WEB', 'ANDROID', 'IOS']).default('WEB'),
});
export type OtpVerifyDto = z.infer<typeof OtpVerifySchema>;

export const RefreshSchema = z.object({
  refreshToken: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  deviceId: z.string().max(64).optional(),
});
