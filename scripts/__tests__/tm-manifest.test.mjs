import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildManifest } from '../tm/manifest.mjs';

// A small repository with one pack: registry, specs, and an Allure results directory.
const ROOT = join(import.meta.dirname, '..', '__fixtures__', 'coverage-status');
const T0 = Date.UTC(2026, 9, 9, 12);

function resultsDir(results) {
  const dir = mkdtempSync(join(tmpdir(), 'tm-results-'));
  results.forEach((result, i) =>
    writeFileSync(join(dir, `r${i}-result.json`), JSON.stringify(result)),
  );
  return dir;
}

const result = (fields) => ({
  status: 'passed',
  start: T0,
  stop: T0 + 100,
  labels: [],
  fullName: 'services/shop/specs/items.spec.ts › a test',
  ...fields,
});

test('cases come from the registries, joined with the spec test that automates them', () => {
  const manifest = buildManifest({ root: ROOT, resultsDir: resultsDir([]), now: new Date(T0) });
  const byId = new Map(manifest.cases.map((c) => [c.caseId, c]));
  assert.equal(manifest.manifestVersion, 1);
  assert.equal(manifest.generatedAt, '2026-10-09T12:00:00.000Z');
  assert.deepEqual(manifest.packs, ['shop']);
  const draft = byId.get('TC-ITEM-01');
  assert.deepEqual(
    [draft.identity, draft.source, draft.status, draft.spec],
    ['shop-v1-TC-ITEM-01', 'registry', 'draft', null],
  );
  assert.equal(byId.get('TC-ITEM-03').spec.file, 'services/shop/specs/items.spec.ts');
  assert.ok(
    manifest.cases.some((c) => c.source === 'spec'),
    'an unregistered spec test is listed',
  );
});

test('results of the latest run attach to cases; retries collapse; the rest is excluded by name', () => {
  const dir = resultsDir([
    // An older run, more than ten minutes earlier: ignored.
    result({
      testCaseId: 'shop-v1-TC-ITEM-03',
      status: 'failed',
      start: T0 - 3_600_000,
      stop: T0 - 3_599_000,
    }),
    result({ testCaseId: 'shop-v1-TC-ITEM-03', status: 'failed', name: 'TC-ITEM-03 first try' }),
    result({
      testCaseId: 'shop-v1-TC-ITEM-03',
      start: T0 + 200,
      stop: T0 + 300,
      name: 'TC-ITEM-03 retry',
    }),
    result({
      testCaseId: 'shop-v1-TC-ITEM-08',
      status: 'failed',
      links: [{ type: 'issue', name: 'BUG-7', url: 'https://tracker.example/BUG-7' }],
      labels: [{ name: 'run', value: 'abc123' }],
    }),
    result({ testCaseId: '5f2b1c0d9e8a7f6b5c4d3e2f1a0b9c8d', name: 'a test without a case id' }),
    result({ testCaseId: 'other-v2-TC-ZZZ-01', name: 'TC-ZZZ-01 from another pack' }),
    // A unit test of the core, run later: not a case, and it must not become the latest run.
    result({
      fullName: 'helpers/__tests__/x.spec.ts › unit',
      start: T0 + 3_600_000,
      stop: T0 + 3_600_100,
    }),
  ]);
  const manifest = buildManifest({ root: ROOT, resultsDir: dir });
  assert.deepEqual([manifest.runSize, manifest.outside], [5, 1]);
  assert.deepEqual(
    manifest.results.map((r) => [r.identity, r.status, r.attempts, r.issues, r.run]),
    [
      ['shop-v1-TC-ITEM-03', 'passed', 2, [], null],
      ['shop-v1-TC-ITEM-08', 'failed', 1, ['BUG-7'], 'abc123'],
    ],
  );
  assert.deepEqual(
    manifest.excluded.map((e) => [e.name, e.reason.split(':')[0]]),
    [
      ['a test without a case id', 'no case identity'],
      [
        'TC-ZZZ-01 from another pack',
        'identity other-v2-TC-ZZZ-01 matches no case of the selected packs',
      ],
    ],
  );
});

test('a missing results directory yields cases and no results', () => {
  const manifest = buildManifest({ root: ROOT, resultsDir: join(tmpdir(), 'does-not-exist-tm') });
  assert.deepEqual([manifest.results, manifest.excluded, manifest.runSize], [[], [], 0]);
  assert.ok(manifest.cases.length > 0);
});
