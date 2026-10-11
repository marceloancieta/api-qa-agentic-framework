import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO_ROOT } from '../lib/cli.mjs';
import { configErrors } from '../config-check.mjs';
import {
  LANE_ENV,
  caseArgs,
  caseEnv,
  classifyCase,
  findDestructive,
  laneProblems,
  latestRunId,
  recoveryOf,
  runDestructive,
  runRecoveryCommand,
  waitUntilAnswers,
} from '../destructive-lane.mjs';
import { findKnownGaps } from '../known-gap-lane.mjs';

const FIXTURES = join(REPO_ROOT, 'scripts', '__fixtures__', 'destructive-lane');
const EXAMPLE = JSON.parse(readFileSync(join(REPO_ROOT, 'qa-config.example.json'), 'utf8'));

const record = (overrides) => ({
  title: 't',
  titlePath: ['t'],
  file: 'demo/specs/breaks-search.spec.ts',
  line: 6,
  project: 'api',
  tags: [],
  annotations: [],
  expectedStatus: 'passed',
  outcome: 'expected',
  attempts: [{ status: 'passed', retry: 0, durationMs: 1, errors: [] }],
  ...overrides,
});

test('selection takes @destructive tests only, tagged in the title or through a describe', () => {
  assert.deepEqual(
    findDestructive(FIXTURES).map((c) => [c.file, c.line, c.caseId]),
    [
      ['services/demo/specs/breaks-search.spec.ts', 6, 'TC-DEMO-01'],
      ['services/demo/specs/breaks-search.spec.ts', 9, 'TC-DEMO-02'],
      ['services/demo/specs/breaks-search.spec.ts', 14, 'TC-DEMO-04'],
    ],
  );
});

test('each record shape maps to one verdict', () => {
  const failed = { status: 'failed', retry: 0, durationMs: 1, errors: ['boom\nstack'] };
  const cases = [
    [[], 'not-run'],
    [[record({}), record({})], 'failed'],
    [[record({})], 'passed'],
    [[record({ outcome: 'skipped' })], 'skipped'],
    [[record({ outcome: 'unexpected', attempts: [failed] })], 'failed'],
    [[record({ expectedStatus: 'failed', attempts: [failed] })], 'known-gap'],
    [[record({ expectedStatus: 'failed', outcome: 'unexpected' })], 'gap-passing'],
  ];
  for (const [records, verdict] of cases) {
    assert.equal(classifyCase(records).verdict, verdict, JSON.stringify(records));
  }
  assert.equal(
    classifyCase([record({ outcome: 'unexpected', attempts: [failed] })]).detail,
    'boom',
  );
});

test('every case runs in its own process with QA_DESTRUCTIVE=1, each followed by the recovery', async () => {
  const cases = findDestructive(FIXTURES);
  const calls = [];
  const run = (root, args, env) => {
    calls.push({ args, env });
    const line = Number(args.at(-1).split(':').at(-1));
    return { exitCode: 0, records: [record({ line })], stdout: '', stderr: '' };
  };
  let recoveries = 0;
  const recover = async () => {
    recoveries += 1;
    return { ok: true, outcome: 'recovered', detail: 'answered 404' };
  };
  const results = await runDestructive(cases, {
    scanRoot: FIXTURES,
    runRoot: FIXTURES,
    project: 'api',
    recover,
    run,
  });
  assert.equal(recoveries, 3);
  assert.deepEqual(
    calls.map((c) => c.args),
    [
      caseArgs('services/demo/specs/breaks-search.spec.ts', 6, 'api'),
      caseArgs('services/demo/specs/breaks-search.spec.ts', 9, 'api'),
      caseArgs('services/demo/specs/breaks-search.spec.ts', 14, 'api'),
    ],
  );
  assert.deepEqual(
    calls.map((c) => [c.env.QA_DESTRUCTIVE, c.env.QA_RUN_ID, c.env.QA_KEEP_RESULTS]),
    [
      ['1', 'lane', '0'],
      ['1', 'lane', '1'],
      ['1', 'lane', '1'],
    ],
  );
  assert.equal(LANE_ENV.QA_DESTRUCTIVE, '1');
  assert.equal(LANE_ENV.QA_RETRIES, '0');
  assert.deepEqual(
    results.map((r) => [r.caseId, r.verdict, r.recovery]),
    [
      ['TC-DEMO-01', 'passed', 'recovered'],
      ['TC-DEMO-02', 'passed', 'recovered'],
      ['TC-DEMO-04', 'passed', 'recovered'],
    ],
  );
  assert.deepEqual(laneProblems(results), []);
});

test('a failed recovery stops the lane: later cases are not run against a broken service', async () => {
  const cases = findDestructive(FIXTURES);
  let runs = 0;
  const results = await runDestructive(cases, {
    scanRoot: FIXTURES,
    runRoot: FIXTURES,
    project: 'api',
    run: () => {
      runs += 1;
      return { exitCode: 0, records: [record({})], stdout: '', stderr: '' };
    },
    recover: async () => ({ ok: false, outcome: 'not-ready', detail: 'no answer within 60s' }),
  });
  assert.equal(runs, 1);
  assert.deepEqual(
    results.map((r) => [r.caseId, r.verdict, r.recovery ?? null]),
    [
      ['TC-DEMO-01', 'passed', 'not-ready'],
      ['TC-DEMO-02', 'not-run', null],
      ['TC-DEMO-04', 'not-run', null],
    ],
  );
  assert.match(results[1].detail, /lane stopped: recovery after TC-DEMO-01 failed/);
  assert.equal(laneProblems(results).length, 3);
});

test('a Playwright failure the verdict does not show fails the case, and the recovery still runs', async () => {
  const [first] = findDestructive(FIXTURES);
  const outcomes = [
    { exitCode: 1, runnerError: null, stderr: 'Error in global teardown' },
    { exitCode: 1, runnerError: 'killed by SIGTERM', stderr: '' },
  ];
  for (const outcome of outcomes) {
    let recoveries = 0;
    const [result] = await runDestructive([first], {
      scanRoot: FIXTURES,
      runRoot: FIXTURES,
      project: 'api',
      run: () => ({ records: [record({})], stdout: '', ...outcome }),
      recover: async () => {
        recoveries += 1;
        return { ok: true, outcome: 'recovered', detail: '' };
      },
    });
    assert.equal(result.verdict, 'failed', JSON.stringify(outcome));
    assert.match(result.detail, /^Playwright (exited 1 although no case failed|did not finish)/);
    assert.equal(recoveries, 1, 'the environment is recovered whatever the case did');
    assert.equal(laneProblems([result]).length, 1);
  }
});

test('a recovery command that exits non-zero is a failed recovery, with its last line', () => {
  const node = JSON.stringify(process.execPath);
  assert.deepEqual(runRecoveryCommand(`${node} -e "process.exit(0)"`, REPO_ROOT), {
    ok: true,
    detail: '',
  });
  const failed = runRecoveryCommand(
    `${node} -e "console.error('down'); process.exit(3)"`,
    REPO_ROOT,
  );
  assert.deepEqual(failed, { ok: false, detail: 'exit 3: down' });
});

test('a retried case stops the lane', async () => {
  const retried = record({
    attempts: [
      { status: 'failed', retry: 0, durationMs: 1, errors: [] },
      { status: 'passed', retry: 1, durationMs: 1, errors: [] },
    ],
  });
  await assert.rejects(
    runDestructive(findDestructive(FIXTURES), {
      scanRoot: FIXTURES,
      runRoot: FIXTURES,
      project: 'api',
      run: () => ({ exitCode: 0, records: [retried], stdout: '', stderr: '' }),
      recover: async () => ({ ok: true, outcome: 'recovered', detail: '' }),
    }),
    /retried/,
  );
});

test('readiness waits through refused connections and 5xx answers until a status below 500', async () => {
  const answers = [new Error('refused'), { status: 503 }, { status: 404 }];
  const fetchImpl = async () => {
    const next = answers.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  const ready = await waitUntilAnswers('http://api.test/', 5, { fetchImpl, sleep: async () => {} });
  assert.deepEqual(ready, { ok: true, detail: 'answered 404' });

  const never = await waitUntilAnswers('http://api.test/', 0, {
    fetchImpl: async () => ({ status: 500 }),
    sleep: async () => {},
  });
  assert.equal(never.ok, false);
  assert.match(never.detail, /did not answer below 500 within 0s \(answered 500\)/);
});

test('recovery settings come from the environment, with a default readiness timeout', () => {
  assert.deepEqual(recoveryOf({ config: EXAMPLE.api.environments.local }), {
    command: 'docker compose restart petstore',
    readyTimeoutS: 60,
  });
  assert.equal(recoveryOf({ config: EXAMPLE.api.environments.public }), null);
  assert.deepEqual(recoveryOf({ config: { recovery: { command: 'x', ready_timeout_s: 5 } } }), {
    command: 'x',
    readyTimeoutS: 5,
  });
});

test('config: a recovery needs a command and an environment that allows writes', () => {
  assert.deepEqual(configErrors(EXAMPLE), []);
  const withPublic = (recovery, allowWrites = false) => {
    const config = structuredClone(EXAMPLE);
    config.api.environments.public.recovery = recovery;
    config.api.environments.public.allow_writes = allowWrites;
    return configErrors(config).join('\n');
  };
  assert.match(
    withPublic({ command: 'restart' }),
    /public\.recovery is set but allow_writes is false/,
  );
  assert.equal(withPublic({ command: 'restart' }, true), '');
  assert.match(withPublic({}, true), /required property 'command'/);
  assert.match(withPublic({ command: 'x', ready_timeout_s: 0 }, true), /must be >= 1/);
});

test('the known-gap lane leaves an armed destructive case (TC-DEMO-04) to this lane', () => {
  assert.deepEqual(findKnownGaps(FIXTURES), []);
});

test('one run: the lane joins the latest recorded run, or starts one whose first case clears', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'lane-results-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.equal(latestRunId(dir), null);
  assert.equal(latestRunId(join(dir, 'missing')), null);
  const result = (run, stop) => ({ stop, labels: [{ name: 'run', value: run }] });
  writeFileSync(join(dir, 'a-result.json'), JSON.stringify(result('older', 10)));
  writeFileSync(join(dir, 'b-result.json'), JSON.stringify(result('newer', 20)));
  writeFileSync(join(dir, 'c-result.json'), 'not json');
  writeFileSync(join(dir, 'd-container.json'), JSON.stringify(result('ignored', 99)));
  assert.equal(latestRunId(dir), 'newer');

  assert.equal(caseEnv(0, { runId: 'r', join: true }).QA_KEEP_RESULTS, '1');
  assert.equal(caseEnv(0, { runId: 'r', join: false }).QA_KEEP_RESULTS, '0');
  assert.equal(caseEnv(1, { runId: 'r', join: false }).QA_KEEP_RESULTS, '1');
  assert.equal(caseEnv(1, { runId: 'r', join: false }).QA_RUN_ID, 'r');
});
