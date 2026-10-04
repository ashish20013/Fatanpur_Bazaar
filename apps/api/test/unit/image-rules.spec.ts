import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { IMAGE_RULES, checkImage, imageRuleHint } from '@fb/shared-types';

/**
 * The shopkeeper adds stock from a phone, and a phone makes 12-megapixel, 5 MB photographs. Every
 * one of these is a file he would otherwise have spent a minute of 3G uploading before the server
 * threw it away — and a resize the shared host had to pay for.
 */
describe('image upload rules', () => {
  it('a normal phone photo, cropped square, is accepted', () => {
    assert.equal(checkImage('products', { bytes: 900_000, width: 1200, height: 1200 }), null);
  });

  it('⚠️ a raw 12-megapixel phone photo is refused for size, and the message says what to do', () => {
    const bad = checkImage('products', { bytes: 5_200_000, width: 4032, height: 3024 });
    assert.ok(bad);
    assert.match(bad.hi, /MB/);
    assert.match(bad.hi, /छोटा|Resize/);
  });

  it('too small is refused — upscaling a 200 px photo to 600 just makes it blurred', () => {
    const bad = checkImage('products', { bytes: 40_000, width: 240, height: 240 });
    assert.ok(bad);
    assert.match(bad.hi, /600×600/);
  });

  it('too large is refused even when the file is small — the pixels are thrown away anyway', () => {
    const bad = checkImage('products', { bytes: 500_000, width: 4000, height: 4000 });
    assert.ok(bad);
    assert.match(bad.hi, /2500×2500/);
  });

  it('⚠️ a portrait photo is refused for shape, because cropping it square cuts the goods in half', () => {
    const bad = checkImage('products', { bytes: 800_000, width: 1200, height: 1600 });
    assert.ok(bad);
    assert.match(bad.hi, /Crop|चौकोर/);
  });

  it('a little off square is fine — nobody crops to the exact pixel', () => {
    assert.equal(checkImage('products', { bytes: 800_000, width: 1200, height: 1150 }), null);
    assert.equal(checkImage('categories', { bytes: 800_000, width: 1000, height: 1060 }), null);
  });

  it('a banner must be the 320×50 strip the slot is, or the headline gets sliced in half', () => {
    // The shapes an ad network actually hands out: 320×50 and its 2× and 4× scalings.
    assert.equal(checkImage('banners', { bytes: 300_000, width: 640, height: 100 }), null);
    assert.equal(checkImage('banners', { bytes: 300_000, width: 1280, height: 200 }), null);
    assert.equal(checkImage('banners', { bytes: 300_000, width: 1920, height: 300 }), null);
    // A 3:1 picture — what the slot used to take — is now refused, because cropping it to 6.4:1
    // would throw away the top and bottom of whatever it shows.
    assert.ok(checkImage('banners', { bytes: 300_000, width: 1800, height: 600 }));
    assert.ok(checkImage('banners', { bytes: 300_000, width: 1600, height: 1200 }));
    // Too small to stay sharp on a 2× phone screen, which is the one thing a paid banner cannot be.
    assert.ok(checkImage('banners', { bytes: 50_000, width: 320, height: 50 }));
  });

  it('every rule is self-consistent — a minimum below its own maximum', () => {
    for (const [kind, r] of Object.entries(IMAGE_RULES)) {
      assert.ok(r.minWidth <= r.maxWidth, `${kind}: min width above max`);
      assert.ok(r.minHeight <= r.maxHeight, `${kind}: min height above max`);
      assert.ok(r.maxBytes > 0);
      // A rule nobody can satisfy is worse than no rule: the smallest allowed picture must itself
      // pass its own shape test.
      assert.equal(checkImage(kind as keyof typeof IMAGE_RULES, { bytes: 1000, width: r.minWidth, height: r.minHeight }), null, `${kind}: its own minimum is refused`);
    }
  });

  it('the hint on the button states the real numbers, in both languages', () => {
    const hi = imageRuleHint('products', 'hi');
    assert.match(hi, /600×600/);
    assert.match(hi, /2500×2500/);
    assert.match(imageRuleHint('banners', 'en'), /6\.4:1/);
    assert.match(imageRuleHint('banners', 'en'), /640×100/);
  });
});
