import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { MiniMothProvider } from '../../src/modules/auth/minimoth.provider';

/**
 * MiniMoth's own API is not called here — a unit test that needs a live key and a real phone is a
 * test nobody runs. `fetch` is replaced instead, so the things that actually go wrong in this
 * driver are pinned: the wrong phone format, a naming difference between their REST and SDK, a
 * rejected code, and the difference between "the code was wrong" and "we could not ask".
 */
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function stub(handler: (url: string, init: RequestInit) => { status: number; body: unknown }): { calls: { url: string; body: unknown; headers: Record<string, string> }[] } {
  const calls: { url: string; body: unknown; headers: Record<string, string> }[] = [];
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: JSON.parse(String(init?.body ?? '{}')), headers: (init?.headers ?? {}) as Record<string, string> });
    const { status, body } = handler(url, init ?? {});
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { calls };
}

describe('MiniMoth OTP provider', () => {
  it('sends the phone in E.164 and authenticates with the api key', async () => {
    const s = stub(() => ({ status: 200, body: { message: 'OTP sent', otp_id: 'abc-123' } }));
    const ch = await new MiniMothProvider('mm_test_key_123').send('9616038670');
    assert.equal(ch.ref, 'abc-123');
    assert.equal(s.calls[0].url, 'https://api.minimoth.dev/v1/otp/send');
    assert.deepEqual(s.calls[0].body, { phone: '+919616038670' });
    assert.equal(s.calls[0].headers['X-Api-Key'], 'mm_test_key_123');
  });

  it('accepts either otp_id (REST) or otpId (SDK-style) — a naming detail must not break login', async () => {
    stub(() => ({ status: 200, body: { otpId: 'camel-1' } }));
    assert.equal((await new MiniMothProvider('k').send('9616038670')).ref, 'camel-1');
  });

  it('throws when the send succeeds but carries no id — an OTP we cannot reference is useless', async () => {
    stub(() => ({ status: 200, body: { message: 'ok' } }));
    await assert.rejects(() => new MiniMothProvider('k').send('9616038670'), /no otp id/);
  });

  it('throws on a rejected send so the caller consumes the row and reports failure', async () => {
    stub(() => ({ status: 402, body: { code: 'INSUFFICIENT_CREDITS' } }));
    await assert.rejects(() => new MiniMothProvider('k').send('9616038670'), /minimoth send 402/);
  });

  it('⚠️ sends the code under `code` — their REST field, not the SDK\'s `otp`', async () => {
    const s = stub(() => ({ status: 200, body: { valid: true, accessToken: 'theirs', refreshToken: 'theirs' } }));
    assert.equal(await new MiniMothProvider('k').verify('9616038670', '123456'), true);
    assert.equal(s.calls[0].url, 'https://api.minimoth.dev/v1/otp/verify');
    const body = s.calls[0].body as Record<string, unknown>;
    // This assertion is the whole bug: sending only `otp` rejected every correct OTP.
    assert.equal(body.code, '123456', 'the `code` field must carry the OTP');
    assert.equal(body.phone, '+919616038670');
  });

  it('⚠️ INVALID_OTP_CODE is OUR malformed request, not a wrong OTP — it must not cost an attempt', async () => {
    stub(() => ({ status: 422, body: { code: 'INVALID_OTP_CODE' } }));
    await assert.rejects(() => new MiniMothProvider('k').verify('9616038670', '123456'), /INVALID_OTP_CODE/);
  });

  it('INVALID_OTP is a genuinely wrong code — that one does count', async () => {
    stub(() => ({ status: 400, body: { code: 'INVALID_OTP' } }));
    assert.equal(await new MiniMothProvider('k').verify('9616038670', '000000'), false);
  });

  it('a bad key, an empty wallet or a locked OTP are not the customer\'s fault either', async () => {
    for (const [status, code] of [[401, 'INVALID_API_KEY'], [402, 'INSUFFICIENT_BALANCE'], [429, 'VERIFY_RATE_LIMITED']] as const) {
      stub(() => ({ status, body: { code } }));
      await assert.rejects(() => new MiniMothProvider('k').verify('9616038670', '123456'), new RegExp(code));
    }
  });

  it('treats an explicit valid:false as a wrong code, not an error', async () => {
    stub(() => ({ status: 200, body: { valid: false, code: 'INVALID_OTP' } }));
    assert.equal(await new MiniMothProvider('k').verify('9616038670', '000000'), false);
  });

  it('an expired or already-used OTP reads as wrong, not as a failure', async () => {
    stub(() => ({ status: 400, body: { code: 'OTP_NOT_FOUND' } }));
    assert.equal(await new MiniMothProvider('k').verify('9616038670', '123456'), false);
  });

  it('⚠️ a network failure is NOT a wrong code — it throws, so nobody is told their correct OTP is wrong', async () => {
    globalThis.fetch = (async () => {
      throw new Error('ECONNREFUSED');
    }) as typeof fetch;
    await assert.rejects(() => new MiniMothProvider('k').verify('9616038670', '123456'), /unreachable/);
  });

  it('never returns their tokens to the caller — our sessions are ours', async () => {
    stub(() => ({ status: 200, body: { valid: true, accessToken: 'theirs', refreshToken: 'theirs', sessionId: 's1' } }));
    const out = await new MiniMothProvider('k').verify('9616038670', '123456');
    assert.equal(typeof out, 'boolean');
  });
});
