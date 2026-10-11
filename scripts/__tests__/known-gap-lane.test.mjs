import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO_ROOT } from '../lib/cli.mjs';
import { parseSpecFile } from '../lib/corpus.mjs';
import {
  caseArgs,
  classifyGap,
  findKnownGaps,
  knownGapsOf,
  recordsFor,
  runKnownGaps,
  sameFile,
} from '../known-gap-lane.mjs';

const FIXTURES = 'scripts/__fixtures__/known-gap-lane';
const PROJECT = `${FIXTURES}/project`;

const record = (overrides) => ({
  title: 't',
  titlePath: ['t'],
  file: 'demo/specs/gaps.spec.ts',
  line: 10,
  project: 'api',
  tags: [],
  annotations: [],
  expectedStatus: 'failed',
  outcome: 'expected',
  attempts: [{ status: 'failed', retry: 0, durationMs: 1, errors: [] }],
  ...overrides,
});

test('selection reads the arm from the syntax tree, with the issue key', () => {
  const gaps = knownGapsOf(parseSpecFile(REPO_ROOT, `${FIXTURES}/arms.spec.ts`));
  assert.deepEqual(
    gaps.map((g) => [g.caseId, g.key, g.armed, g.tagged]),
    [
      ['TC-ARM-01', 'ARM-1', true, false],
      ['TC-ARM-02', 'ARM-2', true, false],
      ['TC-ARM-03', 'ARM-3', true, false],
      ['TC-ARM-04', 'ARM-4', true, false],
      ['TC-ARM-05', null, false, true],
      ['TC-ARM-10', null, true, false],
    ],
  );
  assert.equal(gaps[0].why, 'returns 500 for an empty body');
  assert.equal(gaps[0].line, 6);
});

test('a repository without known gaps selects nothing', (t) => {
  const empty = mkdtempSync(join(tmpdir(), 'no-gaps-'));
  t.after(() => rmSync(empty, { recursive: true, force: true }));
  assert.deepEqual(findKnownGaps(empty), []);
});

test('records are matched by project, line and file suffix', () => {
  const gap = { file: `${PROJECT}/services/demo/specs/gaps.spec.ts`, line: 10 };
  const records = [
    record({}),
    record({ project: 'preflight' }),
    record({ line: 16 }),
    record({ file: 'other/specs/gaps.spec.ts' }),
  ];
  assert.equal(recordsFor(gap, records, 'api').length, 1);
  assert.ok(sameFile('a/b/c.spec.ts', 'b/c.spec.ts'));
  assert.ok(!sameFile('a/xb/c.spec.ts', 'b/c.spec.ts'));
});

test('each record shape maps to one verdict', () => {
  const passed = [{ status: 'passed', retry: 0, durationMs: 1, errors: [] }];
  const failed = [{ status: 'failed', retry: 0, durationMs: 1, errors: ['Error: boom\nstack'] }];
  const timedOut = [{ status: 'timedOut', retry: 0, durationMs: 1, errors: [] }];
  const cases = [
    [[], 'not-run'],
    [[record({})], 'open'],
    [[record({ outcome: 'unexpected', attempts: passed })], 'passing'],
    [[record({ outcome: 'unexpected', attempts: timedOut })], 'errored'],
    [[record({ expectedStatus: 'passed', outcome: 'unexpected', attempts: failed })], 'errored'],
    [[record({ expectedStatus: 'passed', outcome: 'expected', attempts: passed })], 'unarmed'],
    [[record({ outcome: 'skipped', attempts: [] })], 'skipped'],
    [[record({}), record({})], 'errored'],
  ];
  for (const [records, verdict] of cases) {
    assert.equal(classifyGap(records).verdict, verdict, JSON.stringify(records));
  }
  const before = classifyGap([
    record({ expectedStatus: 'passed', outcome: 'unexpected', attempts: failed }),
  ]);
  assert.equal(before.detail, 'failed before the arm: Error: boom');
});

test('every gap gets its own Playwright process, selected by file and line', () => {
  const calls = [];
  const run = (root, args, env) => {
    calls.push({ root, args, env });
    return { exitCode: 1, records: [], stdout: '', stderr: 'config error' };
  };
  const gaps = [
    { file: 'services/demo/specs/a.spec.ts', line: 3 },
    { file: 'services/demo/specs/b.spec.ts', line: 7 },
  ];
  const results = runKnownGaps(gaps, {
    scanRoot: join(REPO_ROOT, 'x'),
    runRoot: REPO_ROOT,
    project: 'api',
    run,
  });
  assert.deepEqual(
    calls.map((c) => c.args),
    [
      caseArgs('x/services/demo/specs/a.spec.ts', 3, 'api'),
      caseArgs('x/services/demo/specs/b.spec.ts', 7, 'api'),
    ],
  );
  assert.ok(calls.every((c) => c.env.QA_RETRIES === '0'));
  assert.deepEqual(
    results.map((r) => r.verdict),
    ['not-run', 'not-run'],
  );
  assert.match(results[0].detail, /exited 1: config error/);
});

test('a retried case stops the lane', () => {
  const run = () => ({
    exitCode: 0,
    records: [record({ attempts: [{ status: 'failed' }, { status: 'failed' }] })],
  });
  assert.throws(
    () =>
      runKnownGaps([{ file: 'f.spec.ts', line: 1 }], {
        scanRoot: REPO_ROOT,
        runRoot: REPO_ROOT,
        project: 'api',
        run,
      }),
    /retried/,
  );
});

test('end to end: open, passing and broken gaps of an offline project', () => {
  const scanRoot = join(REPO_ROOT, PROJECT);
  const gaps = findKnownGaps(scanRoot);
  assert.deepEqual(
    gaps.map((g) => g.caseId),
    ['TC-DEMO-01', 'TC-DEMO-02', 'TC-DEMO-03'],
  );
  const results = runKnownGaps(gaps, {
    scanRoot,
    runRoot: REPO_ROOT,
    project: 'api',
    config: `${PROJECT}/playwright.config.mjs`,
  });
  assert.deepEqual(
    results.map((r) => [r.caseId, r.key, r.verdict]),
    [
      ['TC-DEMO-01', 'DEMO-11', 'open'],
      ['TC-DEMO-02', 'DEMO-12', 'passing'],
      ['TC-DEMO-03', 'DEMO-13', 'errored'],
    ],
  );
});
