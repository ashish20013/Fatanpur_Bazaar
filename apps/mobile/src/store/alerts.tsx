import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, NativeModules, Platform, Vibration } from 'react-native';
import { api } from '../services/api';
import { onAlert } from '../services/socket';
import { useAuth } from './auth';

/**
 * Native ringing and the lock-screen card. Absent in a build without the module (and on iOS),
 * so every call is optional — the in-app card still works, it just does not ring.
 */
const OrderAlert = NativeModules.OrderAlert as
  | {
      createChannels: () => Promise<boolean>;
      canFullScreen: () => Promise<boolean>;
      isLocked: () => Promise<boolean>;
      showIncoming: (p: { orderNumber: string; title: string; body: string; urgent?: boolean }) => Promise<boolean>;
      cancel: () => Promise<boolean>;
      startRinging: (loop: boolean, vibrate: boolean) => Promise<boolean>;
      stopRinging: () => Promise<boolean>;
    }
  | undefined;

export interface IncomingOrder {
  orderNumber: string;
  customer?: string;
  customerPhone?: string;
  address?: string;
  village?: string | null;
  amount?: string;
  paymentMethod?: string;
  items?: number;
  status?: string;
  placedAt?: string;
  /** ISO. Empty or absent means "until it is answered". */
  expiresAt?: string;
  ringtone?: boolean;
  vibration?: boolean;
}

export interface InfoAlert extends IncomingOrder {
  autoDismissSec?: number;
}

export interface Escalation extends IncomingOrder {
  cause?: string;
  arrangingBy?: string | null;
}

interface AlertState {
  /** The ringing one. Only ever set for a delivery partner. */
  incoming: IncomingOrder | null;
  /** The quiet one, for admins and supervisors. No actions, dismisses itself. */
  info: InfoAlert | null;
  /** An order nobody has taken. */
  escalation: Escalation | null;
  accept: (orderNumber: string) => Promise<void>;
  reject: (orderNumber: string, reason?: string) => Promise<void>;
  dismissIncoming: () => void;
  dismissInfo: () => void;
  dismissEscalation: () => void;
  /** Dev/diagnostic: show a card without waiting for an order. */
  simulate: (o: IncomingOrder) => void;
}

/**
 * Turns a socket payload into an order card, or into nothing.
 *
 * ⚠️ This arrives over a socket, so its shape is a claim rather than a fact. An alert with no
 * order number is not an alert — it is a card the rider cannot act on, with a ringtone attached
 * — so it is dropped rather than rendered half-empty. Every other field is optional and the card
 * simply omits what is missing.
 */
function parseOrder(p: Record<string, unknown>): IncomingOrder | null {
  const orderNumber = typeof p.orderNumber === 'string' ? p.orderNumber.trim() : '';
  if (!orderNumber) return null;
  const str = (k: string): string | undefined => (typeof p[k] === 'string' ? (p[k] as string) : undefined);
  const num = (k: string): number | undefined => (typeof p[k] === 'number' ? (p[k] as number) : undefined);
  const bool = (k: string): boolean | undefined => (typeof p[k] === 'boolean' ? (p[k] as boolean) : undefined);
  return {
    orderNumber,
    customer: str('customer'),
    customerPhone: str('customerPhone'),
    address: str('address'),
    village: str('village') ?? null,
    amount: str('amount'),
    paymentMethod: str('paymentMethod'),
    items: num('items'),
    status: str('status'),
    placedAt: str('placedAt'),
    expiresAt: str('expiresAt'),
    ringtone: bool('ringtone'),
    vibration: bool('vibration'),
  };
}

const Ctx = createContext<AlertState>({
  incoming: null,
  info: null,
  escalation: null,
  accept: async () => undefined,
  reject: async () => undefined,
  dismissIncoming: () => undefined,
  dismissInfo: () => undefined,
  dismissEscalation: () => undefined,
  simulate: () => undefined,
});

/**
 * One place that decides what the phone does when an order arrives.
 *
 * ⚠️ The ring and the buzz are started and stopped HERE, not in the screen that draws the card.
 * A screen can be unmounted by navigation, by the app going to the background, or by a re-render,
 * and a ringtone whose stop() lives in a component's cleanup is a ringtone that eventually gets
 * left on. Every path out of an alert — accept, reject, expiry, dismissal, logout, the app being
 * backgrounded — goes through `silence()`.
 *
 * ⚠️ The role split is enforced here too: `incoming` is only ever set for a DELIVERY_BOY, and
 * `info` only for the people who are watching. An admin's phone cannot be made to show an
 * accept button by anything the server sends, because this is the only code that can set it.
 */
export function AlertProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { user } = useAuth();
  const [incoming, setIncoming] = useState<IncomingOrder | null>(null);
  const [info, setInfo] = useState<InfoAlert | null>(null);
  const [escalation, setEscalation] = useState<Escalation | null>(null);
  const ringing = useRef(false);
  const infoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expiryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isRider = user?.role === 'DELIVERY_BOY';
  const isWatcher = user?.role === 'ADMIN' || user?.role === 'SUPERVISOR';

  const silence = useCallback((): void => {
    if (!ringing.current) return;
    ringing.current = false;
    void OrderAlert?.stopRinging().catch(() => undefined);
    Vibration.cancel();
    void OrderAlert?.cancel().catch(() => undefined);
  }, []);

  const ring = useCallback((withSound: boolean, withBuzz: boolean, loop: boolean): void => {
    ringing.current = true;
    if (OrderAlert) {
      void OrderAlert.startRinging(loop, withBuzz).catch(() => undefined);
      return;
    }
    // No native module (an older build): at least buzz, which JS can do on its own.
    if (withBuzz) Vibration.vibrate(loop ? [0, 600, 400, 600] : [0, 400], loop);
  }, []);

  /** Channels have to exist before the first push, so do it once at startup. */
  useEffect(() => {
    if (Platform.OS === 'android') void OrderAlert?.createChannels().catch(() => undefined);
  }, []);

  const clearExpiry = (): void => {
    if (expiryTimer.current) clearTimeout(expiryTimer.current);
    expiryTimer.current = null;
  };

  const dismissIncoming = useCallback((): void => {
    clearExpiry();
    silence();
    setIncoming(null);
  }, [silence]);

  const dismissInfo = useCallback((): void => {
    if (infoTimer.current) clearTimeout(infoTimer.current);
    infoTimer.current = null;
    silence();
    setInfo(null);
  }, [silence]);

  const dismissEscalation = useCallback((): void => {
    silence();
    setEscalation(null);
  }, [silence]);

  const showIncoming = useCallback(
    (o: IncomingOrder): void => {
      if (!isRider) return; // never on a watcher's phone, whatever arrives
      clearExpiry();
      setIncoming(o);
      ring(o.ringtone !== false, o.vibration !== false, true);
      if (o.expiresAt) {
        const ms = new Date(o.expiresAt).getTime() - Date.now();
        if (ms > 0) {
          expiryTimer.current = setTimeout(() => {
            // Expired: stop ringing and take the card away. The order goes back to whoever is
            // still free, and the shop's escalation has already been armed server-side.
            silence();
            setIncoming(null);
          }, ms);
        }
      }
    },
    [isRider, ring, silence],
  );

  const showInfoAlert = useCallback(
    (o: InfoAlert): void => {
      if (!isWatcher) return;
      if (infoTimer.current) clearTimeout(infoTimer.current);
      setInfo(o);
      ring(o.ringtone !== false, o.vibration !== false, false);
      const sec = o.autoDismissSec && o.autoDismissSec > 0 ? o.autoDismissSec : 10;
      infoTimer.current = setTimeout(() => {
        silence();
        setInfo(null);
      }, sec * 1000);
    },
    [isWatcher, ring, silence],
  );

  // ── socket: the path that works while the app is open ──
  useEffect(() => {
    if (!user) return;
    const offs = [
      onAlert('alert.incoming_order', (p) => {
        const o = parseOrder(p);
        if (o) showIncoming(o);
      }),
      onAlert('alert.order_info', (p) => {
        const o = parseOrder(p);
        if (o) showInfoAlert({ ...o, autoDismissSec: typeof p.autoDismissSec === 'number' ? p.autoDismissSec : undefined });
      }),
      onAlert('alert.order_unassigned', (p) => {
        if (!isWatcher) return;
        const o = parseOrder(p);
        if (!o) return;
        setEscalation({ ...o, cause: typeof p.cause === 'string' ? p.cause : undefined, arrangingBy: typeof p.arrangingBy === 'string' ? p.arrangingBy : null });
        ring(o.ringtone !== false, o.vibration !== false, false);
      }),
      onAlert('alert.escalation.resolved', (p) => {
        const orderNumber = typeof p.orderNumber === 'string' ? p.orderNumber : '';
        if (!orderNumber) return;
        setEscalation((e) => (e && e.orderNumber === orderNumber ? null : e));
        setIncoming((i) => {
          if (i && i.orderNumber === orderNumber) {
            silence();
            return null;
          }
          return i;
        });
      }),
      onAlert('alert.escalation.arranging', (p) => {
        const orderNumber = typeof p.orderNumber === 'string' ? p.orderNumber : '';
        const arrangingBy = typeof p.arrangingBy === 'string' ? p.arrangingBy : null;
        if (!orderNumber) return;
        setEscalation((e) => (e && e.orderNumber === orderNumber ? { ...e, arrangingBy } : e));
      }),
      // Somebody else took it — stop ringing this phone at once.
      onAlert('pool.order.gone', (p) => {
        const orderNumber = typeof p.orderNumber === 'string' ? p.orderNumber : '';
        if (!orderNumber) return;
        setIncoming((i) => {
          if (i && i.orderNumber === orderNumber) {
            silence();
            return null;
          }
          return i;
        });
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [user, showIncoming, showInfoAlert, isWatcher, ring, silence]);

  /*
   * Going to the background stops the sound.
   *
   * ⚠️ Not the alert — the notification the native side posted is what carries it from here, and
   * that one has the system's own sound and its own buttons. What must not happen is two things
   * ringing at once, or this app's MediaPlayer playing on from a process the rider has left.
   */
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') silence();
    });
    return () => sub.remove();
  }, [silence]);

  /** Logging out must never leave a phone ringing about somebody else's order. */
  useEffect(() => {
    if (!user) {
      clearExpiry();
      if (infoTimer.current) clearTimeout(infoTimer.current);
      silence();
      setIncoming(null);
      setInfo(null);
      setEscalation(null);
    }
  }, [user, silence]);

  const accept = useCallback(
    async (orderNumber: string): Promise<void> => {
      // Silence FIRST: the server call can take a second on a village connection, and a phone
      // that keeps screaming after the rider has pressed accept is the complaint everyone has
      // about these apps.
      dismissIncoming();
      await api.post(`/delivery/claim/${orderNumber}`, {});
    },
    [dismissIncoming],
  );

  const reject = useCallback(
    async (orderNumber: string, reason = ''): Promise<void> => {
      dismissIncoming();
      await api.post(`/delivery/decline/${orderNumber}`, { reason });
    },
    [dismissIncoming],
  );

  const value = useMemo<AlertState>(
    () => ({ incoming, info, escalation, accept, reject, dismissIncoming, dismissInfo, dismissEscalation, simulate: showIncoming }),
    [incoming, info, escalation, accept, reject, dismissIncoming, dismissInfo, dismissEscalation, showIncoming],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAlerts(): AlertState {
  return useContext(Ctx);
}
