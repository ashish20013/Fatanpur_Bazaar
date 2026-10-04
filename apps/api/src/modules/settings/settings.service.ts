import { Inject, Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import { ALL_VERTICALS, VERTICAL_SETTING_KEY, type Vertical } from '@fb/shared-types';
import { KNEX } from '../../database/knex.provider';
import { CACHE, type ICacheProvider } from '../../common/cache/cache.provider';
import { toPaise, type Paise } from '../../common/utils/money';
import { hhmmToMinutes } from '../../common/utils/time';
import { MASK, isSet, open as openSecret, seal } from '../../common/utils/secretbox';

export interface SettingRow {
  key: string;
  value: string | null;
  type: 'string' | 'int' | 'decimal' | 'bool' | 'time' | 'json';
  group_name: string;
  label: string | null;
  is_public: number;
}

const KEY = 'settings:all';
const TTL = 60_000;

/** Typed, cached access to the `settings` table. Writes invalidate immediately. */
/**
 * Settings the admin panel is NOT allowed to change.
 *
 * Most settings are the shopkeeper's business decisions — prices, hours, delivery area — and he
 * should be able to change them himself without anyone's help. These are different: they decide
 * HOW people log in and how money moves, and getting one of them wrong locks every customer out
 * of the shop or breaks payments. They belong in .env, where changing them takes a deliberate act
 * on the server and a restart, not a stray click in a web form.
 *
 * ⚠️ This is enforced HERE, in the service, not by hiding a field in the UI. A hidden field is
 * still reachable by anyone who can call the API — and an ADMIN can call the API.
 */
const LOCKED: Record<string, string> = {
  otp_driver: 'लॉगिन का तरीक़ा (OTP) सर्वर की .env फ़ाइल से तय होता है — यहाँ से नहीं बदला जा सकता।',
  // Who owns the shop is not a web form. Changing it would hand someone every bypass in the
  // system in one click, so it is set on the server and seeded — see seeds/global-admin.ts.
  global_admin_phone: 'मुख्य एडमिन का नंबर सर्वर से तय होता है — यहाँ से नहीं बदला जा सकता।',
};

/**
 * Settings whose value never leaves the server.
 *
 * The gateway keys have to be typed into the admin panel — the owner will get them from Cashfree
 * long after the site is live, and "SSH in and edit .env" is not a thing he can do from his phone.
 * So they are stored here, but stored ENCRYPTED (common/utils/secretbox) and read back as a row of
 * dots. Writing one is allowed; reading one is not, for anybody, because the only reason to fetch
 * a secret you already set is to take it somewhere else.
 *
 * ⚠️ Any new key holding a password, an API key or a signing secret belongs in this set. A value
 * that is not listed here goes into the settings table in plain text and is handed to whoever can
 * open Admin → Settings.
 */
const SECRET_KEYS = new Set(['cashfree_secret_key', 'cashfree_webhook_secret']);

@Injectable()
export class SettingsService {
  constructor(
    @Inject(KNEX) private readonly db: Knex,
    @Inject(CACHE) private readonly cache: ICacheProvider,
  ) {}

  async all(): Promise<Map<string, SettingRow>> {
    return this.cache.wrap(KEY, TTL, async () => {
      const rows = (await this.db('settings').select('key', 'value', 'type', 'group_name', 'label', 'is_public')) as SettingRow[];
      return new Map(rows.map((r) => [r.key, r]));
    });
  }

  async raw(key: string): Promise<string | null> {
    return (await this.all()).get(key)?.value ?? null;
  }

  /**
   * Read a stored secret in the clear — only ever from server code that is about to use it
   * (signing a webhook check, calling the gateway). Never from a controller's response.
   *
   * Returns '' when it cannot be decrypted, which happens when APP_SECRET has been rotated. The
   * caller then behaves exactly as if the key were never set — "gateway not configured" — instead
   * of sending the gateway a corrupt secret and reporting a payment failure the owner cannot
   * explain.
   */
  async secret(key: string): Promise<string> {
    const stored = await this.raw(key);
    if (!isSet(stored)) return '';
    const appSecret = process.env.APP_SECRET ?? '';
    return openSecret(stored, appSecret) ?? '';
  }

  /** Is a secret set, without reading it? This is what the admin screen is allowed to know. */
  async hasSecret(key: string): Promise<boolean> {
    return isSet(await this.raw(key));
  }

  /** Rows for the admin screen, with every secret replaced by dots. */
  async adminRows(): Promise<(SettingRow & { locked: boolean; secret: boolean; isSet: boolean })[]> {
    const locked = new Set(SettingsService.lockedKeys());
    return [...(await this.all()).values()].map((r) => {
      const secret = SECRET_KEYS.has(r.key);
      return { ...r, value: secret ? (isSet(r.value) ? MASK : '') : r.value, locked: locked.has(r.key), secret, isSet: secret ? isSet(r.value) : r.value !== null && r.value !== '' };
    });
  }
  async str(key: string, fallback = ''): Promise<string> {
    return (await this.raw(key)) ?? fallback;
  }
  async int(key: string, fallback = 0): Promise<number> {
    const v = await this.raw(key);
    const n = v === null ? NaN : Number.parseInt(v, 10);
    return Number.isFinite(n) ? n : fallback;
  }
  async bool(key: string, fallback = false): Promise<boolean> {
    const v = await this.raw(key);
    return v === null ? fallback : v === '1' || v.toLowerCase() === 'true';
  }
  async money(key: string, fallback: Paise = 0): Promise<Paise> {
    const v = await this.raw(key);
    return v === null || v === '' ? fallback : toPaise(v);
  }
  async num(key: string, fallback = 0): Promise<number> {
    const v = await this.raw(key);
    const n = v === null ? NaN : Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  /** Compliance helper — the ONE place that decides which verticals exist on the site. */
  async enabledVerticals(): Promise<Vertical[]> {
    const map = await this.all();
    return ALL_VERTICALS.filter((v) => map.get(VERTICAL_SETTING_KEY[v])?.value === '1');
  }

  async publicSettings(): Promise<Record<string, string | null>> {
    const out: Record<string, string | null> = {};
    // Belt and braces: a secret must never be public even if someone flips is_public by hand.
    for (const [k, r] of await this.all()) if (Number(r.is_public) === 1 && !SECRET_KEYS.has(k)) out[k] = r.value;
    return out;
  }

  /** Validates by declared type; returns previous values for the audit log. */
  async update(changes: Record<string, string>, actorId: number): Promise<{ before: Record<string, string | null>; after: Record<string, string> }> {
    const map = await this.all();
    const before: Record<string, string | null> = {};
    const after: Record<string, string> = {};
    for (const [key, value] of Object.entries(changes)) {
      const locked = LOCKED[key];
      if (locked) throw new SettingError(locked);
      const row = map.get(key);
      if (!row) throw new SettingError(`Unknown setting ${key}`);
      validateSetting(row.type, value);
      // The screen shows dots for a secret, so the browser sends dots back on any save that did
      // not touch that field. Taking it literally would overwrite the real key with '••••••••'
      // and break payments on the next unrelated settings change.
      if (SECRET_KEYS.has(key) && (value === MASK || value === '')) continue;
      before[key] = row.value;
      after[key] = SECRET_KEYS.has(key) ? seal(value, process.env.APP_SECRET ?? '') : value;
    }
    await this.db.transaction(async (trx) => {
      for (const [key, value] of Object.entries(after)) await trx('settings').where({ key }).update({ value, updated_by: actorId });
    });
    this.cache.del(KEY);
    // The audit log records that a key changed, never what it changed to — an audit trail that
    // stores the gateway secret in plain text is a second copy of the secret.
    const redact = <T extends string | null>(o: Record<string, T>): Record<string, T> =>
      Object.fromEntries(Object.entries(o).map(([k, v]) => [k, SECRET_KEYS.has(k) ? ((v ? '[set]' : '[empty]') as T) : v]));
    return { before: redact(before), after: redact(after) };
  }

  /** Keys the admin panel must render as read-only. Same list the service enforces. */
  static lockedKeys(): string[] {
    return Object.keys(LOCKED);
  }

  /** Keys stored encrypted and shown as dots. Exported so a test can prove none of them is public. */
  static secretKeys(): string[] {
    return [...SECRET_KEYS];
  }

  invalidate(): void {
    this.cache.del(KEY);
  }
}

/**
 * A refusal the shopkeeper is meant to read.
 *
 * Marked so the controller can tell our own "this value is wrong" apart from whatever the database
 * driver threw. The driver's text is useful in a log and nowhere else: `ER_DATA_TOO_LONG for column
 * 'value'` tells the owner nothing he can act on, and a connection failure's message carries the
 * database host and port straight into an HTTP response.
 */
export class SettingError extends Error {
  readonly isSettingError = true;
}

export function validateSetting(type: SettingRow['type'], value: string): void {
  const ok =
    type === 'int' ? /^-?\d+$/.test(value) :
    type === 'decimal' ? /^-?\d+(\.\d{1,7})?$/.test(value) :
    type === 'bool' ? value === '0' || value === '1' :
    type === 'time' ? (() => { try { hhmmToMinutes(value); return true; } catch { return false; } })() :
    type === 'json' ? (() => { try { JSON.parse(value); return true; } catch { return false; } })() :
    value.length <= 2000;
  if (!ok) throw new SettingError(`Invalid ${type} value`);
}
