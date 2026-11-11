import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, LocationPing, ServerToClientEvents } from '@fb/shared-types';
import { CONFIG } from '../config';
import { accessTokenValue } from './api';

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
let socket: AppSocket | null = null;

/**
 * A20: the token is sent in the handshake `auth` payload (never the query string), as a
 * FUNCTION so socket.io-client re-reads it on every (re)connect — a token refreshed after
 * the socket was first opened is picked up automatically, no manual reconnect needed.
 */
export function connectSocket(): AppSocket {
  if (socket) return socket;
  socket = io(CONFIG.socketUrl, {
    path: CONFIG.socketPath,
    transports: ['websocket', 'polling'],
    autoConnect: true,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    auth: (cb) => cb({ token: accessTokenValue() }),
  });
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}

export function getSocket(): AppSocket | null {
  return socket;
}

/** ⚠️ There is no client-side "join a room" call anywhere — the server assigns rooms (A20). */
export function sendLocation(ping: LocationPing): void {
  socket?.emit('delivery.location', ping);
}

export function onSocketEvent<K extends keyof ServerToClientEvents>(event: K, handler: ServerToClientEvents[K]): () => void {
  const s = connectSocket();
  s.on(event, handler as never);
  return () => {
    s.off(event, handler as never);
  };
}

/**
 * Alert events, by name.
 *
 * ⚠️ Deliberately untyped at the edge, and deliberately NOT added to `@fb/shared-types`: that
 * package is shared with the live website, and the order-alert events belong to the app alone.
 * Widening a shared contract to save a cast here would mean rebuilding the website to add
 * events it will never listen for. The payloads are validated where they are used (the alert
 * store reads only the fields it needs and tolerates their absence), which is the right place
 * for it anyway — this data comes off a socket and is not to be trusted by shape alone.
 */
export function onAlert(event: string, handler: (payload: Record<string, unknown>) => void): () => void {
  const s = connectSocket();
  const wrapped = (payload: unknown): void => {
    handler(payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {});
  };
  s.on(event as never, wrapped as never);
  return () => {
    s.off(event as never, wrapped as never);
  };
}
