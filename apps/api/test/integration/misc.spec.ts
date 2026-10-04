import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { get, type TestApp, createTestApp } from '../helpers/app';
import { resetDb } from '../helpers/db';
import { createCustomer, createStaff, insertPrescription, issueToken } from '../helpers/fixtures';
import { signToken } from '../../src/common/utils/hash';
import { QueueService } from '../../src/modules/jobs/queue.service';

describe('misc: prescription file access + job backoff', () => {
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

  test('RX: the owner can fetch their own prescription file', async () => {
    const customer = await createCustomer(t.db);
    const { accessToken } = await issueToken(t.app, customer);
    const rx = await insertPrescription(t.app, customer.id);
    const res = await get(t, `/files/rx/${rx.token}`, { token: accessToken });
    assert.equal(res.status, 200);
  });

  test('RX: a garbage / unsigned token is refused with 403', async () => {
    const customer = await createCustomer(t.db);
    const { accessToken } = await issueToken(t.app, customer);
    const res = await get(t, '/files/rx/not-a-real-token.at-all', { token: accessToken });
    assert.equal(res.status, 403);
  });

  test('RX: a token whose signature has been tampered with is refused with 403', async () => {
    const customer = await createCustomer(t.db);
    const { accessToken } = await issueToken(t.app, customer);
    const rx = await insertPrescription(t.app, customer.id);
    const [payload, sig] = rx.token.split('.');
    const tampered = `${payload}.${sig.slice(0, -2)}${sig.slice(0, 2)}`;
    const res = await get(t, `/files/rx/${tampered}`, { token: accessToken });
    assert.equal(res.status, 403);
  });

  test('RX: an expired token is refused with 403', async () => {
    const customer = await createCustomer(t.db);
    const { accessToken } = await issueToken(t.app, customer);
    const rx = await insertPrescription(t.app, customer.id);
    // A21 SERVE step 2: exp <= now → 403. Signed directly (bypassing the 600s real wait) with the
    // same APP_SECRET the running app validates against (test/helpers/env.ts pins this value).
    const expired = signToken({ rxId: rx.id, uid: customer.id, exp: Math.floor(Date.now() / 1000) - 5 }, process.env.APP_SECRET as string);
    const res = await get(t, `/files/rx/${expired}`, { token: accessToken });
    assert.equal(res.status, 403);
  });

  test("RX: a token minted for one viewer cannot be used by another — not even an ADMIN", async () => {
    const owner = await createCustomer(t.db);
    const admin = await createStaff(t.db, 'ADMIN');
    const { accessToken: adminToken } = await issueToken(t.app, admin);
    // insertPrescription mints the token bound to the OWNER's id (uid), exactly as
    // PrescriptionsService.mine()/queue() do for a real viewer — it is per-viewer, not per-rx.
    const rx = await insertPrescription(t.app, owner.id);
    const res = await get(t, `/files/rx/${rx.token}`, { token: adminToken });
    assert.equal(res.status, 403);
  });

  test('JOB: a failing job is retried with backoff, not re-run to exhaustion in one work() call', async () => {
    const queue = t.app.get(QueueService);
    let attempts = 0;
    queue.register('test.misc.always_fail', () => {
      attempts++;
      throw new Error('deliberately failing job');
    });
    await queue.push('test.misc.always_fail', {}, { maxAttempts: 2 });

    const r1 = await queue.work(5);
    assert.equal(r1.failed, 1);
    assert.equal(r1.done, 0);
    assert.equal(attempts, 1, 'exactly one attempt in this work() call — no busy retry loop');

    const row1 = await t.db('jobs').where({ type: 'test.misc.always_fail' }).first('attempts', 'failed_at', 'locked_at', 'locked_by', 'run_after');
    assert.equal(row1.attempts, 1);
    assert.equal(row1.failed_at, null);
    assert.equal(row1.locked_by, null, 'the claim must be released or the same worker would re-grab it instantly');
    assert.equal(row1.locked_at, null);
    assert.ok(new Date(row1.run_after).getTime() > Date.now(), 'backoff pushed run_after into the future (2^attempts minutes)');

    // A second work() call right away must find nothing due yet — the backoff is real, not cosmetic.
    const r2 = await queue.work(5);
    assert.equal(r2.done + r2.failed, 0);
    assert.equal(attempts, 1);

    // Fast-forward past the backoff window (test-only DB nudge — no clock mocking available) and
    // let it fail its second and final attempt.
    await t.db('jobs').where({ type: 'test.misc.always_fail' }).update({ run_after: t.db.raw('NOW() - INTERVAL 1 SECOND') });
    const r3 = await queue.work(5);
    assert.equal(r3.failed, 1);
    assert.equal(attempts, 2);

    const row2 = await t.db('jobs').where({ type: 'test.misc.always_fail' }).first('attempts', 'failed_at', 'locked_by');
    assert.equal(row2.attempts, 2);
    assert.notEqual(row2.failed_at, null, 'attempts (2) >= max_attempts (2) → permanently failed');
    assert.equal(row2.locked_by, null);
  });
});
