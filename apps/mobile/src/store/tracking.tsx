import React, { createContext, useContext, useEffect, useState } from 'react';
import { getSocket } from '../services/socket';
import { useAuth } from './auth';

interface TrackingContextValue {
  /** Socket connection state — screens use this to grey out "live" badges (LIVE_TRACKING). */
  connected: boolean;
}

const TrackingContext = createContext<TrackingContextValue>({ connected: false });

/**
 * The socket itself connects/disconnects with auth state (see store/auth.tsx). This provider
 * only mirrors its connect/disconnect events into React state so any screen can show a small
 * "जुड़ रहे हैं…" indicator without each one re-wiring socket listeners for that alone.
 * Per-order subscriptions (tracking.snapshot, delivery.location.updated, …) are done directly
 * with `onSocketEvent` from services/socket.ts inside the screens that need them.
 */
export function TrackingProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { status } = useAuth();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (status !== 'authenticated') {
      setConnected(false);
      return;
    }
    const s = getSocket();
    if (!s) return;
    setConnected(s.connected);
    const onConnect = (): void => setConnected(true);
    const onDisconnect = (): void => setConnected(false);
    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
    };
  }, [status]);

  return <TrackingContext.Provider value={{ connected }}>{children}</TrackingContext.Provider>;
}

export function useTracking(): TrackingContextValue {
  return useContext(TrackingContext);
}
