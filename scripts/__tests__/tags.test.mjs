import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CATEGORY_TAGS, LAYER_TAGS, TAGS } from '../lib/tags.mjs';

const RULE = join(import.meta.dirname, '..', '..', '.claude', 'rules', 'tagging.md');

test('the tagging rule documents exactly the tags of the taxonomy, on the right axis', () => {
  const rows = readFileSync(RULE, 'utf8')
    .split(/\r?\n/)
    .map((line) => /^\| `(@[a-z][a-z0-9-]*)` \| (layer|category) \|/.exec(line))
    .filter(Boolean)
    .map(([, tag, axis]) => [tag, axis]);
  assert.deepEqual(rows, [
    ...LAYER_TAGS.map((tag) => [tag, 'layer']),
    ...CATEGORY_TAGS.map((tag) => [tag, 'category']),
  ]);
  assert.equal(new Set(TAGS).size, TAGS.length, 'no tag is listed twice');
});
