import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO_ROOT } from '../lib/cli.mjs';
import { parseSpecFile } from '../lib/corpus.mjs';
import {
  ALL_PACKS_PROJECT,
  caseProject,
  laneProject,
  packOfSpec,
  projectMatches,
} from '../lib/playwright-lane.mjs';
import {
  caseArgs,
  classifyGap,
  findKnownGaps,
  knownGapsOf,
  PROBLEM_VERDICTS,
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
  project: 'api-demo',
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
    'TC-ARM-11 is armed but quarantined: every run but the flake lane leaves it out',
  );
  assert.equal(gaps[0].why, 'returns 500 for an empty body');
  assert.equal(gaps[0].line, 6);
});

test('a repository without known gaps selects nothing', (t) => {
  const empty = mkdtempSync(join(tmpdir(), 'no-gaps-'));
  t.after(() => rmSync(empty, { recursive: true, force: true }));
  assert.deepEqual(findKnownGaps(empty), []);
});

test('records are matched by project filter, line and file suffix', () => {
  const gap = { file: `${PROJECT}/services/demo/specs/gaps.spec.ts`, line: 10 };
  const records = [
    record({}),
    record({ project: 'preflight-demo' }),
    record({ line: 16 }),
    record({ file: 'other/specs/gaps.spec.ts' }),
  ];
  assert.equal(recordsFor(gap, records, 'api-demo').length, 1);
  assert.equal(
    recordsFor(gap, records, 'api-*').length,
    1,
    'a wildcard filter matches like --project',
  );
  assert.equal(recordsFor(gap, records, 'API-DEMO').length, 1, 'without regard to case');
  assert.equal(recordsFor(gap, records, 'api-other').length, 0);
  assert.ok(sameFile('a/b/c.spec.ts', 'b/c.spec.ts'));
  assert.ok(!sameFile('a/xb/c.spec.ts', 'b/c.spec.ts'));
});

test('the lane project: an explicit --project, else --service, else every pack; a case runs in its own pack', () => {
  assert.equal(laneProject({}), ALL_PACKS_PROJECT);
  assert.equal(ALL_PACKS_PROJECT, 'api-*');
  assert.equal(laneProject({ service: 'shop' }), 'api-shop');
  assert.equal(laneProject({ service: 'shop', project: 'unit' }), 'unit');
  assert.equal(packOfSpec('x\\services\\shop\\specs\\a.spec.ts'), 'shop');
  assert.equal(packOfSpec('specs/a.spec.ts'), null);
  assert.equal(caseProject('services/shop/specs/a.spec.ts'), 'api-shop');
  assert.equal(caseProject('services/shop/specs/a.spec.ts', 'custom'), 'custom');
  assert.equal(caseProject('specs/a.spec.ts'), 'api-*');
  assert.ok(projectMatches('api-*', 'api-my-pack'));
  assert.ok(!projectMatches('api-*', 'preflight-my-pack'));
  assert.ok(!projectMatches('api', 'api-shop'), 'a plain name matches only itself');
  assert.ok(projectMatches('a.b', 'a.b') && !projectMatches('a.b', 'axb'));
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

test('every gap gets its own Playwright process in its pack project, selected by file and line', () => {
  const calls = [];
  const run = (root, args, env) => {
    calls.push({ root, args, env });
    return { exitCode: 1, records: [], stdout: '', stderr: 'config error' };
  };
  const gaps = [
    { file: 'services/demo/specs/a.spec.ts', line: 3 },
    { file: 'services/shop/specs/b.spec.ts', line: 7 },
  ];
  const results = runKnownGaps(gaps, {
    scanRoot: join(REPO_ROOT, 'x'),
    runRoot: REPO_ROOT,
    run,
  });
  assert.deepEqual(
    calls.map((c) => c.args),
    [
      caseArgs('x/services/demo/specs/a.spec.ts', 3, 'api-demo'),
      caseArgs('x/services/shop/specs/b.spec.ts', 7, 'api-shop'),
    ],
  );
  const explicit = [];
  runKnownGaps(gaps.slice(0, 1), {
    scanRoot: REPO_ROOT,
    runRoot: REPO_ROOT,
    project: 'custom',
    run: (root, args) => {
      explicit.push(args);
      return { exitCode: 0, records: [] };
    },
  });
  assert.deepEqual(explicit, [caseArgs('services/demo/specs/a.spec.ts', 3, 'custom')]);
  assert.ok(calls.every((c) => c.env.QA_RETRIES === '0'));
  assert.deepEqual(
    results.map((r) => r.verdict),
    ['not-run', 'not-run'],
  );
  assert.match(results[0].detail, /exited 1: config error/);
});

test('a Playwright failure the verdict does not show turns the case into errored (L-49)', () => {
  const gap = { file: 'services/demo/specs/gaps.spec.ts', line: 10 };
  const lane = (overrides) => () => ({
    exitCode: 0,
    runnerError: null,
    records: [record({})],
    stdout: '',
    stderr: '',
    ...overrides,
  });
  const verdictOf = (run) =>
    runKnownGaps([gap], { scanRoot: REPO_ROOT, runRoot: REPO_ROOT, run })[0];

  assert.equal(verdictOf(lane({})).verdict, 'open', 'exit 0 and a failing arm: the gap is open');
  const teardown = verdictOf(lane({ exitCode: 1, stderr: 'Error in global teardown' }));
  assert.equal(teardown.verdict, 'errored');
  assert.match(teardown.detail, /exited 1 although no case failed: Error in global teardown/);
  const skipped = verdictOf(
    lane({ exitCode: 1, records: [record({ outcome: 'skipped', attempts: [] })] }),
  );
  assert.equal(skipped.verdict, 'errored', 'a case skipped because its dependency failed');
  const killed = verdictOf(lane({ exitCode: 1, runnerError: 'killed by SIGKILL' }));
  assert.deepEqual(
    [killed.verdict, killed.detail],
    ['errored', 'Playwright did not finish: killed by SIGKILL'],
  );
  assert.ok(PROBLEM_VERDICTS.has('errored'));
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
