import { Inject, Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { KNEX } from '../../database/knex.provider';
import { ENV, type Env } from '../../config/config.module';
import { AppError, conflict, notFound } from '../../common/errors';
import { Log } from '../../common/logger';
import { isImage, sniffMime } from '../../common/utils/filetype';
import { signToken, verifyToken } from '../../common/utils/hash';
import { uuid } from '../../common/utils/ids';
import { isGlobalAdmin, type AuthUser } from '../../common/types';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notifications/notification.service';
import { SettingsService } from '../settings/settings.service';
import { OrderStateService } from '../orders/order-state.service';

const MAX_BYTES = 5 * 1024 * 1024;
const TOKEN_TTL_SEC = 600;

/** A21 — prescriptions are health data: private storage, signed + re-authorised reads, audited. */
@Injectable()
export class PrescriptionsService {
  constructor(
    @Inject(KNEX) private readonly db: Knex,
    @Inject(ENV) private readonly env: Env,
    private readonly audit: AuditService,
    private readonly notify: NotificationService,
    private readonly settings: SettingsService,
    private readonly state: OrderStateService,
  ) {}

  async upload(user: AuthUser, buf: Buffer, meta: { doctorName?: string; issuedOn?: string }): Promise<{ id: number; status: string }> {
    if (buf.length > MAX_BYTES) throw new AppError('PAYLOAD_TOO_LARGE');
    const mime = sniffMime(buf); // real content, not the extension
    if (!mime) throw new AppError('UNSUPPORTED_FILE');
    let out = buf;
    let ext = 'pdf';
    if (isImage(mime)) {
      // Re-encode: strips EXIF/GPS and any payload smuggled after the image data.
      out = await sharp(buf, { failOn: 'error' }).rotate().resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
      ext = 'jpg';
    } else if (!buf.subarray(0, 1024).toString('latin1').startsWith('%PDF-')) {
      throw new AppError('UNSUPPORTED_FILE');
    }
    const dir = join(this.env.STORAGE_PATH, 'private', 'rx', String(user.id));
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const rel = `private/rx/${user.id}/${uuid()}.${ext}`; // server-generated name; user input never in the path
    await writeFile(join(this.env.STORAGE_PATH, rel), out, { mode: 0o600 });
    const [id] = await this.db('prescriptions').insert({ user_id: user.id, file_path: rel, file_mime: ext === 'jpg' ? 'image/jpeg' : 'application/pdf', file_size: out.length, doctor_name: meta.doctorName?.slice(0, 120) ?? null, issued_on: meta.issuedOn ?? null, status: 'PENDING_REVIEW' });
    await this.notify.sendToPermission('prescriptions.review', { type: 'rx.pending', title: 'नई पर्ची', body: 'एक नई पर्ची जाँच के लिए आई है', linkUrl: '/admin/prescriptions', channels: ['IN_APP', 'PUSH'], dedupeKey: `rxup:${id}` });
    return { id, status: 'PENDING_REVIEW' };
  }

  async mine(userId: number): Promise<unknown[]> {
    const rows = (await this.db('prescriptions').where({ user_id: userId }).orderBy('id', 'desc').limit(50).select('id', 'status', 'review_note as reviewNote', 'expires_at as expiresAt', 'created_at as createdAt', 'order_id as orderId', 'purged_at as purgedAt')) as { id: number }[];
    return rows.map((r) => ({ ...r, fileUrl: `/v1/files/rx/${this.token(r.id, userId)}` }));
  }

  token(rxId: number, uid: number): string {
    return signToken({ rxId, uid, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC }, this.env.APP_SECRET);
  }

  /**
   * GET /files/rx/:token — HMAC (timing-safe) + expiry, THEN authorisation re-checked against the
   * current DB state (access may have been revoked after the link was issued).
   */
  async serve(token: string, viewer: AuthUser | undefined, ip: string): Promise<{ buf: Buffer; mime: string; name: string }> {
    const data = verifyToken<{ rxId: number; uid: number; exp: number }>(token, this.env.APP_SECRET);
    if (!data || typeof data.exp !== 'number' || data.exp < Math.floor(Date.now() / 1000)) throw new AppError('FORBIDDEN');
    if (!viewer || viewer.id !== data.uid) throw new AppError('FORBIDDEN'); // token is bound to the viewer
    const rx = await this.db('prescriptions').where({ id: data.rxId }).first('id', 'user_id', 'file_path', 'file_mime', 'purged_at');
    if (!rx || rx.purged_at) throw notFound();
    const allowed = rx.user_id === viewer.id || isGlobalAdmin(viewer) || viewer.permissions.has('prescriptions.review');
    if (!allowed) throw new AppError('FORBIDDEN');
    const buf = await readFile(join(this.env.STORAGE_PATH, rx.file_path));
    await this.audit.log({ actorId: viewer.id, actorRole: viewer.role, action: 'prescription.view', entityType: 'prescription', entityId: rx.id, ip });
    return { buf, mime: rx.file_mime, name: `parchi-${rx.id}.${rx.file_mime === 'application/pdf' ? 'pdf' : 'jpg'}` };
  }

  async queue(viewer: AuthUser): Promise<unknown[]> {
    const rows = (await this.db('prescriptions as p').join('users as u', 'u.id', 'p.user_id').leftJoin('orders as o', 'o.id', 'p.order_id').where('p.status', 'PENDING_REVIEW').orderBy('p.id')
      .select('p.id', 'p.created_at as createdAt', 'p.doctor_name as doctorName', 'u.name as customer', 'o.order_number as orderNumber')) as { id: number }[];
    return rows.map((r) => ({ ...r, fileUrl: `/v1/files/rx/${this.token(r.id, viewer.id)}` }));
  }

  async review(rxId: number, decision: 'APPROVED' | 'REJECTED', note: string | undefined, actor: AuthUser, ip: string): Promise<unknown> {
    const rx = await this.db('prescriptions').where({ id: rxId }).first();
    if (!rx) throw notFound();
    if (rx.status !== 'PENDING_REVIEW') throw conflict('यह पर्ची पहले ही जाँची जा चुकी है');
    const order = rx.order_id ? await this.db('orders').where({ id: rx.order_id }).first('order_number', 'status', 'payment_method', 'payment_status') : null;
    await this.db.transaction(async (trx) => {
      await trx('prescriptions').where({ id: rxId }).update({ status: decision, reviewed_by: actor.id, reviewed_at: trx.fn.now(), review_note: note?.slice(0, 500) ?? null, expires_at: decision === 'APPROVED' ? trx.raw('DATE_ADD(NOW(), INTERVAL 30 DAY)') : null });
      if (order) await trx('orders').where({ order_number: order.order_number }).update({ prescription_status: decision });
      await this.audit.log({ actorId: actor.id, actorRole: actor.role, action: 'prescription.review', entityType: 'prescription', entityId: rxId, after: { decision, orderNumber: order?.order_number }, reason: note ?? null, ip }, trx);
      await this.notify.send({ userId: rx.user_id, type: 'rx.reviewed', title: decision === 'APPROVED' ? 'पर्ची मंज़ूर ✓' : 'पर्ची मंज़ूर नहीं हुई', body: decision === 'APPROVED' ? 'आपकी पर्ची मंज़ूर हो गई।' : `कारण: ${note ?? 'पर्ची साफ़ नहीं है'}`, channels: ['IN_APP', 'PUSH'] }, trx);
    });
    const actorObj = { id: actor.id, kind: actor.role, permissions: actor.permissions, isGlobalAdmin: actor.isGlobalAdmin };
    if (order && decision === 'REJECTED' && !['CANCELLED', 'DELIVERED', 'COMPLETED'].includes(order.status)) {
      // A15 §11 path: cancel + refund + restock, all inside the state machine.
      await this.state.changeStatus(order.order_number, 'CANCELLED', actorObj, { note: `पर्ची मंज़ूर नहीं: ${note ?? ''}`, ip });
    } else if (order && decision === 'APPROVED' && order.status === 'PENDING_PAYMENT' && (order.payment_method === 'COD' || order.payment_status === 'PAID')) {
      await this.state.changeStatus(order.order_number, 'CONFIRMED', actorObj, { note: 'पर्ची मंज़ूर', ip }).catch((e) => Log.warn('rx.confirm_failed', { err: String(e) }));
    }
    return { status: decision };
  }

  /** Retention cron: file deleted after rx_retention_days, row kept with purged_at. */
  async purgeOld(): Promise<number> {
    const days = await this.settings.int('rx_retention_days', 365);
    const rows = (await this.db('prescriptions').whereNull('purged_at').where('created_at', '<', this.db.raw('NOW() - INTERVAL ? DAY', [days])).limit(500).select('id', 'file_path')) as { id: number; file_path: string }[];
    for (const r of rows) {
      try {
        await unlink(join(this.env.STORAGE_PATH, r.file_path));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
          Log.warn('rx.purge_failed', { id: r.id, err: String(e) });
          continue;
        }
      }
      await this.db('prescriptions').where({ id: r.id }).update({ purged_at: this.db.fn.now() });
    }
    return rows.length;
  }
}
