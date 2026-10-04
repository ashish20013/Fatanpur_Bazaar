import { Inject, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer, type OnGatewayConnection, type OnGatewayDisconnect, type OnGatewayInit } from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import type { Server, Socket } from 'socket.io';
import { ORDER_STATUS_LABEL_HI, type OrderStatus, type Permission, type Role } from '@fb/shared-types';
import { Log } from '../../common/logger';
import { ENV, type Env } from '../../config/config.module';
import { IdentityService } from '../identity/identity.service';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notifications/notification.service';
import { OrdersQueryService } from '../orders/orders-query.service';
import { OrderEvents } from '../orders/order-events';
import { SettingsService } from '../settings/settings.service';
import { TrackingService } from './tracking.service';

interface SocketUser {
  id: number;
  role: Role;
  perms: Set<Permission>;
  isGlobalAdmin: boolean;
}
const ALLOWED_CLIENT_EVENTS = new Set(['delivery.location', 'client.ping']);
const MAX_SOCKETS_PER_USER = 3;
const MAX_STRIKES = 3;

/**
 * A20 — Socket.IO. Auth in the handshake (token in `auth`, never the query string), user reloaded
 * from the DB, rooms decided ONLY by the server. There is intentionally no 'join' handler.
 */
@WebSocketGateway({
  path: process.env.SOCKET_PATH ?? '/socket',
  transports: (process.env.SOCKET_TRANSPORTS ?? 'websocket,polling').split(',').map((t) => t.trim()) as ('websocket' | 'polling')[],
  cors: { origin: (process.env.ALLOWED_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean), credentials: true },
  pingInterval: Number(process.env.SOCKET_PING_INTERVAL ?? 25000),
  maxHttpBufferSize: Number(process.env.SOCKET_MAX_HTTP_BUFFER ?? 8192),
  serveClient: false,
})
export class TrackingGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy {
  @WebSocketServer() server!: Server;
  private readonly userSockets = new Map<number, string[]>();
  private readonly strikes = new Map<string, number>();
  private staleTimer: NodeJS.Timeout | null = null;
  private readonly staleNotified = new Set<number>();
  private readonly offlineNotified = new Set<number>();

  constructor(
    private readonly jwt: JwtService,
    private readonly identity: IdentityService,
    private readonly tracking: TrackingService,
    private readonly orders: OrdersQueryService,
    private readonly audit: AuditService,
    private readonly notify: NotificationService,
    private readonly events: OrderEvents,
    private readonly settings: SettingsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onModuleInit(): void {
    this.events.onOrderPlaced((e) => {
      this.server?.to('ops:orders').emit('ops.order.new', { orderNumber: e.orderNumber, total: e.total, village: e.village });
      this.joinUserToOrder(e.userId, e.orderNumber);
    });
    this.notify.socketEmitter = (userId, payload) => this.server?.to(`user:${userId}`).emit('notification.new', payload);
  }

  onModuleDestroy(): void {
    if (this.staleTimer) clearInterval(this.staleTimer);
  }

  afterInit(server: Server): void {
    server.use((socket, next) => {
      void this.authenticate(socket)
        .then((u) => {
          if (!u) return next(new Error('UNAUTHORIZED'));
          socket.data.user = u;
          next();
        })
        .catch(() => next(new Error('UNAUTHORIZED')));
    });
    this.staleTimer = setInterval(() => void this.staleSweep().catch((e) => Log.warn('socket.stale_sweep_failed', { err: String(e) })), 30_000);
    this.staleTimer.unref();
  }

  private async authenticate(socket: Socket): Promise<SocketUser | null> {
    const token = (socket.handshake.auth as { token?: unknown } | undefined)?.token;
    if (typeof token !== 'string' || token.length > 2048) return null;
    const payload = await this.jwt.verifyAsync<{ sub: number; sid?: number; typ?: string }>(token);
    if (payload.typ && payload.typ !== 'access') return null;
    if (!(await this.identity.isSessionLive(payload.sid))) return null; // revoked session → no socket either
    const user = await this.identity.loadAuthUser(Number(payload.sub)); // ⚠️ DB, not the token
    if (!user || user.status !== 'ACTIVE') return null;
    return { id: user.id, role: user.role, perms: user.permissions, isGlobalAdmin: user.isGlobalAdmin };
  }

  async handleConnection(socket: Socket): Promise<void> {
    const u = socket.data.user as SocketUser | undefined;
    if (!u) {
      socket.disconnect(true);
      return;
    }
    this.enforceSocketCap(u.id, socket);
    socket.onAny((event: string) => {
      if (ALLOWED_CLIENT_EVENTS.has(event)) return;
      const n = (this.strikes.get(socket.id) ?? 0) + 1;
      this.strikes.set(socket.id, n);
      void this.audit.log({ actorId: u.id, actorRole: u.role, action: 'socket.unknown_event', entityType: 'socket', entityId: socket.id, after: { event: String(event).slice(0, 40), strike: n } });
      if (n >= MAX_STRIKES) socket.disconnect(true);
    });
    socket.on('delivery.location', (p: unknown) => void this.onLocation(socket, u, p).catch((e) => Log.warn('socket.location_failed', { userId: u.id, err: String(e) })));
    socket.on('client.ping', () => undefined);
    // One bad row must never take the whole API down with it: log, drop this socket, carry on.
    try {
      await this.joinAuthorizedRooms(socket, u);
    } catch (e) {
      Log.error('socket.join_failed', { userId: u.id, err: String(e) });
      socket.disconnect(true);
    }
  }

  handleDisconnect(socket: Socket): void {
    const u = socket.data.user as SocketUser | undefined;
    this.strikes.delete(socket.id);
    if (!u) return;
    const list = (this.userSockets.get(u.id) ?? []).filter((id) => id !== socket.id);
    if (list.length) this.userSockets.set(u.id, list);
    else this.userSockets.delete(u.id);
  }

  /** 4th concurrent socket for a user → the oldest is disconnected. */
  private enforceSocketCap(userId: number, socket: Socket): void {
    const list = [...(this.userSockets.get(userId) ?? []), socket.id];
    while (list.length > MAX_SOCKETS_PER_USER) {
      const oldest = list.shift() as string;
      this.server.sockets.sockets.get(oldest)?.disconnect(true);
    }
    this.userSockets.set(userId, list);
  }

  /** Server-side room assignment — the client can never ask for a room. */
  private async joinAuthorizedRooms(socket: Socket, u: SocketUser): Promise<void> {
    await socket.join(`user:${u.id}`);
    if (u.role === 'CUSTOMER') {
      for (const no of await this.orders.activeOrderNumbersFor(u.id)) {
        await socket.join(`order:${no}`);
        const snap = await this.tracking.snapshot(no); // reconnect → full current state
        if (snap) socket.emit('tracking.snapshot', snap);
      }
    }
    if (u.role === 'DELIVERY_BOY') {
      for (const a of await this.tracking.ridersActiveAssignments(u.id)) {
        await socket.join(`delivery:${a.id}`);
        await socket.join(`order:${a.orderNumber}`);
      }
      // Broadcast model: every rider watches the shared pool so a new unclaimed order lights up his
      // dashboard live. Claiming is still guarded server-side by duty + the one-assignment race, so
      // joining regardless of duty only decides what he *sees*, never what he can take.
      await socket.join('ops:pool');
    }
    // The ops rooms carry every customer's address and every rider's live position, so a scoped
    // admin joins them only if he was actually granted those two permissions.
    if (u.isGlobalAdmin || u.perms.has('delivery.track')) await socket.join('ops:delivery');
    if (u.isGlobalAdmin || u.perms.has('orders.view_all')) await socket.join('ops:orders');
  }

  private async onLocation(socket: Socket, u: SocketUser, raw: unknown): Promise<void> {
    // 1. AUTH — only riders may send locations
    if (u.role !== 'DELIVERY_BOY') {
      this.strike(socket, u, 'location_from_non_rider');
      return;
    }
    const p = raw as { assignmentId?: unknown; lat?: unknown; lng?: unknown; accuracy?: unknown; speed?: unknown; ts?: unknown };
    const assignmentId = Number(p?.assignmentId);
    if (!Number.isSafeInteger(assignmentId)) return;
    // 2. OWNERSHIP — assignment must be this rider's and active (TRK-09)
    const a = await this.tracking.activeAssignment(u.id, assignmentId);
    if (!a) {
      this.strike(socket, u, 'foreign_assignment');
      return;
    }
    const ping = { lat: Number(p.lat), lng: Number(p.lng), accuracy: typeof p.accuracy === 'number' ? p.accuracy : undefined, speed: typeof p.speed === 'number' ? p.speed : undefined, ts: Number(p.ts) };
    const r = await this.tracking.ingest(a, ping);
    if (!r.broadcast) return;
    this.staleNotified.delete(a.id);
    this.offlineNotified.delete(a.id);
    const evt = { orderNumber: a.orderNumber, lat: ping.lat, lng: ping.lng, at: new Date().toISOString(), isStale: false, weakSignal: r.weak };
    this.server.to(`order:${a.orderNumber}`).to('ops:delivery').emit('delivery.location.updated', evt);
  }

  /** REST fallback (POST /delivery/ping) uses the same pipeline. */
  async ingestRest(riderId: number, raw: { assignmentId: number; lat: number; lng: number; accuracy?: number; speed?: number; ts: number }): Promise<boolean> {
    const a = await this.tracking.activeAssignment(riderId, raw.assignmentId);
    if (!a) return false;
    const r = await this.tracking.ingest(a, raw);
    if (r.broadcast) this.server?.to(`order:${a.orderNumber}`).to('ops:delivery').emit('delivery.location.updated', { orderNumber: a.orderNumber, lat: raw.lat, lng: raw.lng, at: new Date().toISOString(), isStale: false, weakSignal: r.weak });
    return true;
  }

  private strike(socket: Socket, u: SocketUser, why: string): void {
    const n = (this.strikes.get(socket.id) ?? 0) + 1;
    this.strikes.set(socket.id, n);
    void this.audit.log({ actorId: u.id, actorRole: u.role, action: 'socket.rejected_location', entityType: 'socket', entityId: socket.id, after: { why, strike: n } });
    if (n >= MAX_STRIKES) socket.disconnect(true);
  }

  /** Stale (>90 s) → grey marker; offline (>180 s) → "संपर्क टूट गया" + supervisor alert. */
  private async staleSweep(): Promise<void> {
    const staleMs = (await this.settings.int('tracking_stale_seconds', 90)) * 1000;
    const offlineMs = (await this.settings.int('tracking_offline_seconds', 180)) * 1000;
    const now = Date.now();
    for (const id of this.tracking.liveAssignments()) {
      const pos = this.tracking.livePosition(id);
      if (!pos) continue;
      const age = now - pos.at;
      if (age > staleMs && !this.staleNotified.has(id)) {
        this.staleNotified.add(id);
        const snap = await this.orderNumberFor(id);
        if (snap) this.server.to(`order:${snap}`).to('ops:delivery').emit('delivery.location.updated', { orderNumber: snap, lat: pos.lat, lng: pos.lng, at: new Date(pos.at).toISOString(), isStale: true });
      }
      if (age > offlineMs && !this.offlineNotified.has(id)) {
        this.offlineNotified.add(id);
        const no = await this.orderNumberFor(id);
        if (no) {
          const customerId = await this.tracking.customerForOrder(no);
          if (customerId) await this.notify.send({ userId: customerId, type: 'tracking.lost', title: 'संपर्क टूट गया', body: 'डिलीवरी पार्टनर की लोकेशन अभी नहीं मिल रही — कोशिश जारी है।', linkUrl: `/mera/order/${no}`, dedupeKey: `lost:${id}:${Math.floor(now / 600000)}` });
          await this.notify.sendToPermission('delivery.track', { type: 'rider.offline', title: 'राइडर से संपर्क टूटा', body: `${no}: 3 मिनट से लोकेशन नहीं आई`, linkUrl: '/admin/delivery', channels: ['IN_APP', 'PUSH'], dedupeKey: `offline:${id}:${Math.floor(now / 600000)}` });
        }
      }
    }
  }
  private orderNumberFor(assignmentId: number): Promise<string | null> {
    return this.tracking.orderNumberForAssignment(assignmentId);
  }

  // ───────────── server → client emitters (called after COMMIT) ─────────────
  emitStatus(orderNumber: string, status: OrderStatus): void {
    this.server?.to(`order:${orderNumber}`).to('ops:orders').emit('order.status.updated', { orderNumber, status, labelHi: ORDER_STATUS_LABEL_HI[status], at: new Date().toISOString() });
  }
  /**
   * ⚠️ The delivery code goes to the CUSTOMER'S OWN ROOM and nowhere else.
   *
   * It used to go to `order:<no>`, described as "customer + that rider" — and that was the whole
   * problem. The rider is put into `order:<no>` for every assignment he holds, so the four digits
   * he is supposed to collect at the door were being pushed straight to his phone a moment after
   * he was given the job. He could then mark the order delivered from anywhere: the gate matches,
   * the shop records PAID, his COD balance goes up, his earning is credited, and the goods and the
   * cash are still in his bag. A code the person being checked already knows is not a check.
   *
   * So the payload splits three ways: the customer gets the code, the order room gets the rider's
   * name and number (which is what the tracking screen shows), and the ops board gets neither.
   */
  emitAssigned(orderNumber: string, customerId: number, rider: { name: string | null; phone: string }, otp: string | null): void {
    if (otp) this.server?.to(`user:${customerId}`).emit('delivery.assigned', { orderNumber, rider, otp });
    this.server?.except(`user:${customerId}`).to(`order:${orderNumber}`).emit('delivery.assigned', { orderNumber, rider });
    this.server?.to('ops:delivery').emit('delivery.assigned', { orderNumber, rider });
  }
  /** Broadcast model: a fresh order entered the pool → light up every rider's dashboard + admin board. */
  emitPoolNew(e: { orderNumber: string; village: string | null; collectAmount: string; itemCount: number; etaMinutes: number; distanceKm: number | null }): void {
    this.server?.to('ops:pool').to('ops:orders').emit('pool.order.new', e);
  }
  /** A pool order was taken (claimed/assigned) or is no longer available → drop it from every list. */
  emitPoolGone(orderNumber: string, by: string | null): void {
    this.server?.to('ops:pool').to('ops:orders').emit('pool.order.gone', { orderNumber, by });
  }
  emitCompleted(orderNumber: string, reason?: string): void {
    this.server?.to(`order:${orderNumber}`).to('ops:delivery').emit('delivery.completed', { orderNumber, at: new Date().toISOString(), ...(reason ? { reason } : {}) });
  }
  emitCancelled(orderNumber: string, reason: string): void {
    this.server?.to(`order:${orderNumber}`).emit('order.cancelled', { orderNumber, reason });
  }
  emitStarted(orderNumber: string): void {
    this.server?.to(`order:${orderNumber}`).emit('delivery.started', { orderNumber, at: new Date().toISOString() });
  }
  /** New order/assignment → the SERVER puts that user's sockets in the room. */
  joinUserToOrder(userId: number, orderNumber: string): void {
    this.server?.in(`user:${userId}`).socketsJoin(`order:${orderNumber}`);
  }
  joinRiderToAssignment(riderId: number, assignmentId: number, orderNumber: string): void {
    this.server?.in(`user:${riderId}`).socketsJoin([`delivery:${assignmentId}`, `order:${orderNumber}`]);
  }
  removeRiderFromOrder(riderId: number, assignmentId: number, orderNumber: string): void {
    this.server?.in(`user:${riderId}`).socketsLeave([`delivery:${assignmentId}`, `order:${orderNumber}`]);
  }

  stats(): { activeSockets: number; transports: Record<string, number> } {
    const transports: Record<string, number> = {};
    if (!this.server) return { activeSockets: 0, transports };
    for (const s of this.server.sockets.sockets.values()) {
      const t = s.conn.transport.name;
      transports[t] = (transports[t] ?? 0) + 1;
    }
    return { activeSockets: this.server.sockets.sockets.size, transports };
  }

  configuredTransports(): string[] {
    return this.env.SOCKET_TRANSPORTS;
  }
}
