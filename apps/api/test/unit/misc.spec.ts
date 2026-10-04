import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePing, newTrackState, isStale, DEFAULT_TRACK_CONFIG } from '../../src/domain/tracking-filter';
import { booleanQuery, expandTerms, likePattern, normalizeQuery, terms } from '../../src/domain/search';
import { skeleton, slugify, transliterate } from '../../src/common/utils/translit';
import { fourDigitCode, loginOtp, orderNumber, referralCode, REFERRAL_ALPHABET } from '../../src/common/utils/ids';
import { maskPhone, normalizePhone } from '../../src/common/utils/phone';
import { signToken, verifyToken } from '../../src/common/utils/hash';
import { isOpenAt, hhmmToMinutes, istYmd } from '../../src/common/utils/time';

test('TRK-11 duplicate ts counted once; TRK-12 <100 m → no DB write but still accepted', () => {
  const st = newTrackState();
  const t0 = 1_000_000;
  const a = evaluatePing(st, { lat: 25.742, lng: 81.954, ts: t0 }, t0);
  assert.ok(a.accept && a.persist, 'first ping persists');
  const dup = evaluatePing(st, { lat: 25.742, lng: 81.954, ts: t0 }, t0 + 15000);
  assert.ok(!dup.accept && dup.reason === 'DUPLICATE');
  const near = evaluatePing(st, { lat: 25.7425, lng: 81.954, ts: t0 + 15000 }, t0 + 15000); // ~55 m
  assert.ok(near.accept && !near.persist, 'accepted (broadcast) but not persisted');
  const far = evaluatePing(st, { lat: 25.745, lng: 81.954, ts: t0 + 30000 }, t0 + 30000); // ~330 m
  assert.ok(far.accept && far.persist);
});
test('tracking: throttle <10 s, stale buffer >2 min, India bounds, weak signal flag, 60 s persist', () => {
  const st = newTrackState();
  const t0 = 5_000_000;
  evaluatePing(st, { lat: 25.742, lng: 81.954, ts: t0 }, t0);
  const fast = evaluatePing(st, { lat: 25.742, lng: 81.954, ts: t0 + 3000 }, t0 + 3000);
  assert.ok(!fast.accept && fast.reason === 'THROTTLED');
  const old = evaluatePing(st, { lat: 25.742, lng: 81.954, ts: t0 - 200000 }, t0 + 12000);
  assert.ok(!old.accept && old.reason === 'TOO_OLD');
  assert.ok(!evaluatePing(st, { lat: 51.5, lng: -0.12, ts: t0 + 20000 }, t0 + 20000).accept);
  const weak = evaluatePing(st, { lat: 25.742, lng: 81.954, accuracy: 350, ts: t0 + 61000 }, t0 + 61000);
  assert.ok(weak.accept && weak.weakSignal && weak.persist, '60 s rule persists even without movement');
});
test('TRK-02 stale after 90 s', () => {
  const n = new Date('2026-09-11T10:00:00Z');
  assert.equal(isStale(new Date(n.getTime() - 60000), n, 90), false);
  assert.equal(isStale(new Date(n.getTime() - 91000), n, 90), true);
  assert.equal(isStale(null, n, 90), true);
  assert.equal(DEFAULT_TRACK_CONFIG.persistMeters, 100);
});

test('search: synonym expansion + boolean query + LIKE escape', () => {
  const syn = new Map([['alu', 'aloo potato आलू'], ['pyaz', 'pyaaz onion प्याज']]);
  assert.deepEqual(expandTerms(['alu'], syn), ['alu', 'aloo', 'potato', 'आलू']);
  assert.equal(booleanQuery(['alu'], syn), '+(alu* aloo* potato* आलू*)');
  assert.equal(booleanQuery(['दल'], new Map()), null, 'short Devanagari term → LIKE fallback');
  assert.equal(normalizeQuery('  +aloo* -"x" '), 'aloo x');
  assert.deepEqual(terms('aloo  pyaz'), ['aloo', 'pyaz']);
  assert.equal(likePattern('50%_off'), '%50\\%\\_off%');
});

test('translit / skeleton / slug', () => {
  assert.equal(transliterate('रानीगंज'), 'raaneeganj');
  assert.equal(skeleton('रानीगंज'), skeleton('Rani Ganj'));
  assert.equal(skeleton('फतनपुर'), skeleton('Fatanpur'));
  assert.equal(slugify('Aloo (Potato) 1 kg'), 'aloo-potato-1-kg');
  assert.equal(slugify('आलू'), 'aaloo');
});

test('ids: OTP 6 digits, 4-digit codes padded, referral alphabet has no look-alikes', () => {
  for (let i = 0; i < 200; i++) {
    assert.match(loginOtp(), /^\d{6}$/);
    assert.match(fourDigitCode(), /^\d{4}$/);
  }
  const rc = referralCode();
  assert.match(rc, /^[A-Z2-9]{8}$/);
  for (const bad of ['0', 'O', '1', 'I', 'L']) assert.equal(REFERRAL_ALPHABET.includes(bad), false);
  assert.equal(orderNumber('20260908', 7), 'FB-20260908-0007');
});
test('phone normalise + mask', () => {
  assert.equal(normalizePhone('9876543210'), '919876543210');
  assert.equal(normalizePhone('+91 98765-43210'), '919876543210');
  assert.equal(normalizePhone('5876543210'), null);
  assert.equal(normalizePhone('98765'), null);
  assert.equal(maskPhone('919876543210'), '9876XXXX10');
});
test('signed file token: tamper → null', () => {
  const t = signToken({ rxId: 1, uid: 2, exp: 99 }, 's'.repeat(32));
  assert.deepEqual(verifyToken(t, 's'.repeat(32)), { rxId: 1, uid: 2, exp: 99 });
  assert.equal(verifyToken(t.slice(0, -2) + 'xx', 's'.repeat(32)), null);
  assert.equal(verifyToken(t, 'x'.repeat(32)), null);
});
test('time: store hours incl. overnight', () => {
  assert.equal(isOpenAt(hhmmToMinutes('08:00'), '07:00', '21:00'), true);
  assert.equal(isOpenAt(hhmmToMinutes('22:00'), '07:00', '21:00'), false);
  assert.equal(isOpenAt(hhmmToMinutes('01:00'), '20:00', '02:00'), true);
  assert.equal(istYmd(new Date('2026-09-10T20:00:00Z')), '20260911');
});

import { sniffMime } from '../../src/common/utils/filetype';
test('SEC-13 magic-byte sniffing: .php renamed to .jpg is rejected', () => {
  assert.equal(sniffMime(Buffer.from('<?php system($_GET["c"]); ?>  ')), null);
  assert.equal(sniffMime(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)])), 'image/jpeg');
  assert.equal(sniffMime(Buffer.from('%PDF-1.7 xxxxxxxx')), 'application/pdf');
  assert.equal(sniffMime(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')])), 'image/webp');
});

import { sanitizeHtml } from '../../src/common/utils/sanitize';
test('SEC-11 admin HTML sanitiser: scripts/handlers/js: links removed, allowlist kept', () => {
  assert.equal(sanitizeHtml('<p onclick="x()">हाँ</p><script>alert(1)</script>'), '<p>हाँ</p>');
  assert.equal(sanitizeHtml('<a href="javascript:alert(1)">x</a>'), '<a>x</a>');
  assert.equal(sanitizeHtml('<a href="/sabzi">सब्ज़ी</a>'), '<a href="/sabzi">सब्ज़ी</a>');
  assert.equal(sanitizeHtml('<img src=x onerror=alert(1)><h2>शीर्षक</h2>'), '<h2>शीर्षक</h2>');
  assert.match(sanitizeHtml('<a href="https://x.com">x</a>'), /rel="nofollow noopener"/);
});
