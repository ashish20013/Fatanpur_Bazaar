import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import type { MeResponse } from '@fb/shared-types';
import { setStaffMode } from '../services/storage';
import { AuthApi } from '../services/auth';
import { onUnauthorized, restoreTokens } from '../services/api';
import { connectSocket, disconnectSocket } from '../services/socket';
import { registerDeviceToken } from '../services/fcm';

type Status = 'loading' | 'authenticated' | 'unauthenticated';

export interface VerifyResult {
  user: MeResponse;
  /** True when the server created the account on this very verify (A3 step 7). */
  isNewUser: boolean;
}

interface AuthContextValue {
  status: Status;
  user: MeResponse | null;
  /**
   * The server created this account on the login that just happened, so there is no address on
   * file yet and the shop should offer to take one.
   *
   * ⚠️ It lives HERE, not in the OTP screen, because the whole navigator is replaced the moment
   * the status flips to 'authenticated' (RootNavigator swaps the guest stack for RoleNavigator).
   * The OTP screen is gone before it could navigate anywhere; this provider is above all of it
   * and survives, so the customer stack can read the flag when it mounts.
   */
  justRegistered: boolean;
  clearJustRegistered: () => void;
  /** A2 send OTP. Throws ApiError on failure — the screen shows `messageHi` directly. */
  sendOtp: (phone: string, purpose?: 'LOGIN' | 'STAFF_LOGIN') => Promise<{ expiresIn: number; resendAfter: number }>;
  verifyOtp: (phone: string, otp: string, name?: string, referralCode?: string) => Promise<VerifyResult>;
  logout: () => Promise<void>;
  /** Re-pulls /auth/me — used on resume and after anything that could change role/permissions. */
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<MeResponse | null>(null);
  const [justRegistered, setJustRegistered] = useState(false);
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
      // A5 non-negotiable: role is ALWAYS re-verified against the server on cold start —
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

  /**
   * OTP → session. Returns the signed-in user, and `isNewUser` so the screen can send a
   * first-time customer to fill in their address instead of dropping them on the shop.
   *
   * ⚠️ THE ONE RULE HERE: once `/auth/otp/verify` succeeds the person IS logged in — the OTP row
   * is consumed and cannot be used again. So nothing after that point may be allowed to throw.
   *
   * It used to `await AuthApi.me()` straight afterwards and let a failure reject the whole call.
   * On a slow 3G moment that left the customer staring at the OTP screen with an error, their
   * code already spent: pressing the button again answered "OTP गलत है। 0 कोशिश बची हैं।", and the
   * only way out was to wait out the 60-second resend or kill the app (after which they were, of
   * course, already logged in). That is the "after entering the OTP nothing happens" bug.
   *
   * Now the verify response itself puts us in the authenticated state — the role in it comes from
   * the same server as /auth/me, so it is no less trustworthy — and the fuller profile is fetched
   * afterwards, best-effort. If that fetch fails the person is in the shop with a provisional
   * profile and the next resume refreshes it.
   */
  const verifyOtp = useCallback(async (phone: string, otp: string, name?: string, referralCode?: string): Promise<VerifyResult> => {
    const res = await AuthApi.verifyOtp(phone, otp, name, referralCode);

    // Provisional: everything /auth/me adds is either cosmetic (referral code) or permission
    // data that only staff screens read, and those re-read it on mount.
    const provisional: MeResponse = {
      ...res.user,
      permissions: [],
      referralCode: null,
      phoneVerified: true,
      isGlobalAdmin: false,
    };
    setUser(provisional);
    setStatus('authenticated');
    connectSocket();
    void registerDeviceToken();

    // Best-effort, in this order: the real profile, then the guest cart merge. Neither may throw.
    setJustRegistered(res.isNewUser);
    const me = await AuthApi.me().catch(() => null);
    if (me) setUser(me);
    return { user: me ?? provisional, isNewUser: res.isNewUser };
  }, []);

  const logout = useCallback(async () => {
    await AuthApi.logout();
    setUser(null);
    setStatus('unauthenticated');
    setJustRegistered(false);
    disconnectSocket();
    // ⚠️ Forget which side of the app was in use. The shop's phone is shared — a rider logging
    // in after the owner must not be dropped into whatever the owner last had open.
    await setStaffMode(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      justRegistered,
      clearJustRegistered: () => setJustRegistered(false),
      sendOtp,
      verifyOtp,
      logout,
      refreshMe: () => loadMe().then(() => undefined),
    }),
    [status, user, justRegistered, sendOtp, verifyOtp, logout, loadMe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
