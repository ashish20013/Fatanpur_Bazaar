import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeHtml } from '../../src/common/utils/sanitize';

test('sanitize: allowed tags survive, attributes are stripped', () => {
  assert.equal(sanitizeHtml('<p class="x" onclick="a()">ok <b>bold</b></p>'), '<p>ok <b>bold</b></p>');
  assert.equal(sanitizeHtml('<h2>शीर्षक</h2><ul><li>एक</li></ul>'), '<h2>शीर्षक</h2><ul><li>एक</li></ul>');
});

test('sanitize: script/style/svg blocks are removed with their content', () => {
  assert.equal(sanitizeHtml('a<script>alert(1)</script>b<style>*{}</style>c<svg onload=x()><g/></svg>d'), 'abcd');
});

test('sanitize: an UNCLOSED tag can never become markup (the old regex let this through)', () => {
  const out = sanitizeHtml('<p>ok</p><img src=x onerror=alert(document.domain) x=');
  assert.equal(out, '<p>ok</p>&lt;img src=x onerror=alert(document.domain) x=');
  assert.ok(!/<img/i.test(out));
});

test('sanitize: disallowed but well-formed tags are dropped, stray brackets escaped', () => {
  assert.equal(sanitizeHtml('<img src=x onerror=alert(1)>hi'), 'hi');
  assert.equal(sanitizeHtml('2 < 3 > 1'), '2 &lt; 3 &gt; 1');
  // block removal can only ever leave allowed, re-emitted tags behind
  assert.equal(sanitizeHtml('<<script>x</script>b>'), '<b>');
});

test('sanitize: links keep only safe hrefs', () => {
  assert.equal(sanitizeHtml('<a href="javascript:alert(1)">x</a>'), '<a>x</a>');
  assert.equal(sanitizeHtml('<a href="/faq">x</a>'), '<a href="/faq">x</a>');
  assert.equal(sanitizeHtml("<a href='https://ex.in/a'>x</a>"), '<a href="https://ex.in/a" rel="nofollow noopener" target="_blank">x</a>');
  assert.equal(sanitizeHtml('<a href="//evil.com">x</a>'), '<a>x</a>');
});
