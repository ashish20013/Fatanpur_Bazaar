/**
 * Minimal structured logger (one JSON line per event → Hostinger log files stay greppable).
 * Redacts anything that looks like a secret; OTPs/tokens must never be logged (SECURITY_AUDIT §8).
 */
import { writeProblem } from './problem-log';

type Level = 'debug' | 'info' | 'warn' | 'error';
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const REDACT = /^(otp|code|password|token|accessToken|refreshToken|authorization|cookie|secret|code_hash|delivery_otp|completion_otp)$/i;

function redact(v: unknown, depth = 0): unknown {
  if (depth > 4 || v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map((x) => redact(x, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = REDACT.test(k) ? '[redacted]' : redact(val, depth + 1);
  return out;
}

export class Log {
  static level: Level = (process.env.LOG_LEVEL as Level) || 'info';
  static write(level: Level, msg: string, meta?: Record<string, unknown>): void {
    if (ORDER[level] < ORDER[Log.level]) return;
    const safe = meta ? (redact(meta) as Record<string, unknown>) : undefined;
    const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...(safe ?? {}) });
    if (level === 'error' || level === 'warn') {
      process.stderr.write(line + '\n');
      // Also, in words, into storage/logs/problems.log — the file the shopkeeper hands over after
      // a test run. It is fed the REDACTED copy, never the raw meta.
      writeProblem(level, msg, safe);
    } else process.stdout.write(line + '\n');
  }
  static debug(msg: string, meta?: Record<string, unknown>): void { Log.write('debug', msg, meta); }
  static info(msg: string, meta?: Record<string, unknown>): void { Log.write('info', msg, meta); }
  static warn(msg: string, meta?: Record<string, unknown>): void { Log.write('warn', msg, meta); }
  static error(msg: string, meta?: Record<string, unknown>): void { Log.write('error', msg, meta); }
}
