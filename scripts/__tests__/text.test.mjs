import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeRegExp, htmlToText } from '../lib/text.mjs';

test('escapeRegExp makes every metacharacter literal', () => {
  for (const literal of ['0.1.0', '[0.1.0]', 'a.b*c+?^${}()|[]\\', 'specs/pet.spec.ts']) {
    const pattern = new RegExp(`^${escapeRegExp(literal)}$`);
    assert.ok(pattern.test(literal), literal);
    assert.ok(!pattern.test(`${literal}x`), `${literal} matches only itself`);
  }
  assert.ok(!new RegExp(`^${escapeRegExp('0.1.0')}$`).test('0x1y0'), 'a dot is not a wildcard');
});

test('htmlToText removes tags until none is left, then decodes entities', () => {
  assert.equal(htmlToText('<p>see <code>&lt;petId&gt;</code></p>'), 'see <petId>');
  assert.equal(htmlToText('<sc<x>ript>alert(1)</script>'), 'ript>alert(1)');
  assert.equal(htmlToText('<<b>i>x</<b>i>'), 'i>xi>');
  assert.ok(!/<script/i.test(htmlToText('<scr<b>ipt>x</scr</b>ipt>')), 'no tag reassembles');
  assert.equal(htmlToText(null), '');
});
