// Quality gate (GATE-08): each strategy on passing, review, failing, missing and malformed input,
// too few samples with and without `required` (GATE-21), the worst-of combiner, the exit codes, the
// CLI artifacts and the config rules for the section.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  dastCounts,
  evaluate,
  exitCode,
  judgeAbove,
  judgeBelow,
  judgeCounts,
  k6Latency,
  mutationScore,
  percentile,
  renderSummary,
  runCheck,
  STRATEGIES,
  worst,
} from '../quality-gate.mjs';
import { configErrors, semanticErrors } from '../config-check.mjs';

const FIX = join(import.meta.dirname, '..', '__fixtures__', 'quality-gate');
const SCRIPT = join(import.meta.dirname, '..', 'quality-gate.mjs');
const EXAMPLE = join(import.meta.dirname, '..', '..', 'qa-config.example.json');
const opts = { cwd: FIX, env: {} };

/** A scratch directory for inputs that must not live in the tree (invalid JSON breaks prettier). */
function scratch(t) {
  const dir = mkdtempSync(join(tmpdir(), 'quality-gate-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// ---- judges and combiner -----------------------------------------------------------------------

test('judgeBelow and judgeAbove draw the FAIL and REVIEW bands at the thresholds', () => {
  assert.equal(judgeBelow(89.9, 90, 100), 'FAIL');
  assert.equal(judgeBelow(90, 90, 100), 'REVIEW');
  assert.equal(judgeBelow(100, 90, 100), 'PASS');
  assert.equal(judgeBelow(50, 40), 'PASS'); // no review band configured
  assert.equal(judgeAbove(501, 500, 300), 'FAIL');
  assert.equal(judgeAbove(500, 500, 300), 'REVIEW');
  assert.equal(judgeAbove(300, 500, 300), 'PASS');
});

test('judgeCounts lets the worst risk decide and ignores risks without a limit', () => {
  const counts = { high: 1, medium: 2, low: 9, informational: 1 };
  assert.equal(judgeCounts(counts, { high: 0 }), 'FAIL');
  assert.equal(judgeCounts(counts, { high: 1 }, { medium: 1 }), 'REVIEW');
  assert.equal(judgeCounts(counts, { high: 1, medium: 5 }, { medium: 2 }), 'PASS');
});

test('worst ignores SKIPPED and returns null when nothing was evaluated', () => {
  assert.equal(worst(['PASS', 'SKIPPED', 'REVIEW']), 'REVIEW');
  assert.equal(worst(['REVIEW', 'FAIL', 'PASS']), 'FAIL');
  assert.equal(worst(['SKIPPED', 'SKIPPED']), null);
  assert.equal(worst([]), null);
});

test('exit codes: FAIL is 1, REVIEW is 0 unless --fail-on-review, PASS and SKIPPED are 0', () => {
  assert.equal(exitCode('PASS'), 0);
  assert.equal(exitCode('SKIPPED'), 0);
  assert.equal(exitCode('REVIEW'), 0);
  assert.equal(exitCode('REVIEW', true), 1);
  assert.equal(exitCode('FAIL'), 1);
  assert.equal(exitCode('PASS', true), 0);
});

test('exit codes fail closed: a verdict the gate does not know is 1, never 0 (L-49)', () => {
  for (const verdict of [undefined, null, '', 'pass', 'ERROR', 'UNKNOWN']) {
    assert.equal(exitCode(verdict), 1, String(verdict));
  }
});

test('percentile uses the nearest rank', () => {
  assert.equal(percentile([5], 95), 5);
  assert.equal(percentile([100, 120, 140, 160, 200, 900], 95), 900);
  assert.equal(
    percentile(
      [...Array(100).keys()].map((i) => i + 1),
      95,
    ),
    95,
  );
});

// ---- pass-rate ---------------------------------------------------------------------------------

const pwRate = (settings) =>
  runCheck(STRATEGIES.pass_rate, { source: 'playwright-mixed.json', ...settings }, opts);

test('pass-rate from a Playwright report: flaky counts as passed, skipped is not executed', () => {
  const result = pwRate({ fail_below_pct: 90 });
  assert.equal(result.check, 'pass-rate');
  assert.equal(result.value, 95); // 19 of 20 executed
  assert.equal(result.verdict, 'PASS');
  assert.match(result.detail, /19\/20 passed \(1 flaky\), 1 failed, 1 skipped/);
  assert.deepEqual(result.threshold, { fail_below_pct: 90 });
});

test('pass-rate review band and failing threshold', () => {
  assert.equal(pwRate({ fail_below_pct: 90, review_below_pct: 100 }).verdict, 'REVIEW');
  assert.equal(pwRate({ fail_below_pct: 96, review_below_pct: 100 }).verdict, 'FAIL');
});

test('pass-rate reads the Playwright report from QA_JSON_REPORT by default', () => {
  const result = runCheck(
    STRATEGIES.pass_rate,
    { fail_below_pct: 90 },
    { cwd: FIX, env: { QA_JSON_REPORT: 'playwright-mixed.json' } },
  );
  assert.equal(result.value, 95);
  assert.equal(result.source, 'playwright-mixed.json');
});

test('pass-rate from Allure results groups retries by historyId', () => {
  const result = runCheck(
    STRATEGIES.pass_rate,
    { format: 'allure-results', source: 'allure-mixed', fail_below_pct: 80, review_below_pct: 90 },
    opts,
  );
  assert.equal(result.value, 83.33); // 5 of 6 executed; a5 failed then passed
  assert.equal(result.verdict, 'REVIEW');
  assert.match(result.detail, /5\/6 passed \(1 flaky\), 1 failed, 1 skipped/);
});

test('pass-rate with a missing source is SKIPPED with the reason, or FAIL when required', () => {
  const skipped = runCheck(STRATEGIES.pass_rate, { fail_below_pct: 90 }, opts);
  assert.equal(skipped.verdict, 'SKIPPED');
  assert.match(skipped.detail, /no source configured; set .*QA_JSON_REPORT/);
  const absent = pwRate({ source: 'nowhere.json', fail_below_pct: 90 });
  assert.equal(absent.verdict, 'SKIPPED');
  assert.match(absent.detail, /source nowhere\.json not found/);
  const required = pwRate({ source: 'nowhere.json', fail_below_pct: 90, required: true });
  assert.equal(required.verdict, 'FAIL');
  assert.match(required.detail, /not found and the check is required/);
});

test('pass-rate on malformed input is a FAIL that names the problem', (t) => {
  const dir = scratch(t);
  writeFileSync(join(dir, 'broken.json'), '{ "suites": [ ');
  const cases = [
    [{ source: join(dir, 'broken.json') }, /broken\.json is not valid JSON/],
    [{ source: 'playwright-wrong-shape.json' }, /not a Playwright JSON report/],
    [{ source: 'playwright-odd-outcome.json' }, /unknown test outcome "exploded" for "odd"/],
    [{ source: 'playwright-all-skipped.json' }, /no executed tests \(1 skipped\)/],
    [{ source: 'allure-mixed' }, /cannot read .*allure-mixed/], // a directory given as a file
    [
      { source: 'allure-unknown-status', format: 'allure-results' },
      /z1-result\.json: unknown status "exploded"/,
    ],
    [{ source: 'zap-clean.json', format: 'allure-results' }, /is not a directory/],
  ];
  for (const [settings, reason] of cases) {
    const result = pwRate({ fail_below_pct: 90, ...settings });
    assert.equal(result.verdict, 'FAIL', JSON.stringify(settings));
    assert.match(result.detail, /^invalid input: /);
    assert.match(result.detail, reason);
  }
});

test('an Allure result that is not valid JSON fails the check and names the file', (t) => {
  const dir = scratch(t);
  writeFileSync(join(dir, 'x1-result.json'), '{ "status": "passed", ');
  const result = runCheck(
    STRATEGIES.pass_rate,
    { format: 'allure-results', source: dir, fail_below_pct: 90 },
    opts,
  );
  assert.equal(result.verdict, 'FAIL');
  assert.match(result.detail, /x1-result\.json is not valid JSON/);
});

// ---- p95-latency -------------------------------------------------------------------------------

const latency = (settings) =>
  runCheck(STRATEGIES.p95_latency, { source: 'allure-mixed', ...settings }, opts);

test('p95-latency uses API case durations only (story with an HTTP operation)', () => {
  const result = latency({ fail_above_ms: 1000 });
  assert.equal(result.check, 'p95-latency');
  assert.equal(result.value, 900); // 100 120 140 160 200 900; the 5000 ms unit case is ignored
  assert.equal(result.verdict, 'PASS');
  assert.match(result.detail, /6 API case durations \(per test, not per request\)/);
  assert.match(result.detail, /2 other result\(s\) ignored/);
});

test('p95-latency review band and failing threshold', () => {
  assert.equal(latency({ fail_above_ms: 1000, review_above_ms: 500 }).verdict, 'REVIEW');
  assert.equal(latency({ fail_above_ms: 800, review_above_ms: 500 }).verdict, 'FAIL');
});

test('p95-latency with too few samples or no results directory is SKIPPED with the reason', () => {
  for (const required of [undefined, false]) {
    const few = latency({ fail_above_ms: 1000, min_samples: 7, required });
    assert.equal(few.verdict, 'SKIPPED', String(required));
    assert.equal(few.value, null);
    assert.equal(
      few.detail,
      'only 6 timed API case(s) (2 other result(s) ignored), fewer than min_samples 7',
    );
  }
  const missing = latency({ source: 'no-results', fail_above_ms: 1000 });
  assert.equal(missing.verdict, 'SKIPPED');
  assert.match(missing.detail, /source no-results not found; run the API lane first/);
});

test('p95-latency with too few samples is a FAIL that gives the count when required (GATE-21)', () => {
  const few = latency({ fail_above_ms: 1000, min_samples: 7, required: true });
  assert.equal(few.verdict, 'FAIL');
  assert.equal(few.value, null);
  assert.equal(
    few.detail,
    'only 6 timed API case(s) (2 other result(s) ignored), fewer than min_samples 7 ' +
      'and the check is required',
  );
  assert.deepEqual(few.threshold, { fail_above_ms: 1000, min_samples: 7 });
});

test('p95-latency with exactly min_samples samples is judged, required or not', () => {
  for (const required of [undefined, true]) {
    const enough = latency({ fail_above_ms: 1000, min_samples: 6, required });
    assert.equal(enough.verdict, 'PASS', String(required));
    assert.equal(enough.value, 900);
    assert.match(enough.detail, /^6 API case durations/);
  }
});

test('p95-latency on a result without timings is a FAIL that names the file', () => {
  const result = latency({ source: 'allure-no-times', fail_above_ms: 1000, min_samples: 1 });
  assert.equal(result.verdict, 'FAIL');
  assert.match(result.detail, /t1-result\.json: missing or inconsistent start\/stop times/);
});

const k6 = (settings) =>
  runCheck(
    STRATEGIES.p95_latency,
    { format: 'k6-summary', source: 'k6-summary.json', ...settings },
    opts,
  );

test('p95-latency on a k6 summary judges the p95 of every request and names the slowest operation', () => {
  const result = k6({ fail_above_ms: 100 });
  assert.equal(result.value, 42.46);
  assert.equal(result.verdict, 'PASS');
  assert.equal(
    result.detail,
    '120 requests (per request), max 95.25 ms; slowest operation GET /items/{id} p95 61.5 ms; ' +
      '2 iteration(s) dropped',
  );
  assert.equal(k6({ fail_above_ms: 100, review_above_ms: 40 }).verdict, 'REVIEW');
  assert.equal(k6({ fail_above_ms: 42 }).verdict, 'FAIL');
});

test('p95-latency on a k6 summary with too few requests, or none configured, is SKIPPED', () => {
  const few = k6({ fail_above_ms: 100, min_samples: 121 });
  assert.equal(few.verdict, 'SKIPPED');
  assert.equal(few.detail, 'only 120 request(s), fewer than min_samples 121');
  const unset = runCheck(STRATEGIES.p95_latency, { format: 'k6-summary', fail_above_ms: 1 }, opts);
  assert.equal(unset.verdict, 'SKIPPED');
  assert.match(unset.detail, /no source configured; .*performance lane for k6-summary/);
});

test('p95-latency on a k6 summary: too few requests FAIL when required, exactly enough are judged', (t) => {
  const few = k6({ fail_above_ms: 100, min_samples: 121, required: true });
  assert.equal(few.verdict, 'FAIL');
  assert.equal(
    few.detail,
    'only 120 request(s), fewer than min_samples 121 and the check is required',
  );
  for (const required of [undefined, true]) {
    const enough = k6({ fail_above_ms: 100, min_samples: 120, required });
    assert.equal(enough.verdict, 'PASS', String(required));
    assert.equal(enough.value, 42.46);
  }
  const dir = scratch(t);
  writeFileSync(join(dir, 'idle.json'), JSON.stringify({ metrics: {} }));
  const idle = (required) => k6({ source: join(dir, 'idle.json'), fail_above_ms: 100, required });
  assert.equal(idle(false).verdict, 'SKIPPED');
  assert.equal(idle(true).verdict, 'FAIL');
  assert.equal(
    idle(true).detail,
    'only 0 request(s), fewer than min_samples 5 and the check is required',
  );
});

test('k6Latency reads the overall and per-operation figures, slowest p95 first', () => {
  const latency = k6Latency(JSON.parse(readFileSync(join(FIX, 'k6-summary.json'), 'utf8')));
  assert.deepEqual(
    { ...latency, operations: latency.operations.map((o) => [o.name, o.count, o.p95, o.fails]) },
    {
      requests: 120,
      p95: 42.456,
      max: 95.25,
      failedChecks: 3,
      dropped: 2,
      operations: [
        ['GET /items/{id}', 60, 61.5, 3],
        ['GET /items', 60, 15.75, 0],
      ],
    },
  );
  assert.deepEqual(k6Latency({ metrics: {} }), {
    requests: 0,
    p95: null,
    max: null,
    operations: [],
    failedChecks: 0,
    dropped: 0,
  });
});

test('a k6 summary of the wrong shape is a FAIL that says what is missing', (t) => {
  const dir = scratch(t);
  const cases = {
    'not-k6.json': [{ site: [] }, /not a k6 summary \(no "metrics" object\)/],
    'no-p95.json': [
      {
        metrics: { http_reqs: { values: { count: 9 } }, http_req_duration: { values: { max: 3 } } },
      },
      /metric http_req_duration has no numeric "p\(95\)"/,
    ],
    'bad-count.json': [
      { metrics: { http_reqs: { values: { count: 'many' } } } },
      /metric http_reqs has no numeric "count"/,
    ],
  };
  for (const [file, [summary, message]] of Object.entries(cases)) {
    writeFileSync(join(dir, file), JSON.stringify(summary));
    const result = k6({ source: join(dir, file), fail_above_ms: 100, min_samples: 1 });
    assert.equal(result.verdict, 'FAIL', file);
    assert.match(result.detail, message, file);
  }
});

// ---- dast --------------------------------------------------------------------------------------

const dast = (settings) =>
  runCheck(STRATEGIES.dast, { source: 'zap-report.json', ...settings }, opts);

test('dast counts alerts per risk and lists the high and medium ones', () => {
  const { value, detail } = dastCounts(JSON.parse(readFileSync(join(FIX, 'zap-report.json'))));
  assert.deepEqual(value, { informational: 1, low: 1, medium: 2, high: 1 });
  assert.match(detail, /high: SQL Injection; medium: Missing Anti-clickjacking Header/);
});

test('dast passing, review band and failing', () => {
  assert.equal(dast({ fail_above: { high: 1, medium: 5 } }).verdict, 'PASS');
  assert.equal(
    dast({ fail_above: { high: 1, medium: 5 }, review_above: { medium: 0 } }).verdict,
    'REVIEW',
  );
  const failed = dast({ fail_above: { high: 0 } });
  assert.equal(failed.verdict, 'FAIL');
  assert.deepEqual(failed.threshold, { fail_above: { high: 0 } });
  assert.equal(dast({ source: 'zap-clean.json', fail_above: { high: 0, low: 0 } }).verdict, 'PASS');
});

test('dast with a missing report is SKIPPED, malformed alerts are a FAIL', () => {
  const missing = dast({ source: 'zap-none.json', fail_above: { high: 0 } });
  assert.equal(missing.verdict, 'SKIPPED');
  assert.match(missing.detail, /zap-none\.json not found; run the DAST scan first/);
  const badRisk = dast({ source: 'zap-bad-risk.json', fail_above: { high: 0 } });
  assert.equal(badRisk.verdict, 'FAIL');
  assert.match(badRisk.detail, /site\[0\]\.alerts\[0\] has no valid riskcode/);
  const notZap = dast({ source: 'mutation.json', fail_above: { high: 0 } });
  assert.match(notZap.detail, /not a ZAP JSON report/);
  assert.throws(() => dastCounts({ site: [{ alerts: {} }] }), /alerts is not an array/);
  assert.throws(() => dastCounts({ site: [{ alerts: [{ riskcode: null }] }] }), /riskcode/);
});

// ---- mutation-score ----------------------------------------------------------------------------

const mutation = (settings) =>
  runCheck(STRATEGIES.mutation_score, { source: 'mutation.json', ...settings }, opts);

test('mutation-score counts killed and timeout over valid mutants', () => {
  const result = mutation({ fail_below_pct: 60, review_below_pct: 75 });
  assert.equal(result.check, 'mutation-score');
  assert.equal(result.value, 80);
  assert.equal(result.verdict, 'PASS');
  assert.match(result.detail, /8\/10 mutants detected, 2 undetected, 2 not counted/);
});

test('mutation-score review band and failing threshold', () => {
  assert.equal(mutation({ fail_below_pct: 60, review_below_pct: 85 }).verdict, 'REVIEW');
  assert.equal(mutation({ fail_below_pct: 81 }).verdict, 'FAIL');
});

test('mutation-score defaults to reports/mutation/mutation.json and skips when absent', () => {
  const result = runCheck(STRATEGIES.mutation_score, { fail_below_pct: 60 }, opts);
  assert.equal(result.verdict, 'SKIPPED');
  assert.match(result.detail, /reports[\\/]mutation[\\/]mutation\.json not found/);
});

test('mutation-score on malformed reports is a FAIL with the reason', () => {
  assert.match(
    mutation({ source: 'mutation-bad-status.json', fail_below_pct: 60 }).detail,
    /unknown mutant status "Exploded"/,
  );
  assert.match(
    mutation({ source: 'mutation-no-valid.json', fail_below_pct: 60 }).detail,
    /no valid mutants/,
  );
  assert.equal(mutation({ source: 'zap-report.json', fail_below_pct: 60 }).verdict, 'FAIL');
  assert.throws(() => mutationScore({ files: { 'a.mjs': {} } }), /has no mutants array/);
});

// ---- combiner over a configuration -------------------------------------------------------------

test('evaluate runs only the configured checks and the worst verdict wins', () => {
  const gate = {
    pass_rate: { source: 'playwright-mixed.json', fail_below_pct: 90, review_below_pct: 100 },
    mutation_score: { source: 'mutation.json', fail_below_pct: 60 },
    dast: { source: 'zap-none.json', fail_above: { high: 0 } },
  };
  const result = evaluate(gate, opts);
  assert.deepEqual(
    result.checks.map((c) => [c.check, c.verdict]),
    [
      ['pass-rate', 'REVIEW'],
      ['dast', 'SKIPPED'],
      ['mutation-score', 'PASS'],
    ],
  );
  assert.equal(result.verdict, 'REVIEW');
  gate.p95_latency = { source: 'allure-mixed', fail_above_ms: 500 };
  assert.equal(evaluate(gate, opts).verdict, 'FAIL');
  assert.deepEqual(evaluate({}, opts), { verdict: 'SKIPPED', checks: [] });
});

test('the summary is a Markdown table with every check and its reason', () => {
  const result = evaluate(
    {
      pass_rate: { source: 'playwright-mixed.json', fail_below_pct: 90, review_below_pct: 100 },
      dast: { source: 'zap-report.json', fail_above: { high: 1 } },
    },
    opts,
  );
  const text = renderSummary(result);
  assert.match(text, /^## Quality gate: REVIEW/);
  assert.match(text, /\| pass-rate \| REVIEW \| 95 \| fail_below_pct 90; review_below_pct 100 \|/);
  assert.match(
    text,
    /\| dast \| PASS \| informational 1, low 1, medium 2, high 1 \| fail_above high 1/,
  );
  assert.match(text, /REVIEW keeps the build green/);
});

// ---- CLI ---------------------------------------------------------------------------------------

function runCli(t, gate, extra = []) {
  const dir = scratch(t);
  const config = JSON.parse(readFileSync(EXAMPLE, 'utf8'));
  config.quality_gate = gate;
  const configFile = join(dir, 'qa-config.json');
  writeFileSync(configFile, JSON.stringify(config));
  const out = join(dir, 'out', 'gate.json');
  const summary = join(dir, 'out', 'gate.md');
  const run = spawnSync(
    process.execPath,
    [SCRIPT, '--config', configFile, '--out', out, '--summary', summary, ...extra],
    { cwd: FIX, encoding: 'utf8', env: { ...process.env, QA_JSON_REPORT: '' } },
  );
  return { run, dir, out, summary };
}

const reviewGate = {
  pass_rate: { source: 'playwright-mixed.json', fail_below_pct: 90, review_below_pct: 100 },
};

test('CLI: REVIEW exits 0 and writes both artifacts; --fail-on-review makes it 1', (t) => {
  const { run, out, summary } = runCli(t, reviewGate);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /quality-gate: REVIEW/);
  const artifact = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(artifact.verdict, 'REVIEW');
  assert.equal(artifact.checks[0].value, 95);
  assert.match(readFileSync(summary, 'utf8'), /## Quality gate: REVIEW/);
  assert.equal(runCli(t, reviewGate, ['--fail-on-review']).run.status, 1);
});

test('CLI: FAIL exits 1, PASS exits 0', (t) => {
  const failing = runCli(t, { mutation_score: { source: 'mutation.json', fail_below_pct: 90 } });
  assert.equal(failing.run.status, 1);
  assert.equal(JSON.parse(readFileSync(failing.out, 'utf8')).verdict, 'FAIL');
  const passing = runCli(t, { mutation_score: { source: 'mutation.json', fail_below_pct: 50 } });
  assert.equal(passing.run.status, 0);
});

test('CLI: too few latency samples exit 0 as SKIPPED, and 1 as FAIL when required', (t) => {
  const gate = (required) => ({
    p95_latency: { source: 'allure-mixed', fail_above_ms: 1000, min_samples: 7, required },
  });
  const skipped = runCli(t, gate(false));
  assert.equal(skipped.run.status, 0, skipped.run.stderr);
  assert.match(skipped.run.stdout, /p95-latency +SKIPPED only 6 timed API case\(s\)/);
  assert.match(skipped.run.stdout, /quality-gate: SKIPPED/);
  const failed = runCli(t, gate(true));
  assert.equal(failed.run.status, 1, failed.run.stderr);
  assert.match(
    failed.run.stdout,
    /p95-latency +FAIL +only 6 timed API case\(s\) \(2 other result\(s\) ignored\), fewer than min_samples 7 and the check is required/,
  );
  assert.equal(JSON.parse(readFileSync(failed.out, 'utf8')).verdict, 'FAIL');
});

test('CLI: an invalid configuration is refused with exit 2 and the config-check messages', (t) => {
  const { run } = runCli(t, { pass_rate: { fail_below_pct: 95, review_below_pct: 90 } });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /review_below_pct \(90\) must be >= fail_below_pct \(95\)/);
});

// ---- schema and cross-field rules --------------------------------------------------------------

const withGate = (gate) => ({ ...JSON.parse(readFileSync(EXAMPLE, 'utf8')), quality_gate: gate });

test('the example configuration and a complete quality_gate section are valid', () => {
  assert.deepEqual(configErrors(JSON.parse(readFileSync(EXAMPLE, 'utf8'))), []);
  const full = {
    pass_rate: { format: 'allure-results', fail_below_pct: 95, review_below_pct: 99 },
    p95_latency: { fail_above_ms: 2000, review_above_ms: 800, min_samples: 20, required: true },
    dast: { source: 'zap.json', fail_above: { high: 0, medium: 5 }, review_above: { medium: 0 } },
    mutation_score: { fail_below_pct: 60, review_below_pct: 80 },
  };
  assert.deepEqual(configErrors(withGate(full)), []);
});

test('the schema rejects unknown checks, missing thresholds and out-of-range values', () => {
  const errors = (gate) => configErrors(withGate(gate)).join('\n');
  assert.match(errors({ coverage: {} }), /must NOT have additional properties: "coverage"/);
  assert.match(errors({ pass_rate: {} }), /pass_rate must have required property 'fail_below_pct'/);
  assert.match(errors({ pass_rate: { fail_below_pct: 120 } }), /must be <= 100/);
  assert.match(errors({ pass_rate: { fail_below_pct: 90, format: 'junit' } }), /allowed values/);
  assert.match(errors({ dast: { fail_above: { high: 0 } } }), /required property 'source'/);
  assert.match(errors({ dast: { source: 'z.json', fail_above: {} } }), /fewer than 1 properties/);
  assert.match(errors({ p95_latency: { fail_above_ms: 0 } }), /must be > 0/);
  assert.match(
    errors({ p95_latency: { format: 'k6-summary', fail_above_ms: 500 } }),
    /p95_latency must have required property 'source'/,
  );
  assert.match(
    errors({ p95_latency: { format: 'jmeter', source: 'x.jtl', fail_above_ms: 500 } }),
    /allowed values/,
  );
  assert.equal(
    errors({ p95_latency: { format: 'k6-summary', source: 'k.json', fail_above_ms: 9 } }),
    '',
  );
});

test('cross-field rules: the review threshold must be stricter than the fail threshold', () => {
  const messages = semanticErrors({
    quality_gate: {
      pass_rate: { fail_below_pct: 95, review_below_pct: 90 },
      mutation_score: { fail_below_pct: 70, review_below_pct: 60 },
      p95_latency: { fail_above_ms: 500, review_above_ms: 800 },
      dast: { source: 'z.json', fail_above: { high: 0 }, review_above: { high: 2, low: 9 } },
    },
  });
  assert.deepEqual(messages, [
    'quality_gate.pass_rate.review_below_pct (90) must be >= fail_below_pct (95): below fail is FAIL, between the two is REVIEW',
    'quality_gate.mutation_score.review_below_pct (60) must be >= fail_below_pct (70): below fail is FAIL, between the two is REVIEW',
    'quality_gate.p95_latency.review_above_ms (800) must be <= fail_above_ms (500): above fail is FAIL, between the two is REVIEW',
    'quality_gate.dast.review_above.high (2) must be <= fail_above.high (0)',
  ]);
  assert.deepEqual(
    semanticErrors({
      quality_gate: {
        pass_rate: { fail_below_pct: 95, review_below_pct: 95 },
        p95_latency: { fail_above_ms: 500, review_above_ms: 500 },
      },
    }),
    [],
  );
});
