import { Inject, Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import { KNEX } from '../../database/knex.provider';
import { SettingsService } from '../settings/settings.service';

/**
 * Everything about the order-alert system that the owner can change without a developer.
 *
 * ⚠️ Two deliberate design choices here, both about not touching a live shop:
 *
 *  1. **No new tables and no new migration.** The values live in the existing `settings` table
 *     (`value` is TEXT and the `type` enum already has 'json'), under group 'alerts'.
 *  2. **No rows are written until the owner actually saves one.** Every read falls back to the
 *     default below, so deploying this changes no data at all; the first INSERT happens when a
 *     global admin presses Save in the panel. That keeps the alert system entirely additive —
 *     the website reads none of these keys and behaves exactly as before.
 *
 * The generic Admin → Settings screen deliberately cannot edit these: its `update()` refuses a
 * key that has no row yet, by design. Alerts therefore get their own endpoint, which upserts.
 */

export type RiderRecipientMode = 'ON_DUTY' | 'ALL_RIDERS' | 'SELECTED';
export type AlertPriority = 'HIGH' | 'DEFAULT';
export type AlertVisibility = 'PUBLIC' | 'PRIVATE';

type Kind = 'bool' | 'int' | 'string' | 'json';

interface Def {
  key: string;
  type: Kind;
  value: string;
  label: string;
}

/**
 * The defaults the task set out, in one place:
 *   rider incoming-order alert — persistent until an action or expiry
 *   admin / supervisor info alert — 10 seconds
 *   unassigned escalation — 2 minutes
 * all of them changeable from the panel.
 */
const DEFS: Def[] = [
  { key: 'alert_enabled', type: 'bool', value: '1', label: 'Order alerts on' },

  // ── who hears about it ──
  { key: 'alert_rider_mode', type: 'string', value: 'ON_DUTY', label: 'Which delivery boys (ON_DUTY / ALL_RIDERS / SELECTED)' },
  { key: 'alert_rider_user_ids', type: 'json', value: '[]', label: 'Selected delivery boys (user ids)' },
  { key: 'alert_admin_enabled', type: 'bool', value: '1', label: 'Alert admins' },
  { key: 'alert_supervisor_enabled', type: 'bool', value: '1', label: 'Alert supervisors' },
  { key: 'alert_extra_user_ids', type: 'json', value: '[]', label: 'Also alert these users (user ids)' },

  // ── timing (seconds) ──
  { key: 'alert_offer_expiry_sec', type: 'int', value: '120', label: 'Incoming order alert expires after (s, 0 = never)' },
  { key: 'alert_info_dismiss_sec', type: 'int', value: '10', label: 'Admin / supervisor alert auto-dismiss (s)' },
  { key: 'alert_escalation_sec', type: 'int', value: '120', label: 'Escalate an unassigned order after (s)' },
  { key: 'alert_escalation_repeat_sec', type: 'int', value: '300', label: 'Repeat the escalation every (s, 0 = once)' },
  { key: 'alert_retry_sec', type: 'int', value: '60', label: 'Retry a failed notification after (s)' },

  // ── behaviour ──
  { key: 'alert_ringtone', type: 'bool', value: '1', label: 'Ringtone' },
  { key: 'alert_vibration', type: 'bool', value: '1', label: 'Vibration' },
  { key: 'alert_priority', type: 'string', value: 'HIGH', label: 'Priority (HIGH / DEFAULT)' },
  { key: 'alert_visibility', type: 'string', value: 'PUBLIC', label: 'Show on the lock screen (PUBLIC / PRIVATE)' },
  { key: 'alert_repeat_count', type: 'int', value: '2', label: 'Ring the delivery boy again this many times' },

  // ── wording. {placeholders} are filled in by AlertsService ──
  { key: 'alert_title_new', type: 'string', value: '🛵 नया ऑर्डर आया!', label: 'New order — title (delivery boy)' },
  { key: 'alert_body_new', type: 'string', value: '{village} · {money} · {items} सामान — पहले लो!', label: 'New order — message (delivery boy)' },
  { key: 'alert_title_info', type: 'string', value: '🧾 नया ऑर्डर', label: 'New order — title (admin / supervisor)' },
  { key: 'alert_body_info', type: 'string', value: '{orderNumber} · {customer} · ₹{amount} · {status}', label: 'New order — message (admin / supervisor)' },
  { key: 'alert_title_unassigned', type: 'string', value: '⚠️ ऑर्डर किसी को नहीं मिला', label: 'Unassigned — title' },
  { key: 'alert_body_unassigned', type: 'string', value: 'इस ऑर्डर को अभी तक किसी डिलीवरी बॉय को नहीं दिया गया — {orderNumber} · {village} · ₹{amount}', label: 'Unassigned — message' },
  { key: 'alert_title_rejected', type: 'string', value: 'डिलीवरी बॉय ने मना किया', label: 'Rejected — title' },
  { key: 'alert_body_rejected', type: 'string', value: '{orderNumber}: {reason} — दोबारा सौंपें', label: 'Rejected — message' },
  { key: 'alert_title_expired', type: 'string', value: 'ऑर्डर का समय निकल गया', label: 'Expired — title' },
  { key: 'alert_body_expired', type: 'string', value: '{orderNumber} — {minutes} मिनट में किसी ने नहीं लिया', label: 'Expired — message' },

  // Which order facts the alert carries. The app shows them in this order.
  { key: 'alert_fields', type: 'json', value: '["orderNumber","customer","address","amount","items","placedAt"]', label: 'Order details shown in the alert' },
];

const BY_KEY = new Map(DEFS.map((d) => [d.key, d]));

export interface AlertConfig {
  enabled: boolean;
  riderMode: RiderRecipientMode;
  riderUserIds: number[];
  adminEnabled: boolean;
  supervisorEnabled: boolean;
  extraUserIds: number[];
  offerExpirySec: number;
  infoDismissSec: number;
  escalationSec: number;
  escalationRepeatSec: number;
  retrySec: number;
  ringtone: boolean;
  vibration: boolean;
  priority: AlertPriority;
  visibility: AlertVisibility;
  repeatCount: number;
  text: Record<string, string>;
  fields: string[];
}

@Injectable()
export class AlertConfigService {
  constructor(
    @Inject(KNEX) private readonly db: Knex,
    private readonly settings: SettingsService,
  ) {}

  /** The defaults, for the panel to show beside each current value. */
  static defaults(): Def[] {
    return DEFS;
  }

  async read(): Promise<AlertConfig> {
    const s = this.settings;
    const str = async (k: string): Promise<string> => s.str(k, BY_KEY.get(k)?.value ?? '');
    const int = async (k: string): Promise<number> => s.int(k, Number.parseInt(BY_KEY.get(k)?.value ?? '0', 10));
    const bool = async (k: string): Promise<boolean> => s.bool(k, (BY_KEY.get(k)?.value ?? '0') === '1');
    const ids = async (k: string): Promise<number[]> => {
      try {
        const parsed = JSON.parse(await str(k)) as unknown;
        return Array.isArray(parsed) ? parsed.map(Number).filter((n) => Number.isInteger(n) && n > 0) : [];
      } catch {
        return [];
      }
    };

    const text: Record<string, string> = {};
    for (const d of DEFS) if (d.key.startsWith('alert_title_') || d.key.startsWith('alert_body_')) text[d.key] = await str(d.key);

    let fields: string[] = [];
    try {
      const parsed = JSON.parse(await str('alert_fields')) as unknown;
      if (Array.isArray(parsed)) fields = parsed.map(String);
    } catch {
      fields = [];
    }

    const mode = (await str('alert_rider_mode')).toUpperCase();
    const priority = (await str('alert_priority')).toUpperCase();
    const visibility = (await str('alert_visibility')).toUpperCase();

    return {
      enabled: await bool('alert_enabled'),
      riderMode: mode === 'ALL_RIDERS' || mode === 'SELECTED' ? (mode as RiderRecipientMode) : 'ON_DUTY',
      riderUserIds: await ids('alert_rider_user_ids'),
      adminEnabled: await bool('alert_admin_enabled'),
      supervisorEnabled: await bool('alert_supervisor_enabled'),
      extraUserIds: await ids('alert_extra_user_ids'),
      offerExpirySec: Math.max(0, await int('alert_offer_expiry_sec')),
      infoDismissSec: Math.max(0, await int('alert_info_dismiss_sec')),
      escalationSec: Math.max(0, await int('alert_escalation_sec')),
      escalationRepeatSec: Math.max(0, await int('alert_escalation_repeat_sec')),
      retrySec: Math.max(0, await int('alert_retry_sec')),
      ringtone: await bool('alert_ringtone'),
      vibration: await bool('alert_vibration'),
      priority: priority === 'DEFAULT' ? 'DEFAULT' : 'HIGH',
      visibility: visibility === 'PRIVATE' ? 'PRIVATE' : 'PUBLIC',
      repeatCount: Math.min(5, Math.max(0, await int('alert_repeat_count'))),
      text,
      fields: fields.length ? fields : ['orderNumber', 'customer', 'address', 'amount', 'items', 'placedAt'],
    };
  }

  /** Current value + default + type for each key, for the Global Admin screen. */
  async rows(): Promise<{ key: string; value: string; default: string; type: Kind; label: string }[]> {
    const map = await this.settings.all();
    return DEFS.map((d) => ({ key: d.key, value: map.get(d.key)?.value ?? d.value, default: d.value, type: d.type, label: d.label }));
  }

  /**
   * Writes the keys the owner changed, creating the row if this is the first time that key has
   * ever been set. Unknown keys are refused — the endpoint is not a way to write arbitrary
   * settings, and in particular not a way to reach the locked or secret ones.
   */
  async save(changes: Record<string, string>, actorId: number): Promise<{ before: Record<string, string>; after: Record<string, string> }> {
    const map = await this.settings.all();
    const before: Record<string, string> = {};
    const after: Record<string, string> = {};
    for (const [key, raw] of Object.entries(changes)) {
      const def = BY_KEY.get(key);
      if (!def) throw new AlertConfigError(`यह सेटिंग नहीं है: ${key}`);
      const value = validate(def, raw);
      before[key] = map.get(key)?.value ?? def.value;
      after[key] = value;
    }
    await this.db.transaction(async (trx) => {
      for (const [key, value] of Object.entries(after)) {
        const def = BY_KEY.get(key);
        await trx.raw(
          `INSERT INTO settings (\`key\`, value, type, group_name, label, is_public, updated_by)
           VALUES (?, ?, ?, 'alerts', ?, 0, ?)
           ON DUPLICATE KEY UPDATE value = VALUES(value), updated_by = VALUES(updated_by)`,
          [key, value, def?.type === 'bool' ? 'bool' : def?.type === 'int' ? 'int' : def?.type === 'json' ? 'json' : 'string', def?.label ?? null, actorId],
        );
      }
    });
    this.settings.invalidate();
    return { before, after };
  }
}

function validate(def: Def, raw: string): string {
  const v = raw.trim();
  switch (def.type) {
    case 'bool':
      if (!['0', '1', 'true', 'false'].includes(v.toLowerCase())) throw new AlertConfigError(`${def.label}: चालू या बंद ही हो सकता है`);
      return v === '1' || v.toLowerCase() === 'true' ? '1' : '0';
    case 'int': {
      const n = Number.parseInt(v, 10);
      // A day is the ceiling on every timer here: anything longer is a typo, and an alert that
      // fires tomorrow is worse than none at all.
      if (!Number.isFinite(n) || n < 0 || n > 86_400) throw new AlertConfigError(`${def.label}: 0 से 86400 सेकंड के बीच होना चाहिए`);
      return String(n);
    }
    case 'json':
      try {
        const parsed = JSON.parse(v) as unknown;
        if (!Array.isArray(parsed)) throw new Error('not an array');
        if (parsed.length > 200) throw new Error('too many');
        return JSON.stringify(parsed);
      } catch {
        throw new AlertConfigError(`${def.label}: सूची सही नहीं है`);
      }
    default:
      if (v.length > 400) throw new AlertConfigError(`${def.label}: बहुत लंबा है`);
      return v;
  }
}

/** A refusal the owner is meant to read, told apart from a driver error (see SettingError). */
export class AlertConfigError extends Error {
  readonly isAlertConfigError = true;
}
