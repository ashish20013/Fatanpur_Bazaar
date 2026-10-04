import type { AuthResponse, MeResponse, OtpSendResponse } from '@fb/shared-types';
import { api, setTokens } from './api';
import { getOrCreateDeviceId } from './storage';
import { deactivateDeviceToken } from './fcm';

/** Thin wrapper over /auth/* — matches apps/api/src/modules/auth/auth.controller.ts exactly. */
export const AuthApi = {
  sendOtp(phone: string, purpose: 'LOGIN' | 'STAFF_LOGIN' = 'LOGIN'): Promise<OtpSendResponse> {
    return api.post<OtpSendResponse>('/auth/otp/send', { phone, purpose });
  },

  async verifyOtp(phone: string, otp: string, name?: string, referralCode?: string): Promise<AuthResponse> {
    const deviceId = await getOrCreateDeviceId();
    const res = await api.post<AuthResponse>('/auth/otp/verify', {
      phone,
      otp,
      name: name || undefined,
      referralCode: referralCode || undefined,
      deviceId,
      platform: 'ANDROID',
    });
    await setTokens({ accessToken: res.accessToken, refreshToken: res.refreshToken ?? '' });
    return res;
  },

  me(): Promise<MeResponse> {
    return api.get<MeResponse>('/auth/me');
  },

  /** Deactivates this device's FCM token first — a stale token would otherwise keep buzzing. */
  async logout(refreshToken?: string): Promise<void> {
    await deactivateDeviceToken().catch(() => undefined);
    await api.post('/auth/logout', { refreshToken }).catch(() => undefined); // logout must not get "stuck" on a flaky network
    await setTokens(null);
  },
};
