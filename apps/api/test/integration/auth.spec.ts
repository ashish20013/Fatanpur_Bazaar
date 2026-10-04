import { TokenService } from '../../src/modules/auth/token.service';
import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, get, post, type TestApp } from '../helpers/app';
import { resetDb } from '../helpers/db';
import { createCustomer, createStaff, issueToken, readDevOtp, uniquePhone } from '../helpers/fixtures';

/**
 * A2/A3/A4 — the real OTP send→verify→refresh HTTP round trip (SMS_DRIVER=null writes the OTP to
 * storage/logs/otp-dev.log; it is NEVER read from the response body — matching production, where
 * nothing but that dev-only log ever sees the code).
 */
describe('auth: OTP + refresh', () => {
  let t: TestApp;
  before(async () => {
    t = await createTestApp();
  });
  after(async () => {
    await t.close();
  });
  beforeEach(async () => {
    await resetDb(t.db, t.cache, process.env.DB_NAME as string);
  });

  test('SEC: public register with role:"ADMIN" in the body → role stays CUSTOMER', async () => {
    const phone = uniquePhone();
    const sent = await post(t, '/auth/otp/send', { body: { phone, purpose: 'LOGIN' } });
    assert.equal(sent.status, 200);
    assert.equal(sent.body.ok, true);
    const otp = readDevOtp(process.env.STORAGE_PATH as string, `91${phone}`);
    const verified = await post<{ user: { role: string }; accessToken: string; isNewUser: boolean }>(
      t,
      '/auth/otp/verify',
      {
        body: { phone, otp, name: 'Ram Kumar', role: 'ADMIN' },
      },
    );
    assert.equal(verified.status, 200);
    assert.equal(verified.body.data?.isNewUser, true);
    assert.equal(verified.body.data?.user.role, 'CUSTOMER');
    const row = await t
      .db('users')
      .where({ phone: `91${phone}` })
      .first('role');
    assert.equal(row.role, 'CUSTOMER');
  });

  test('SEC: ?role=ADMIN query string is never read by the verify route', async () => {
    const phone = uniquePhone();
    await post(t, '/auth/otp/send', { body: { phone, purpose: 'LOGIN' } });
    const otp = readDevOtp(process.env.STORAGE_PATH as string, `91${phone}`);
    const verified = await post<{ user: { role: string } }>(t, '/auth/otp/verify?role=ADMIN', {
      body: { phone, otp },
    });
    assert.equal(verified.status, 200);
    assert.equal(verified.body.data?.user.role, 'CUSTOMER');
  });

  test('SEC: OTP is never present in the send/verify response body', async () => {
    const phone = uniquePhone();
    const sent = await post(t, '/auth/otp/send', { body: { phone, purpose: 'LOGIN' } });
    assert.equal(JSON.stringify(sent.body).match(/"otp"|"code"/i), null);
    const otp = readDevOtp(process.env.STORAGE_PATH as string, `91${phone}`);
    const bad = await post(t, '/auth/otp/verify', {
      body: { phone, otp: '000000' === otp ? '111111' : '000000' },
    });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error?.code, 'OTP_INVALID');
  });

  test('SEC: an unknown phone attempting STAFF_LOGIN gets 401 and NO account is created', async () => {
    const phone = uniquePhone();
    const res = await post(t, '/auth/otp/send', { body: { phone, purpose: 'STAFF_LOGIN' } });
    assert.equal(res.status, 401);
    assert.equal(res.body.error?.code, 'STAFF_NOT_FOUND');
    const row = await t
      .db('users')
      .where({ phone: `91${phone}` })
      .first('id');
    assert.equal(row, undefined);
  });

  test('SEC: a CUSTOMER phone attempting STAFF_LOGIN is also refused (customer flow must be used instead)', async () => {
    const customer = await createCustomer(t.db);
    const res = await post(t, '/auth/otp/send', {
      body: { phone: customer.phone.slice(2), purpose: 'STAFF_LOGIN' },
    });
    assert.equal(res.status, 401);
    assert.equal(res.body.error?.code, 'STAFF_NOT_FOUND');
  });

  test('SEC: a disabled user with an otherwise-valid access token gets 403', async () => {
    const customer = await createCustomer(t.db);
    const { accessToken } = await issueToken(t.app, customer);
    await t.db('users').where({ id: customer.id }).update({ status: 'DISABLED' });
    const res = await get(t, '/auth/me', { token: accessToken });
    assert.equal(res.status, 403);
    assert.equal(res.body.error?.code, 'ACCOUNT_DISABLED');
  });

  test('SEC: refresh-token reuse revokes the ENTIRE session chain', async () => {
    const customer = await createCustomer(t.db);
    const first = await issueToken(t.app, customer);
    const rotated = await post<{ accessToken: string; refreshToken: string }>(t, '/auth/refresh', {
      body: { refreshToken: first.refreshToken },
    });
    assert.equal(rotated.status, 200);
    const rotatedToken = rotated.body.data?.refreshToken as string;
    assert.notEqual(rotatedToken, first.refreshToken);

    // Simulate the race-grace window (20s) having elapsed, so replaying the pre-rotation token
    // is unambiguous theft, not two tabs refreshing a moment apart (A4).
    const hash = t.app.get(TokenService).hashRefresh(first.refreshToken);
    await t
      .db('auth_sessions')
      .where({ refresh_token_hash: hash })
      .update({ revoked_at: t.db.raw('NOW() - INTERVAL 30 SECOND') });

    const reuse = await post(t, '/auth/refresh', { body: { refreshToken: first.refreshToken } });
    assert.equal(reuse.status, 401);

    const live = await t
      .db('auth_sessions')
      .where({ user_id: customer.id })
      .whereNull('revoked_at')
      .count({ n: '*' })
      .first();
    assert.equal(Number(live?.n ?? 1), 0, 'every session for this user must now be revoked');

    // The freshly-rotated (otherwise still valid) token must also be dead — the WHOLE chain died.
    const rotatedNowDead = await post(t, '/auth/refresh', { body: { refreshToken: rotatedToken } });
    assert.equal(rotatedNowDead.status, 401);
  });

  test('AUTH: a normal login round trip issues a working access token', async () => {
    const staff = await createStaff(t.db, 'SUPERVISOR');
    const { accessToken } = await issueToken(t.app, staff);
    const me = await get<{ role: string; phone: string }>(t, '/auth/me', { token: accessToken });
    assert.equal(me.status, 200);
    assert.equal(me.body.data?.role, 'SUPERVISOR');
  });
});
