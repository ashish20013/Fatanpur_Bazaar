import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseEnv } from '../../src/config/env';

/**
 * A blank line in .env must mean "not set".
 *
 * `FOO=` reaches us as `''`, and `z.string().optional()` forgives only `undefined` — so a key the
 * shopkeeper deliberately left empty refused to let the server boot, complaining about a value he
 * never typed. It happened on CLIENT_ERROR_LOG and every other optional key was one blank line
 * away from the same crash. These pin it shut.
 */
const BASE: Record<string, string> = {
  NODE_ENV: 'development',
  PORT: '3000',
  TZ: 'Asia/Kolkata',
  DB_HOST: '127.0.0.1',
  DB_PORT: '3306',
  DB_USER: 'fatanpur',
  DB_PASSWORD: 'x',
  DB_NAME: 'fatanpur',
  JWT_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  APP_SECRET: 'c'.repeat(32),
  ALLOWED_ORIGINS: 'http://localhost:3001',
  STORAGE_PATH: './storage',
  PUBLIC_UPLOAD_URL: '/uploads',
  APP_URL: 'http://localhost:3001',
  API_URL: 'http://localhost:3000',
};

/** Every optional key, blank — exactly what an untouched .env.example looks like once copied. */
const BLANKS = [
  'CLIENT_ERROR_LOG',
  'MINIMOTH_API_KEY',
  'SMS_API_KEY',
  'SMS_SENDER_ID',
  'SMS_TEMPLATE_ID',
  'COOKIE_DOMAIN',
  'VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'FIREBASE_SERVICE_ACCOUNT',
  'MAP_API_KEY',
  'SETUP_TOKEN',
];

describe('env: a blank value means unset', () => {
  it('boots with every optional key left blank', () => {
    const env: Record<string, string> = { ...BASE };
    for (const k of BLANKS) env[k] = '';
    const r = parseEnv(env);
    assert.equal(r.ok, true, r.ok ? '' : `refused to boot: ${r.errors.join(' | ')}`);
  });

  it('blank keys come out undefined, not empty strings', () => {
    const r = parseEnv({ ...BASE, MINIMOTH_API_KEY: '', SMS_API_KEY: '' });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.env.MINIMOTH_API_KEY, undefined);
    assert.equal(r.env.SMS_API_KEY, undefined);
  });

  it('whitespace-only is blank too — a stray space must not become a key', () => {
    const r = parseEnv({ ...BASE, MINIMOTH_API_KEY: '   ' });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.env.MINIMOTH_API_KEY, undefined);
  });

  it('a REQUIRED key left blank still refuses to boot — this must not become a way to skip checks', () => {
    const r = parseEnv({ ...BASE, JWT_SECRET: '' });
    assert.equal(r.ok, false);
  });

  it('a real value is still read, and a bad one still rejected', () => {
    const good = parseEnv({ ...BASE, CLIENT_ERROR_LOG: 'false' });
    assert.equal(good.ok, true);
    if (good.ok) assert.equal(good.env.CLIENT_ERROR_LOG, false);
    assert.equal(parseEnv({ ...BASE, CLIENT_ERROR_LOG: 'yes' }).ok, false);
  });

  it('minimoth without a key is refused — no silent fallback on a live shop', () => {
    const r = parseEnv({ ...BASE, SMS_DRIVER: 'minimoth', MINIMOTH_API_KEY: '' });
    assert.equal(r.ok, false);
  });
});
