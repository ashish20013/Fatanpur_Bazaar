import { Inject, Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import { KNEX } from '../../database/knex.provider';
import { Log } from '../../common/logger';
import { maskPhone } from '../../common/utils/phone';

export interface AuditEntry {
  actorId: number | null;
  actorRole?: string | null;
  action: string;
  entityType?: string;
  entityId?: string | number;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

const PHONE_KEYS = /^(phone|ship_phone|ship_phone_masked)$/i;
const SECRET_KEYS = /^(otp|code_hash|delivery_otp|completion_otp|refresh_token_hash|token|password)$/i;

/** audit_logs writer. Never deleted. Phones masked, secrets dropped (SECURITY_AUDIT §8). */
@Injectable()
export class AuditService {
  constructor(@Inject(KNEX) private readonly db: Knex) {}

  async log(e: AuditEntry, trx?: Knex.Transaction): Promise<void> {
    const row = {
      actor_id: e.actorId,
      actor_role: e.actorRole ?? null,
      action: e.action.slice(0, 50),
      entity: e.entityType?.slice(0, 40) ?? null,
      entity_id: e.entityId === undefined ? null : String(e.entityId).slice(0, 40),
      before_json: e.before === undefined ? null : JSON.stringify(scrub(e.before)),
      // schema.sql has no `reason` column — the reason travels inside after_json.
      after_json: e.after === undefined && !e.reason ? null : JSON.stringify(e.reason ? { ...(scrub(e.after ?? {}) as object), _reason: e.reason.slice(0, 255) } : scrub(e.after)),
      ip_address: e.ip ?? null,
      user_agent: e.userAgent?.slice(0, 255) ?? null,
    };
    try {
      await (trx ?? this.db)('audit_logs').insert(row);
    } catch (err) {
      // Inside a transaction the caller must see the failure (it will roll back); outside, log loudly.
      if (trx) throw err;
      Log.error('audit.write_failed', { action: e.action, err: String(err) });
    }
  }
}

export function scrub(v: unknown, depth = 0): unknown {
  if (depth > 5 || v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map((x) => scrub(x, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (SECRET_KEYS.test(k)) continue;
    out[k] = PHONE_KEYS.test(k) && typeof val === 'string' ? maskPhone(val) : scrub(val, depth + 1);
  }
  return out;
}
