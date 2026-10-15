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
  packRecoveries,
  recoverByPack,
  recoveryOf,
  runDestructive,
  runRecoveryCommand,
  waitUntilAnswers,
} from '../destructive-lane.mjs';
import { findKnownGaps } from '../known-gap-lane.mjs';
import { processReports } from '../lib/playwright-lane.mjs';

const FIXTURES = join(REPO_ROOT, 'scripts', '__fixtures__', 'destructive-lane');
const EXAMPLE = JSON.parse(readFileSync(join(REPO_ROOT, 'qa-config.example.json'), 'utf8'));

const record = (overrides) => ({
  title: 't',
  titlePath: ['t'],
  file: 'demo/specs/breaks-search.spec.ts',
  line: 6,
  project: 'api-demo',
  tags: [],
  annotations: [],
  expectedStatus: 'passed',
  outcome: 'expected',
  attempts: [{ status: 'passed', retry: 0, durationMs: 1, errors: [] }],
  ...overrides,
});

test('selection takes @destructive tests only, tagged in the title or through a describe, never quarantined', () => {
  assert.deepEqual(
    findDestructive(FIXTURES).map((c) => [c.file, c.pack, c.line, c.caseId]),
    [
      ['services/demo/specs/breaks-search.spec.ts', 'demo', 6, 'TC-DEMO-01'],
      ['services/demo/specs/breaks-search.spec.ts', 'demo', 9, 'TC-DEMO-02'],
      ['services/demo/specs/breaks-search.spec.ts', 'demo', 14, 'TC-DEMO-04'],
    ],
    'TC-DEMO-05 is destructive but quarantined: every run but the flake lane leaves it out',
  );
  assert.equal(findDestructive(FIXTURES, 'demo').length, 3, '--service keeps its own pack');
  assert.deepEqual(findDestructive(FIXTURES, 'other'), []);
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

test('every case runs in its own process, in its pack project with QA_DESTRUCTIVE=1, each followed by the recovery', async () => {
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
    recover,
    run,
  });
  assert.equal(recoveries, 3);
  assert.deepEqual(
    calls.map((c) => c.args),
    [
      caseArgs('services/demo/specs/breaks-search.spec.ts', 6, 'api-demo'),
      caseArgs('services/demo/specs/breaks-search.spec.ts', 9, 'api-demo'),
      caseArgs('services/demo/specs/breaks-search.spec.ts', 14, 'api-demo'),
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

test('recovery settings come from the pack entry, with a default readiness timeout', () => {
  assert.deepEqual(recoveryOf({ config: EXAMPLE.api.environments.local.packs.petstore }), {
    command: 'docker compose restart petstore',
    readyTimeoutS: 60,
  });
  assert.equal(recoveryOf({ config: EXAMPLE.api.environments.public.packs.petstore }), null);
  assert.deepEqual(recoveryOf({ config: { recovery: { command: 'x', ready_timeout_s: 5 } } }), {
    command: 'x',
    readyTimeoutS: 5,
  });
});

/** A repository root whose qa-config example holds `packs` in the environment `local`. */
function rootWith(packs) {
  const root = mkdtempSync(join(tmpdir(), 'destructive-config-'));
  const config = { api: { default_environment: 'local', environments: { local: { packs } } } };
  writeFileSync(join(root, 'qa-config.example.json'), JSON.stringify(config));
  return root;
}

const AUTH = { type: 'none' };
const TWO_PACKS = {
  shop: {
    base_url: 'http://shop.test/api/',
    auth: AUTH,
    allow_writes: true,
    recovery: { command: 'restart shop' },
  },
  bank: {
    base_url: 'http://bank.test',
    auth: AUTH,
    allow_writes: true,
    recovery: { command: 'restart bank', ready_timeout_s: 5 },
  },
  readonly: { base_url: 'http://ro.test', auth: AUTH, recovery: { command: 'restart ro' } },
  norecovery: { base_url: 'http://nr.test', auth: AUTH, allow_writes: true },
};

const caseOf = (pack, line, caseId) => ({
  file: `services/${pack}/specs/breaks.spec.ts`,
  pack,
  line,
  title: caseId,
  caseId,
});

test('each case is recovered by its own pack: its command and its base URL (with the override)', async (t) => {
  const root = rootWith(TWO_PACKS);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const cases = [caseOf('shop', 3, 'TC-SHOP-01'), caseOf('bank', 4, 'TC-BANK-01')];
  const recoveries = packRecoveries(cases, root, { QA_BANK_BASE_URL: 'http://override.test/' });
  assert.deepEqual(
    [...recoveries].map(([pack, r]) => [pack, r.recovery, r.baseUrl, r.environment.name]),
    [
      ['shop', { command: 'restart shop', readyTimeoutS: 60 }, 'http://shop.test/api', 'local'],
      ['bank', { command: 'restart bank', readyTimeoutS: 5 }, 'http://override.test', 'local'],
    ],
  );

  const steps = [];
  const step = (recovery, baseUrl) => async () => {
    steps.push([recovery.command, baseUrl]);
    return { ok: true, outcome: 'recovered', detail: '' };
  };
  const calls = [];
  const results = await runDestructive(cases, {
    scanRoot: root,
    runRoot: root,
    recover: recoverByPack(recoveries, root, step),
    run: (_root, args) => {
      calls.push(args);
      const project = args.find((a) => a.startsWith('--project=')).slice('--project='.length);
      return {
        exitCode: 0,
        records: [
          record({
            project,
            file: args.at(-1).split(':')[0],
            line: Number(args.at(-1).split(':')[1]),
          }),
        ],
        stdout: '',
        stderr: '',
      };
    },
  });
  assert.deepEqual(calls, [
    caseArgs('services/shop/specs/breaks.spec.ts', 3, 'api-shop'),
    caseArgs('services/bank/specs/breaks.spec.ts', 4, 'api-bank'),
  ]);
  assert.deepEqual(steps, [
    ['restart shop', 'http://shop.test/api'],
    ['restart bank', 'http://override.test'],
  ]);
  assert.deepEqual(
    results.map((r) => [r.caseId, r.verdict, r.recovery]),
    [
      ['TC-SHOP-01', 'passed', 'recovered'],
      ['TC-BANK-01', 'passed', 'recovered'],
    ],
  );
});

test('an explicit --project replaces the pack project of every case', async () => {
  const calls = [];
  await runDestructive([caseOf('shop', 3, 'TC-SHOP-01')], {
    scanRoot: REPO_ROOT,
    runRoot: REPO_ROOT,
    project: 'custom',
    recover: async () => ({ ok: true, outcome: 'recovered', detail: '' }),
    run: (_root, args) => {
      calls.push(args);
      return { exitCode: 0, records: [], stdout: '', stderr: '' };
    },
  });
  assert.deepEqual(calls, [caseArgs('services/shop/specs/breaks.spec.ts', 3, 'custom')]);
});

test('a pack that is not configured, allows no writes or names no recovery is refused before any case runs', (t) => {
  const root = rootWith(TWO_PACKS);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const refused = (pack) => () =>
    packRecoveries([caseOf('shop', 1, 'a'), caseOf(pack, 2, 'b')], root, {});
  assert.throws(
    refused('missing'),
    /environment "local" has no entry for pack "missing" \(api\.environments\.local\.packs\.missing\)\. Configured packs: shop, bank, readonly, norecovery\./,
  );
  assert.throws(
    refused('readonly'),
    /pack "readonly" has allow_writes false in environment "local" \(api\.environments\.local\.packs\.readonly in qa-config\.example\.json\)/,
  );
  assert.throws(
    refused('norecovery'),
    /pack "norecovery" names no recovery in environment "local" \(api\.environments\.local\.packs\.norecovery\.recovery in qa-config\.example\.json\)/,
  );
  assert.throws(
    () => packRecoveries([{ file: 'specs/loose.spec.ts', pack: null }], root, {}),
    /specs\/loose\.spec\.ts is not under services\/<pack>\//,
  );
});

test('config: a recovery needs a command and a pack entry that allows writes', () => {
  assert.deepEqual(configErrors(EXAMPLE), []);
  const withPublic = (recovery, allowWrites = false) => {
    const config = structuredClone(EXAMPLE);
    config.api.environments.public.packs.petstore.recovery = recovery;
    config.api.environments.public.packs.petstore.allow_writes = allowWrites;
    return configErrors(config).join('\n');
  };
  assert.match(
    withPublic({ command: 'restart' }),
    /public\.packs\.petstore\.recovery is set but allow_writes is false/,
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

test('each case writes its own JUnit and HTML report when the lane is given them (CI-09)', async () => {
  const inherited = {
    QA_JUNIT_REPORT: 'reports/junit-destructive.xml',
    PLAYWRIGHT_HTML_OUTPUT_DIR: 'playwright-report/destructive',
  };
  const calls = [];
  const run = (_root, args, env) => {
    calls.push(env);
    const line = Number(args.at(-1).split(':').at(-1));
    return { exitCode: 0, records: [record({ line })], stdout: '', stderr: '' };
  };
  await runDestructive(findDestructive(FIXTURES), {
    scanRoot: FIXTURES,
    runRoot: FIXTURES,
    recover: async () => ({ ok: true, outcome: 'recovered', detail: '' }),
    run,
    inherited,
  });
  assert.deepEqual(
    calls.map((env) => [env.QA_JUNIT_REPORT, env.PLAYWRIGHT_HTML_OUTPUT_DIR.replace(/\\/g, '/')]),
    ['TC-DEMO-01', 'TC-DEMO-02', 'TC-DEMO-04'].map((id) => [
      `reports/junit-destructive-api-demo-${id}.xml`,
      `playwright-report/destructive/api-demo-${id}`,
    ]),
  );

  // Unset stays unset: the lane adds no report the run was not asked for.
  assert.deepEqual(processReports({}, 'api-demo-TC-DEMO-01'), {});
  assert.equal(caseEnv(0, { runId: 'r', join: false }).QA_JUNIT_REPORT, undefined);
  // A name without .xml gets the label appended; characters a path cannot hold become dashes.
  assert.deepEqual(processReports({ QA_JUNIT_REPORT: 'out/junit' }, 'a b/c'), {
    QA_JUNIT_REPORT: 'out/junit-a-b-c',
  });
  assert.equal(
    caseEnv(2, { runId: 'r', join: false, inherited }).QA_JUNIT_REPORT,
    'reports/junit-destructive-case-3.xml',
    'a case without an id is numbered',
  );
});
