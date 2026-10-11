import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadAdapter } from '../tm/adapters/index.mjs';
import { buildManifest } from '../tm/manifest.mjs';
import { publish, report, testManagementConfig } from '../tm/run.mjs';

const ROOT = join(import.meta.dirname, '..', '__fixtures__', 'coverage-status');
const T0 = Date.UTC(2026, 9, 9, 12);

function quietLog() {
  const lines = [];
  const add = (level) => (message, fields) => lines.push({ level, message, ...fields });
  return { lines, runId: 'r-test', info: add('info'), warn: add('warn'), error: add('error') };
}

function manifestWith(results) {
  const dir = mkdtempSync(join(tmpdir(), 'tm-run-results-'));
  results.forEach((result, i) =>
    writeFileSync(
      join(dir, `r${i}-result.json`),
      JSON.stringify({
        start: T0,
        stop: T0 + 50,
        labels: [],
        fullName: 'services/shop/specs/items.spec.ts › t',
        ...result,
      }),
    ),
  );
  return buildManifest({ root: ROOT, resultsDir: dir, runId: 'r-test' });
}

const localAdapter = () =>
  loadAdapter('local', { dir: 'store' }, { root: mkdtempSync(join(tmpdir(), 'tm-run-')) });

test('publish sends automated and published cases only, and is idempotent', async () => {
  const adapter = await localAdapter();
  const manifest = manifestWith([]);
  const log = quietLog();
  const first = await publish({ adapter, manifest, log });
  const statuses = new Map(manifest.cases.map((c) => [c.identity, c.status]));
  assert.ok(first.published.length > 0);
  assert.ok(
    first.published.every((p) => ['automated', 'published'].includes(statuses.get(p.identity))),
  );
  assert.ok(first.heldBack.some((h) => h.reason === 'status approved'));
  assert.ok(first.heldBack.some((h) => h.reason === 'status draft'));
  assert.ok(first.heldBack.some((h) => h.reason === 'not in a registry'));

  const second = await publish({ adapter, manifest, log });
  assert.deepEqual(second.published, []);
  assert.equal(second.unchanged.length, first.published.length);
});

test('a dry run sends nothing', async () => {
  const adapter = await localAdapter();
  const outcome = await publish({
    adapter,
    manifest: manifestWith([]),
    log: quietLog(),
    dryRun: true,
  });
  assert.ok(outcome.wouldPublish.length > 0);
  assert.deepEqual(await adapter.readDefinitions(outcome.wouldPublish), {});
});

test('report starts, fills and closes a run; unpublished cases and unattributed results are listed', async () => {
  const adapter = await localAdapter();
  const manifest = manifestWith([
    { testCaseId: 'shop-v1-TC-ITEM-03', status: 'passed', name: 'TC-ITEM-03' },
    { testCaseId: 'shop-v1-TC-ITEM-01', status: 'failed', name: 'TC-ITEM-01 (a draft)' },
    { testCaseId: '0123456789abcdef0123456789abcdef', name: 'no case id' },
  ]);
  const log = quietLog();
  await publish({ adapter, manifest, log });
  const outcome = await report({ adapter, manifest, log, name: 'nightly' });
  assert.deepEqual(outcome.reported, ['shop-v1-TC-ITEM-03']);
  assert.deepEqual(
    outcome.skipped.map((s) => s.identity),
    ['shop-v1-TC-ITEM-01'],
  );
  assert.deepEqual(
    outcome.excluded.map((e) => e.name),
    ['no case id'],
  );
  const stored = await adapter.readRun(outcome.run);
  assert.ok(stored.closedAt, 'the run is closed');
  assert.equal(stored.runId, 'r-test');
  assert.ok(
    log.lines.some(
      (l) => l.message === 'result without a case identity' && l.name === 'no case id',
    ),
  );
});

test('the run is closed even when reporting fails', async () => {
  const adapter = await localAdapter();
  const closed = [];
  const failing = {
    ...adapter,
    reportResults: async () => {
      throw new Error('tool rejected the batch');
    },
    closeRun: async (run) => {
      closed.push(run.id);
      return { closed: true, alreadyClosed: false };
    },
  };
  const manifest = manifestWith([{ testCaseId: 'shop-v1-TC-ITEM-03', status: 'passed' }]);
  await assert.rejects(
    report({ adapter: failing, manifest, log: quietLog(), name: 'x' }),
    /rejected the batch/,
  );
  assert.equal(closed.length, 1);
});

test('no results means no run is started', async () => {
  const adapter = await localAdapter();
  const outcome = await report({ adapter, manifest: manifestWith([]), log: quietLog(), name: 'x' });
  assert.deepEqual(outcome, { skipped: true, reason: 'no results' });
  // A results-first tool such as TestOps would otherwise get an empty launch.
  const resultsFirst = { ...adapter, capabilities: { definitions: false, runs: true } };
  const empty = await report({
    adapter: resultsFirst,
    manifest: manifestWith([]),
    log: quietLog(),
    name: 'x',
  });
  assert.deepEqual(empty, { skipped: true, reason: 'no results' });
});

test('providers: unknown and documented-only ones fail with a pointer; config defaults', async () => {
  await assert.rejects(loadAdapter('nope'), /Unknown test-management provider "nope"/);
  await assert.rejects(loadAdapter('testrail'), /not implemented.*docs\/test-management\.md/);
  assert.deepEqual(testManagementConfig(ROOT, {}), { provider: 'allure-report', options: {} });
});

test('QA_TM_PROVIDER replaces the configured provider; options follow only their own provider', () => {
  const root = mkdtempSync(join(tmpdir(), 'tm-run-config-'));
  writeFileSync(
    join(root, 'qa-config.example.json'),
    JSON.stringify({ test_management: { provider: 'local', options: { dir: 'reports/tm/x' } } }),
  );
  assert.deepEqual(testManagementConfig(root, {}), {
    provider: 'local',
    options: { dir: 'reports/tm/x' },
  });
  assert.deepEqual(testManagementConfig(root, { QA_TM_PROVIDER: 'allure-testops' }), {
    provider: 'allure-testops',
    options: {},
  });
  assert.deepEqual(testManagementConfig(root, { QA_TM_PROVIDER: 'local' }), {
    provider: 'local',
    options: { dir: 'reports/tm/x' },
  });
  assert.deepEqual(testManagementConfig(root, { QA_TM_PROVIDER: '  ' }).provider, 'local');
});
