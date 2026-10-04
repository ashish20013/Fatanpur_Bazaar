import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Every warning and error, in one file, in words.
 *
 * The shopkeeper tests the site himself and then has to tell someone what went wrong. "It didn't
 * work" is all anyone can honestly report from a screen, and the detail that would explain it —
 * which route, which user, which SQL, the stack — scrolls past in a terminal he closed hours ago.
 * So warnings and errors are also appended here, and he hands over one file.
 *
 * Deliberately NOT the structured JSON the server already writes to stdout. That is for grep and
 * for Hostinger; this is for a person to read and for someone to be handed. Same events, two
 * shapes, and the JSON stream is untouched.
 *
 * Whatever the logger redacts stays redacted here — this file is meant to be sent to someone, so
 * an OTP or a token must never reach it. That is enforced upstream, in `Log.write`, before the
 * line is ever built.
 */

const MAX_BYTES = 4 * 1024 * 1024; // one rotation, ~4 MB: enough for a long test session, small enough to send
let target: string | null = null;
let failed = false;

/** Called once at boot. Until then nothing is written — a CLI command has no business logging here. */
export function openProblemLog(storagePath: string): string {
  target = join(storagePath, 'logs', 'problems.log');
  try {
    mkdirSync(dirname(target), { recursive: true });
  } catch {
    failed = true; // read-only disk: the app must still run, it just cannot keep this file
  }
  return target;
}

function rotate(file: string): void {
  try {
    if (existsSync(file) && statSync(file).size > MAX_BYTES) renameSync(file, `${file}.1`);
  } catch {
    /* rotation is a nicety; never let it stop the app */
  }
}

/** One event, laid out for reading rather than for parsing. */
export function writeProblem(level: 'warn' | 'error', msg: string, meta?: Record<string, unknown>): void {
  if (!target || failed) return;
  const when = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const lines = [`[${when}] ${level.toUpperCase()}  ${msg}`];
  for (const [k, v] of Object.entries(meta ?? {})) {
    if (v === undefined || v === null) continue;
    if (k === 'stack' && typeof v === 'string') {
      // The stack is the most useful part and the only one worth several lines.
      lines.push('    stack:');
      for (const s of v.split('\n').slice(0, 12)) lines.push(`      ${s.trim()}`);
      continue;
    }
    const text = typeof v === 'object' ? JSON.stringify(v) : String(v);
    // A newline inside a value would forge a new entry; keep every field on its own single line.
    lines.push(`    ${k}: ${text.replace(/[\r\n]+/g, ' ').slice(0, 500)}`);
  }
  try {
    rotate(target);
    appendFileSync(target, lines.join('\n') + '\n\n', 'utf8');
  } catch {
    failed = true; // say it once by going quiet, rather than throwing on every log call
  }
}
