#!/usr/bin/env node
// Quality gate (GATE-08, ADR 0007): turns the results of a run into one verdict a pipeline can act
// on. Each metric is a Strategy that reads its own source, validates it and judges it against the
// thresholds in `qa-config.quality_gate`:
//
//   pass_rate       share of executed tests that passed: Playwright JSON report or Allure results
//   p95_latency     95th percentile of API case durations, from Allure start/stop times. This is
//                   per test case, not per request: evidence attachments carry no timings yet, so
//                   a case that sends three requests counts once with its whole duration.
//   dast            alerts of a ZAP-style JSON report, counted per risk level
//   mutation_score  a Stryker JSON report (mutation.json)
//
// Verdicts. A check is PASS, REVIEW (worth a human look; the build stays green and the artifact is
// published) or FAIL. A configured check whose source does not exist is SKIPPED with the reason
// printed (L-05: nothing is left out silently), or FAIL when the check says `required: true`. A
// source that exists but cannot be read or does not have the expected shape is a FAIL naming the
// problem: a broken report must never pass for a green one. The overall verdict is the worst
// evaluated check; SKIPPED checks do not count, and a run where every check was skipped is SKIPPED.
//
// Exit codes: 0 for PASS, REVIEW and SKIPPED (1 for REVIEW with --fail-on-review), 1 for FAIL
// (and for any verdict the gate does not know), 2 for a usage or configuration error.
//
// Usage:
//   node scripts/quality-gate.mjs [--config <qa-config>] [--out <file>] [--summary <file.md>]
//                                 [--fail-on-review]
// Defaults: qa-config.json, else qa-config.example.json; --out reports/quality-gate.json. Relative
// source paths resolve against the working directory.

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { flattenReport } from './lib/playwright-lane.mjs';
import { configErrors } from './config-check.mjs';

export const RANK = { PASS: 0, REVIEW: 1, FAIL: 2 };
export const DEFAULT_OUT = join('reports', 'quality-gate.json');
export const DEFAULT_MUTATION_REPORT = join('reports', 'mutation', 'mutation.json');
const RISKS = ['informational', 'low', 'medium', 'high']; // index = ZAP riskcode
const HTTP_STORY = /^(GET|PUT|POST|DELETE|PATCH|HEAD|OPTIONS|TRACE) \//;

/** A source that exists but cannot be used. Becomes a FAIL with this message, never a crash. */
export class InputError extends Error {}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const round = (value, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;

// ---------------------------------------------------------------------------------------------
// Readers: every shape problem is an InputError that says where and what.

export function readJson(file) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {
    throw new InputError(`cannot read ${file}: ${error.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new InputError(`${file} is not valid JSON: ${error.message}`);
  }
}

/** The `*-result.json` files of an Allure results directory, parsed and checked. */
export function readAllureResults(dir) {
  if (!statSync(dir).isDirectory()) throw new InputError(`${dir} is not a directory`);
  const files = readdirSync(dir)
    .filter((name) => name.endsWith('-result.json'))
    .sort();
  return files.map((name) => {
    const result = readJson(join(dir, name));
    if (!isObject(result) || typeof result.status !== 'string') {
      throw new InputError(`${join(dir, name)} is not an Allure result (no "status")`);
    }
    return { ...result, file: name };
  });
}

// ---------------------------------------------------------------------------------------------
// Measures: pure functions from parsed input to `{ value, detail }`.

const PLAYWRIGHT_OUTCOMES = ['expected', 'unexpected', 'flaky', 'skipped'];

/** Pass rate (percent) of a Playwright JSON report. Flaky counts as passed and is reported. */
export function passRateFromPlaywright(report) {
  if (!isObject(report) || !Array.isArray(report.suites)) {
    throw new InputError('not a Playwright JSON report (no "suites" array)');
  }
  const records = flattenReport(report);
  const odd = records.filter((record) => !PLAYWRIGHT_OUTCOMES.includes(record.outcome));
  if (odd.length > 0) {
    throw new InputError(
      `unknown test outcome "${odd[0].outcome}" for "${odd[0].titlePath.join(' > ')}"`,
    );
  }
  const count = (outcome) => records.filter((record) => record.outcome === outcome).length;
  return rateOf({
    passed: count('expected'),
    flaky: count('flaky'),
    failed: count('unexpected'),
    skipped: count('skipped'),
  });
}

const ALLURE_STATUSES = ['passed', 'failed', 'broken', 'skipped', 'unknown'];

/**
 * Pass rate (percent) of Allure results. Attempts of one case (same historyId) are grouped and the
 * last one decides; a case that failed and then passed is flaky and counts as passed.
 */
export function passRateFromAllure(results) {
  const odd = results.find((result) => !ALLURE_STATUSES.includes(result.status));
  if (odd) throw new InputError(`${odd.file}: unknown status "${odd.status}"`);
  const groups = new Map();
  for (const result of results) {
    const key =
      result.historyId ?? result.testCaseId ?? result.fullName ?? result.uuid ?? result.file;
    groups.set(key, [...(groups.get(key) ?? []), result]);
  }
  const tally = { passed: 0, flaky: 0, failed: 0, skipped: 0 };
  for (const attempts of groups.values()) {
    attempts.sort((a, b) => (a.stop ?? a.start ?? 0) - (b.stop ?? b.start ?? 0));
    const last = attempts.at(-1).status;
    if (last === 'skipped') tally.skipped += 1;
    else if (last !== 'passed') tally.failed += 1;
    else if (attempts.some((attempt) => !['passed', 'skipped'].includes(attempt.status))) {
      tally.flaky += 1;
    } else tally.passed += 1;
  }
  return rateOf(tally);
}

function rateOf({ passed, flaky, failed, skipped }) {
  const executed = passed + flaky + failed;
  if (executed === 0) {
    throw new InputError(`no executed tests (${skipped} skipped): there is nothing to judge`);
  }
  return {
    value: round(((passed + flaky) / executed) * 100),
    detail: `${passed + flaky}/${executed} passed (${flaky} flaky), ${failed} failed, ${skipped} skipped`,
  };
}

/** Nearest-rank percentile of a non-empty list of numbers. */
export function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}

/**
 * p95 of API case durations (ms). An API case is a result labelled with its operation (a `story`
 * like "GET /pet/{petId}", written by the case metadata helper). Every executed attempt counts.
 * Returns `{ value: null }` with a reason when there are fewer samples than `minSamples`.
 */
export function p95FromAllure(results, minSamples = 5) {
  const api = results.filter(
    (result) =>
      result.status !== 'skipped' &&
      (result.labels ?? []).some(
        (label) => label?.name === 'story' && HTTP_STORY.test(String(label.value)),
      ),
  );
  const durations = api.map((result) => {
    const { start, stop } = result;
    if (!Number.isFinite(start) || !Number.isFinite(stop) || stop < start) {
      throw new InputError(`${result.file}: missing or inconsistent start/stop times`);
    }
    return stop - start;
  });
  const others = results.length - api.length;
  if (durations.length < minSamples) {
    return {
      value: null,
      detail: `only ${durations.length} timed API case(s), fewer than min_samples ${minSamples}; ${others} other result(s) ignored`,
    };
  }
  return {
    value: percentile(durations, 95),
    detail: `${durations.length} API case durations (per test, not per request), max ${Math.max(...durations)} ms; ${others} other result(s) ignored`,
  };
}

/** Alert counts per risk of a ZAP-style JSON report: `site` (array or object) with `alerts`. */
export function dastCounts(report) {
  if (!isObject(report) || !('site' in report)) {
    throw new InputError('not a ZAP JSON report (no "site")');
  }
  const sites = Array.isArray(report.site) ? report.site : [report.site];
  const counts = Object.fromEntries(RISKS.map((risk) => [risk, 0]));
  const names = Object.fromEntries(RISKS.map((risk) => [risk, []]));
  sites.forEach((site, i) => {
    if (!isObject(site)) throw new InputError(`site[${i}] is not an object`);
    const alerts = site.alerts ?? [];
    if (!Array.isArray(alerts)) throw new InputError(`site[${i}].alerts is not an array`);
    alerts.forEach((alert, j) => {
      const raw = alert?.riskcode; // ZAP writes it as a string
      if (!/^[0-3]$/.test(typeof raw === 'number' || typeof raw === 'string' ? String(raw) : '')) {
        throw new InputError(`site[${i}].alerts[${j}] has no valid riskcode (0-3)`);
      }
      const code = Number(raw);
      counts[RISKS[code]] += 1;
      names[RISKS[code]].push(alert.name ?? alert.alert ?? `alert ${j}`);
    });
  });
  const listed = ['high', 'medium']
    .filter((risk) => names[risk].length > 0)
    .map((risk) => `${risk}: ${names[risk].join(', ')}`);
  return {
    value: counts,
    detail: `alerts by risk ${RISKS.map((r) => `${r} ${counts[r]}`).join(', ')}${listed.length ? `; ${listed.join('; ')}` : ''}`,
  };
}

const DETECTED = ['Killed', 'Timeout'];
const UNDETECTED = ['Survived', 'NoCoverage'];
const NOT_VALID = ['CompileError', 'RuntimeError', 'Ignored', 'Pending'];

/** Mutation score (percent) of a Stryker JSON report: detected over detected plus undetected. */
export function mutationScore(report) {
  if (!isObject(report) || !isObject(report.files)) {
    throw new InputError('not a Stryker mutation report (no "files" object)');
  }
  const tally = { detected: 0, undetected: 0, invalid: 0 };
  for (const [name, file] of Object.entries(report.files)) {
    if (!Array.isArray(file?.mutants))
      throw new InputError(`files["${name}"] has no mutants array`);
    for (const mutant of file.mutants) {
      if (DETECTED.includes(mutant?.status)) tally.detected += 1;
      else if (UNDETECTED.includes(mutant?.status)) tally.undetected += 1;
      else if (NOT_VALID.includes(mutant?.status)) tally.invalid += 1;
      else throw new InputError(`files["${name}"]: unknown mutant status "${mutant?.status}"`);
    }
  }
  const valid = tally.detected + tally.undetected;
  if (valid === 0) throw new InputError('no valid mutants: the score is undefined');
  return {
    value: round((tally.detected / valid) * 100),
    detail: `${tally.detected}/${valid} mutants detected, ${tally.undetected} undetected, ${tally.invalid} not counted (errors, ignored) in ${Object.keys(report.files).length} file(s)`,
  };
}

// ---------------------------------------------------------------------------------------------
// Judges.

/** Lower is worse: below `failBelow` FAIL, below `reviewBelow` REVIEW. */
export function judgeBelow(value, failBelow, reviewBelow) {
  if (value < failBelow) return 'FAIL';
  if (reviewBelow !== undefined && value < reviewBelow) return 'REVIEW';
  return 'PASS';
}

/** Higher is worse: above `failAbove` FAIL, above `reviewAbove` REVIEW. */
export function judgeAbove(value, failAbove, reviewAbove) {
  if (value > failAbove) return 'FAIL';
  if (reviewAbove !== undefined && value > reviewAbove) return 'REVIEW';
  return 'PASS';
}

/** Per-risk limits: the worst risk decides. */
export function judgeCounts(counts, failAbove = {}, reviewAbove = {}) {
  const verdicts = RISKS.map((risk) =>
    judgeAbove(counts[risk], failAbove[risk] ?? Infinity, reviewAbove[risk]),
  );
  return worst(verdicts) ?? 'PASS';
}

// ---------------------------------------------------------------------------------------------
// Strategies: one per configured check.

const pick = (settings, keys) =>
  Object.fromEntries(
    keys.filter((key) => settings[key] !== undefined).map((k) => [k, settings[k]]),
  );

export const STRATEGIES = {
  pass_rate: {
    check: 'pass-rate',
    source: (settings, env) =>
      settings.source ??
      ((settings.format ?? 'playwright-json') === 'allure-results'
        ? 'allure-results'
        : env.QA_JSON_REPORT),
    sourceHint:
      'set quality_gate.pass_rate.source (or QA_JSON_REPORT for playwright-json) and run the tests first',
    threshold: (settings) => pick(settings, ['fail_below_pct', 'review_below_pct']),
    measure: (path, settings) =>
      (settings.format ?? 'playwright-json') === 'allure-results'
        ? passRateFromAllure(readAllureResults(path))
        : passRateFromPlaywright(readJson(path)),
    judge: (value, settings) =>
      judgeBelow(value, settings.fail_below_pct, settings.review_below_pct),
  },
  p95_latency: {
    check: 'p95-latency',
    source: (settings) => settings.source ?? 'allure-results',
    sourceHint: 'run the API lane first (it writes allure-results)',
    threshold: (settings) => pick(settings, ['fail_above_ms', 'review_above_ms', 'min_samples']),
    measure: (path, settings) => p95FromAllure(readAllureResults(path), settings.min_samples ?? 5),
    judge: (value, settings) => judgeAbove(value, settings.fail_above_ms, settings.review_above_ms),
  },
  dast: {
    check: 'dast',
    source: (settings) => settings.source,
    sourceHint: 'run the DAST scan first, or remove quality_gate.dast',
    threshold: (settings) => pick(settings, ['fail_above', 'review_above']),
    measure: (path) => dastCounts(readJson(path)),
    judge: (value, settings) => judgeCounts(value, settings.fail_above, settings.review_above),
  },
  mutation_score: {
    check: 'mutation-score',
    source: (settings) => settings.source ?? DEFAULT_MUTATION_REPORT,
    sourceHint: 'produce a Stryker JSON report first',
    threshold: (settings) => pick(settings, ['fail_below_pct', 'review_below_pct']),
    measure: (path) => mutationScore(readJson(path)),
    judge: (value, settings) =>
      judgeBelow(value, settings.fail_below_pct, settings.review_below_pct),
  },
};

/** Run one strategy: `{ check, verdict, value, threshold, detail, source }`, never throws. */
export function runCheck(strategy, settings, { cwd = process.cwd(), env = process.env } = {}) {
  const threshold = strategy.threshold(settings);
  const configured = strategy.source(settings, env);
  const base = { check: strategy.check, value: null, threshold, source: configured ?? null };
  if (!configured || !existsSync(resolve(cwd, configured))) {
    const missing = configured ? `source ${configured} not found` : 'no source configured';
    return settings.required
      ? { ...base, verdict: 'FAIL', detail: `${missing} and the check is required` }
      : { ...base, verdict: 'SKIPPED', detail: `${missing}; ${strategy.sourceHint}` };
  }
  try {
    const { value, detail } = strategy.measure(resolve(cwd, configured), settings);
    if (value === null) return { ...base, verdict: 'SKIPPED', detail };
    return { ...base, value, verdict: strategy.judge(value, settings), detail };
  } catch (error) {
    if (!(error instanceof InputError)) throw error;
    return { ...base, verdict: 'FAIL', detail: `invalid input: ${error.message}` };
  }
}

/** Worst verdict of a list (SKIPPED ignored); null when nothing was evaluated. */
export function worst(verdicts) {
  const judged = verdicts.filter((verdict) => verdict in RANK);
  if (judged.length === 0) return null;
  return judged.reduce((a, b) => (RANK[b] > RANK[a] ? b : a));
}

/** Evaluate every configured check of a `quality_gate` section. */
export function evaluate(gate = {}, options = {}) {
  const checks = Object.entries(STRATEGIES)
    .filter(([key]) => gate[key] !== undefined)
    .map(([key, strategy]) => runCheck(strategy, gate[key], options));
  return { verdict: worst(checks.map((c) => c.verdict)) ?? 'SKIPPED', checks };
}

/** Fails closed: a verdict this table does not know is a failure, never a pass (L-49). */
export function exitCode(verdict, failOnReview = false) {
  if (verdict === 'PASS' || verdict === 'SKIPPED') return 0;
  if (verdict === 'REVIEW') return failOnReview ? 1 : 0;
  return 1;
}

const showValue = (value) =>
  value === null
    ? '-'
    : isObject(value)
      ? Object.entries(value)
          .map(([k, v]) => `${k} ${v}`)
          .join(', ')
      : String(value);

const showThreshold = (threshold) =>
  Object.entries(threshold)
    .map(([key, value]) => `${key} ${showValue(value)}`)
    .join('; ') || '-';

const cell = (text) => String(text).replaceAll('|', '\\|').replaceAll('\n', ' ');

/** Markdown summary for a CI job summary. */
export function renderSummary(result) {
  const lines = [
    `## Quality gate: ${result.verdict}`,
    '',
    '| Check | Verdict | Value | Threshold | Detail |',
    '| --- | --- | --- | --- | --- |',
    ...result.checks.map(
      (c) =>
        `| ${c.check} | ${c.verdict} | ${cell(showValue(c.value))} | ${cell(showThreshold(c.threshold))} | ${cell(c.detail)} |`,
    ),
  ];
  if (result.checks.length === 0)
    lines.push('', 'No check is configured in qa-config.quality_gate.');
  if (result.verdict === 'REVIEW') {
    lines.push('', 'REVIEW keeps the build green: a person should look at the checks above.');
  }
  return `${lines.join('\n')}\n`;
}

function loadConfig(file) {
  const path = file ?? ['qa-config.json', 'qa-config.example.json'].find((f) => existsSync(f));
  if (!path) throw new Error('No qa-config.json or qa-config.example.json found (use --config).');
  let config;
  try {
    config = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`${path}: cannot read/parse: ${error.message}`, { cause: error });
  }
  const errors = configErrors(config);
  if (errors.length > 0) {
    throw new Error(`${path} is invalid (run npm run config:check):\n  - ${errors.join('\n  - ')}`);
  }
  return { path, gate: config.quality_gate ?? {} };
}

function writeFile(file, text) {
  mkdirSync(dirname(resolve(file)), { recursive: true });
  writeFileSync(file, text);
}

function main() {
  const { values } = parseArgs({
    options: {
      config: { type: 'string' },
      out: { type: 'string', default: DEFAULT_OUT },
      summary: { type: 'string' },
      'fail-on-review': { type: 'boolean', default: false },
    },
  });
  const { path, gate } = loadConfig(values.config);
  const result = { config: path, ...evaluate(gate) };
  for (const c of result.checks) {
    console.log(`quality-gate: ${c.check.padEnd(14)} ${c.verdict.padEnd(7)} ${c.detail}`);
  }
  if (result.checks.length === 0) console.log(`quality-gate: no check configured in ${path}`);
  writeFile(values.out, `${JSON.stringify(result, null, 2)}\n`);
  if (values.summary) writeFile(values.summary, renderSummary(result));
  console.log(`quality-gate: ${result.verdict} (artifact ${values.out})`);
  process.exitCode = exitCode(result.verdict, values['fail-on-review']);
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`quality-gate: ${error.message}`);
    process.exitCode = 2;
  }
}
