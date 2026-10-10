// coverage-status (GATE-04): every lifecycle rule against a fixture repository with one row per
// situation, the exact set of findings, the coverage numbers and the command-line contract.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { coverageStatus, inspectTest, RULES } from '../coverage-status.mjs';
import { parseSpecSource } from '../lib/corpus.mjs';
import { REPO_ROOT } from '../lib/cli.mjs';

const ROOT = join(import.meta.dirname, '..', '__fixtures__', 'coverage-status');
const SCRIPT = join(import.meta.dirname, '..', 'coverage-status.mjs');
const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });

const ITEMS = 'services/shop/registry/items.md';
const STOCK = 'services/shop/registry/stock.md';
const SPEC = 'services/shop/specs/items.spec.ts';
const OTHER = 'services/shop/specs/other.spec.ts';

const EXPECTED = [
  ['registry-structure', `${STOCK}:16`, null],
  ['stale-status', `${ITEMS}:20`, 'TC-ITEM-02'],
  ['spec-not-found', `${ITEMS}:22`, 'TC-ITEM-04'],
  ['test-duplicate', `${ITEMS}:23`, 'TC-ITEM-05'],
  ['test-missing', `${ITEMS}:24`, 'TC-ITEM-06'],
  ['test-disabled', `${ITEMS}:25`, 'TC-ITEM-07'],
  ['not-in-results', `${ITEMS}:27`, 'TC-ITEM-09'],
  ['blocked-key', `${ITEMS}:29`, 'TC-ITEM-11'],
  ['blocked-not-armed', `${ITEMS}:30`, 'TC-ITEM-12'],
  ['blocked-but-passing', `${ITEMS}:31`, 'TC-ITEM-13'],
  ['spec-missing', `${ITEMS}:32`, 'TC-ITEM-14'],
  ['unknown-endpoint', `${STOCK}:1`, null],
  ['below-floor', `${STOCK}:1`, null],
  ['orphan-test', `${SPEC}:34`, 'TC-ITEM-20'],
  ['untracked-known-gap', `${OTHER}:7`, null],
  ['untracked-known-gap', `${OTHER}:11`, 'TC-ITEM-15'],
];

const shape = (findings) =>
  findings.map((f) => [f['rule'], `${f['file']}:${f['line']}`, f['case']]);

test('the fixture yields exactly the expected findings, structure first', async () => {
  const status = await coverageStatus(ROOT);
  assert.deepEqual(shape(status['findings']), EXPECTED);
  assert.deepEqual(status['notes'], []);
  for (const finding of status['findings']) assert.ok(RULES.includes(finding['rule']));
});

test('messages carry the evidence: both floor numbers, the other file, the key', async () => {
  const byRule = Object.fromEntries(
    (await coverageStatus(ROOT))['findings'].map((f) => [f['rule'], f['message']]),
  );
  assert.equal(
    byRule['below-floor'],
    '1 case(s) on the contract axis, the floor of its 1 endpoint(s) is 3 (gap 2)',
  );
  assert.match(byRule['test-missing'], /declared in services\/shop\/specs\/other\.spec\.ts:5/);
  assert.match(byRule['test-duplicate'], /items\.spec\.ts:10, .*items\.spec\.ts:12/);
  assert.match(byRule['blocked-key'], /"later" does not match tracker\.key_pattern/);
  assert.match(byRule['registry-structure'], /row has 7 cells, expected 8/);
  assert.match(byRule['unknown-endpoint'], /DELETE \/items\/\{itemId\}/);
});

test('coverage numbers per registry are computed, with the floor from derive-floor', async () => {
  const [pack] = (await coverageStatus(ROOT))['packs'];
  const [items, stock] = pack['registries'];
  assert.deepEqual(items['byStatus'], {
    draft: 1,
    approved: 1,
    automated: 7,
    published: 2,
    blocked: 4,
  });
  assert.equal(items['cases'], 15);
  assert.equal(items['automated'], 9);
  assert.equal(items['automatedPercent'], 60);
  assert.deepEqual(items['floorByEndpoint'], [
    { key: 'POST /items', floor: 5 },
    { key: 'GET /items/{itemId}', floor: 3 },
  ]);
  assert.equal(items['floor'], 8);
  assert.equal(items['gap'], 0);
  assert.deepEqual([items['floorAxisCases'], items['beyondFloor']], [13, 2]);
  assert.equal(stock['floor'], 3);
  assert.equal(stock['gap'], 2);
});

test('without results the run-based checks are skipped visibly, not silently', async () => {
  const status = await coverageStatus(ROOT, { resultsDir: join(ROOT, 'no-such-results') });
  const rules = status['findings'].map((f) => f['rule']);
  assert.ok(!rules.includes('not-in-results'));
  assert.ok(!rules.includes('blocked-but-passing'));
  assert.equal(status['findings'].length, EXPECTED.length - 2);
  assert.equal(status['notes'].length, 1);
  assert.match(
    status['notes'][0],
    /No result files in no-such-results: "published in the latest run"/,
  );
});

test('only the latest run counts, and a retried case keeps its last attempt', async () => {
  // TC-ITEM-09 passed in an earlier run only; TC-ITEM-08 failed, then passed on retry.
  const status = await coverageStatus(ROOT);
  assert.deepEqual(status['results'], { dir: 'allure-results', found: true, files: 6, run: 5 });
  assert.ok(status['findings'].some((f) => f['case'] === 'TC-ITEM-09'));
  assert.ok(!status['findings'].some((f) => f['case'] === 'TC-ITEM-08'));
});

test('a test is read for its knownGap keys and every way it can be skipped', () => {
  const source = `
test.describe.skip('parked block', () => {
  test('TC-A-01 inside', async () => {
    test.skip(isReadOnly, 'BUG-1: read-only target');
    test.fail(true, await knownGap('BUG-2', 'why'));
  });
});
test.fixme('TC-A-02 declared fixme', async () => {});
test('TC-A-03 skipped in the body', async () => { test.skip(); });
`;
  const parsed = parseSpecSource(source, 'x.spec.ts');
  const [inside, fixme, bare] = parsed['tests'].map((t) => inspectTest(t, parsed['sourceFile']));
  assert.deepEqual(inside['keys'], ['BUG-2']);
  assert.deepEqual(
    inside['skips'].map((s) => [s['how'], s['unconditional']]),
    [
      ['test.describe.skip', true],
      ['test.skip() in the body', false],
    ],
  );
  assert.match(inside['skips'][1]['text'], /BUG-1/);
  assert.deepEqual(
    fixme['skips'].map((s) => s['how']),
    ['test.fixme'],
  );
  assert.deepEqual(
    bare['skips'].map((s) => s['unconditional']),
    [true],
  );
});

test('cli: exit 1 on findings, 0 with --report-only, JSON on demand', () => {
  const failing = run('--root', ROOT);
  assert.equal(failing.status, 1, failing.stderr);
  assert.match(failing.stdout, /16 finding\(s\):/);
  assert.match(failing.stdout, /automated 9\/15 \(60%\), floor 8, gap 0/);
  assert.equal(run('--root', ROOT, '--report-only').status, 0);
  const json = run('--root', ROOT, '--json', '--report-only');
  assert.equal(JSON.parse(json.stdout)['findings'].length, EXPECTED.length);
  assert.equal(run('--root', ROOT, '--spec', 'x.json').status, 2);
});

test('a tree without registries reports that cleanly and passes', () => {
  const empty = mkdtempSync(join(tmpdir(), 'coverage-status-'));
  try {
    mkdirSync(join(empty, 'services'));
    const result = run('--root', empty, '--results', join(ROOT, 'no-such-results'));
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /No registries under services\/\*\/registry\/ yet/);
    assert.match(result.stdout, /No findings\./);
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
});

test('the repository registries have no findings', () => {
  const result = run('--root', REPO_ROOT, '--results', join(ROOT, 'no-such-results'));
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /No findings\./);
});
