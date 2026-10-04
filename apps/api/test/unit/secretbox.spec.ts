import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { describe, it } from 'node:test';
import { MASK, isSet, open, seal } from '../../src/common/utils/secretbox';
import { CashfreeProvider } from '../../src/modules/payments/gateway.provider';

const KEY = 'x'.repeat(32);

describe('secretbox — the gateway keys the shopkeeper types in', () => {
  it('a sealed value is not readable in the database dump it ends up in', () => {
    const sealed = seal('cfsk_ma_prod_supersecret', KEY);
    assert.ok(!sealed.includes('supersecret'));
    assert.ok(sealed.startsWith('enc:v1:'));
    assert.equal(open(sealed, KEY), 'cfsk_ma_prod_supersecret');
  });

  it('two seals of the same value differ — a repeated ciphertext would leak "these are the same key"', () => {
    assert.notEqual(seal('same', KEY), seal('same', KEY));
  });

  it('⚠️ the wrong APP_SECRET returns null, never rubbish — a corrupt key must not reach the gateway', () => {
    assert.equal(open(seal('abc', KEY), 'y'.repeat(32)), null);
  });

  it('tampering with the ciphertext fails the auth tag', () => {
    const sealed = seal('abc', KEY);
    const broken = `${sealed.slice(0, -4)}AAAA`;
    assert.equal(open(broken, KEY), null);
  });

  it('empty stays empty — "not set" must not become an encrypted empty string', () => {
    assert.equal(seal('', KEY), '');
    assert.equal(isSet(seal('', KEY)), false);
    assert.equal(open('', KEY), null);
    assert.equal(open(null, KEY), null);
  });

  it('a key pasted straight into the table by hand still works, so nothing has to be migrated', () => {
    assert.equal(open('plain_legacy_key', KEY), 'plain_legacy_key');
  });

  it('the mask is dots and nothing else — no "last four" of a signing key is safe to print', () => {
    assert.equal(/^[•]+$/.test(MASK), true);
  });
});

/**
 * Their signature is the one detail that decides whether a stranger can post "this order is paid"
 * to the shop and have goods sent out for free. It is Base64(HMAC-SHA256("<ts>.<raw body>")), over
 * the RAW bytes, with a timestamp header — three things to get wrong, all of them silent.
 */
function sign(ts: string, body: string, secret: string): string {
  return createHmac('sha256', secret).update(`${ts}.${body}`).digest('base64');
}

describe('Cashfree webhook signature', () => {
  const secret = 'whsec_test';
  const body = JSON.stringify({ type: 'PAYMENT_SUCCESS_WEBHOOK', data: { order: { order_id: 'FB-20260926-0001', order_amount: 245.5 }, payment: { cf_payment_id: 991, payment_status: 'SUCCESS', payment_amount: 245.5 } } });
  const raw = Buffer.from(body, 'utf8');
  const now = (): string => String(Math.floor(Date.now() / 1000));
  const p = new CashfreeProvider(secret, 'app', 'key', 'TEST');

  it('accepts a correctly signed, fresh webhook', () => {
    const ts = now();
    assert.equal(p.verifyWebhook(raw, { 'x-webhook-signature': sign(ts, body, secret), 'x-webhook-timestamp': ts }), true);
  });

  it('⚠️ rejects a signature over the body alone — the timestamp is part of what is signed', () => {
    const ts = now();
    const wrong = createHmac('sha256', secret).update(body).digest('base64');
    assert.equal(p.verifyWebhook(raw, { 'x-webhook-signature': wrong, 'x-webhook-timestamp': ts }), false);
  });

  it('⚠️ rejects a signature over re-serialised JSON — this is why the raw body is kept', () => {
    const ts = now();
    const reserialised = JSON.stringify(JSON.parse(body));
    const differentBytes = Buffer.from(`${body} `, 'utf8'); // one byte of whitespace is enough
    assert.equal(p.verifyWebhook(differentBytes, { 'x-webhook-signature': sign(ts, reserialised, secret), 'x-webhook-timestamp': ts }), false);
  });

  it('rejects the wrong secret, a missing signature and a missing timestamp', () => {
    const ts = now();
    assert.equal(p.verifyWebhook(raw, { 'x-webhook-signature': sign(ts, body, 'other'), 'x-webhook-timestamp': ts }), false);
    assert.equal(p.verifyWebhook(raw, { 'x-webhook-timestamp': ts }), false);
    assert.equal(p.verifyWebhook(raw, { 'x-webhook-signature': sign(ts, body, secret) }), false);
  });

  it('⚠️ rejects a replay — a valid signature from an hour ago must not re-confirm a refunded order', () => {
    const old = String(Math.floor(Date.now() / 1000) - 3600);
    assert.equal(p.verifyWebhook(raw, { 'x-webhook-signature': sign(old, body, secret), 'x-webhook-timestamp': old }), false);
  });

  it('rejects everything when no secret is configured — an unconfigured gateway trusts nobody', () => {
    const ts = now();
    const none = new CashfreeProvider(undefined);
    assert.equal(none.verifyWebhook(raw, { 'x-webhook-signature': sign(ts, body, secret), 'x-webhook-timestamp': ts }), false);
  });

  it('⚠️ reads rupees as rupees — ₹245.50 is 24550 paise, not 24549 or 245', () => {
    const evt = p.parseWebhook(raw);
    assert.equal(evt.amountPaise, 24550);
    assert.equal(evt.orderNumber, 'FB-20260926-0001');
    assert.equal(evt.type, 'captured');
    assert.equal(evt.gatewayPaymentId, '991');
  });

  it('a dropped payment reads as failed, not as captured', () => {
    const dropped = Buffer.from(JSON.stringify({ type: 'PAYMENT_FAILED_WEBHOOK', data: { order: { order_id: 'FB-1' }, payment: { cf_payment_id: 1, payment_status: 'USER_DROPPED' } } }), 'utf8');
    assert.equal(p.parseWebhook(dropped).type, 'failed');
  });

  it('an unknown event is "other" and carries a stable id, so a repeat is still detectable', () => {
    const odd = Buffer.from(JSON.stringify({ type: 'SOMETHING_NEW', data: { order: { order_id: 'FB-2' } } }), 'utf8');
    const evt = p.parseWebhook(odd);
    assert.equal(evt.type, 'other');
    assert.equal(evt.eventId, 'SOMETHING_NEW:FB-2');
  });
});
