import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import type { MeResponse } from '@fb/shared-types';
import { AuthApi } from '../services/auth';
import { onUnauthorized, restoreTokens } from '../services/api';
import { connectSocket, disconnectSocket } from '../services/socket';
import { registerDeviceToken } from '../services/fcm';

type Status = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  status: Status;
  user: MeResponse | null;
  /** A2 send OTP. Throws ApiError on failure — the screen shows `messageHi` directly. */
  sendOtp: (phone: string, purpose?: 'LOGIN' | 'STAFF_LOGIN') => Promise<{ expiresIn: number; resendAfter: number }>;
  verifyOtp: (phone: string, otp: string, name?: string, referralCode?: string) => Promise<MeResponse>;
  logout: () => Promise<void>;
  /** Re-pulls /auth/me — used on resume and after anything that could change role/permissions. */
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<MeResponse | null>(null);
  const bootstrapped = useRef(false);

  const loadMe = useCallback(async (): Promise<boolean> => {
    try {
      const me = await AuthApi.me();
      setUser(me);
      setStatus('authenticated');
      connectSocket();
      void registerDeviceToken();
      return true;
    } catch {
      setUser(null);
      setStatus('unauthenticated');
      disconnectSocket();
      return false;
    }
  }, []);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    void (async () => {
      const hadTokens = await restoreTokens();
      // §10 non-negotiable: role is ALWAYS re-verified against the server on cold start —
      // never trusted from anything cached locally.
      if (hadTokens) await loadMe();
      else setStatus('unauthenticated');
    })();
  }, [loadMe]);

  useEffect(() => {
    // A refresh-token reuse/expiry anywhere in the app funnels through this listener.
    return onUnauthorized(() => {
      setUser(null);
      setStatus('unauthenticated');
      disconnectSocket();
    });
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active' && status === 'authenticated') void loadMe();
    });
    return () => sub.remove();
  }, [status, loadMe]);

  const sendOtp = useCallback((phone: string, purpose: 'LOGIN' | 'STAFF_LOGIN' = 'LOGIN') => AuthApi.sendOtp(phone, purpose), []);

  const verifyOtp = useCallback(async (phone: string, otp: string, name?: string, referralCode?: string): Promise<MeResponse> => {
    await AuthApi.verifyOtp(phone, otp, name, referralCode);
    const me = await AuthApi.me();
    setUser(me);
    setStatus('authenticated');
    connectSocket();
    void registerDeviceToken();
    return me;
  }, []);

  const logout = useCallback(async () => {
    await AuthApi.logout();
    setUser(null);
    setStatus('unauthenticated');
    disconnectSocket();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, sendOtp, verifyOtp, logout, refreshMe: () => loadMe().then(() => undefined) }),
    [status, user, sendOtp, verifyOtp, logout, loadMe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
