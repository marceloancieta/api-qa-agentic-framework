#!/usr/bin/env node
/**
 * Destructive lane (GATE-12): run every `@destructive` case alone, each followed by the
 * environment's recovery, and check that the service answers again before the next one.
 *
 * Why. A destructive case leaves a record that breaks a read for every other caller, or a state no
 * API call can undo (L-59). Next to other cases it turns their results red for reasons they do not
 * own, and a second destructive case run after it measures the damage of the first. So every other
 * run leaves these cases out (the `api` project's `grepInvert` in playwright.config.ts), and this
 * lane runs them last, one Playwright process per case with `QA_DESTRUCTIVE=1`, which selects only
 * them.
 *
 * Recovery comes from qa-config: `api.environments.<env>.recovery.command` is a shell command run
 * from the repository root (for the Petstore container, a restart), then the base URL is polled
 * until it answers with a status below 500, for up to `ready_timeout_s` seconds (default 60). The
 * case itself still cleans up what an API call can remove, in `finally`; the recovery covers what it
 * cannot. A failed recovery stops the lane: later cases would run against a broken service.
 *
 * Verdicts (one per case):
 *   passed        the case passed
 *   known-gap     armed as an expected failure, still failing
 *   gap-passing   armed, but it passed: the defect may be fixed or the reproduction broken (L-14)
 *   failed        the case failed; or its Playwright process did not finish (killed, could not
 *                 start), or exited non-zero while the case's own result looked fine (L-49)
 *   skipped       the case skipped itself (reported, does not fail the lane)
 *   not-run       Playwright produced no result, or the lane stopped before the case
 * and one recovery outcome: recovered, command-failed or not-ready.
 *
 *   node scripts/destructive-lane.mjs [--project api] [--list] [--json] [--new-run] [--root dir]
 *                                     [--config file]
 *
 * `--list` prints the selection without running anything (offline). The lane refuses to run in an
 * environment whose `allow_writes` is false, or that names no recovery.
 *
 * One run. The lane runs last, after the shared run, and its results belong to that run: it reuses
 * the run id of the latest results in allure-results/ and keeps them (QA_RUN_ID, QA_KEEP_RESULTS=1),
 * so `tm:report` reports both together. With `--new-run`, or when there are no results, it starts
 * a run of its own instead.
 *
 * Exit codes: 0 every case passed, skipped or failed as an armed gap, and every recovery worked;
 * 1 otherwise; 2 the lane could not run.
 */

import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { activeEnvironment, REPO_ROOT } from './lib/cli.mjs';
import { parseSpecFile, specFiles } from './lib/corpus.mjs';
import {
  GATE_ENV,
  assertZeroRetries,
  errorLine,
  exitDetail,
  formatTable,
  retriedRecords,
  runLane,
  unexplainedExit,
} from './lib/playwright-lane.mjs';
import { describeExit, exitCodeOf } from './lib/spawn.mjs';
import { DESTRUCTIVE_TAG } from './lib/tags.mjs';
import { recordsFor } from './known-gap-lane.mjs';

export const PROBLEM_VERDICTS = new Set(['failed', 'gap-passing', 'not-run']);
export const LANE_ENV = Object.freeze({ ...GATE_ENV, QA_DESTRUCTIVE: '1' });
const DEFAULT_READY_TIMEOUT_S = 60;

// ---------------------------------------------------------------------------------------------
// Selection

/** Every `@destructive` test under `<root>/services/<pack>/specs`, in file and line order. */
export function findDestructive(root, pack = null) {
  return specFiles(root, pack).flatMap((file) =>
    parseSpecFile(root, file)
      .tests.filter((test) => test.tags.includes(DESTRUCTIVE_TAG))
      .map((test) => ({ file, line: test.line, title: test.title, caseId: test.caseId })),
  );
}

// ---------------------------------------------------------------------------------------------
// Classification

/** One verdict from the records of the case's own run. */
export function classifyCase(records) {
  if (records.length === 0) return { verdict: 'not-run', detail: 'no result for this case' };
  if (records.length > 1) {
    return { verdict: 'failed', detail: `${records.length} results for one case; expected one` };
  }
  const [record] = records;
  const last = record.attempts.at(-1);
  if (record.outcome === 'skipped') return { verdict: 'skipped', detail: 'skipped itself' };
  if (record.expectedStatus === 'failed') {
    if (record.outcome === 'expected') return { verdict: 'known-gap', detail: 'still fails' };
    if (last?.status === 'passed') {
      return { verdict: 'gap-passing', detail: 'passed with the arm in place; investigate' };
    }
  }
  if (record.outcome === 'expected') return { verdict: 'passed', detail: '' };
  return { verdict: 'failed', detail: errorLine(last) || `ended as ${last?.status ?? 'unknown'}` };
}

// ---------------------------------------------------------------------------------------------
// Recovery

/** The environment's recovery settings, or null when it names none. */
export function recoveryOf(environment) {
  const recovery = environment.config.recovery;
  if (!recovery?.command) return null;
  return {
    command: recovery.command,
    readyTimeoutS: recovery.ready_timeout_s ?? DEFAULT_READY_TIMEOUT_S,
  };
}

/** Run the recovery command in `root`; `{ ok, detail }`. */
export function runRecoveryCommand(command, root) {
  const run = spawnSync(command, { cwd: root, shell: true, encoding: 'utf8' });
  if (exitCodeOf(run) === 0) return { ok: true, detail: '' };
  const why = (run.stderr || run.stdout || '').trim().split('\n').at(-1);
  return { ok: false, detail: `${describeExit(run)}${why ? `: ${why}` : ''}` };
}

/** Poll `url` until it answers below 500 or `timeoutS` passes; `{ ok, detail }`. */
export async function waitUntilAnswers(url, timeoutS, { fetchImpl = fetch, sleep } = {}) {
  const pause = sleep ?? ((ms) => new Promise((done) => setTimeout(done, ms)));
  const deadline = Date.now() + timeoutS * 1000;
  let last;
  do {
    try {
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(3000) });
      if (response.status < 500) return { ok: true, detail: `answered ${response.status}` };
      last = `answered ${response.status}`;
    } catch (error) {
      last = error.cause?.code ?? error.message;
    }
    await pause(1000);
  } while (Date.now() < deadline);
  return { ok: false, detail: `${url} did not answer below 500 within ${timeoutS}s (${last})` };
}

// ---------------------------------------------------------------------------------------------
// The run the lane belongs to

/** The `run` label of the most recent result in `resultsDir`, or null when there is none. */
export function latestRunId(resultsDir) {
  if (!existsSync(resultsDir)) return null;
  let latest = null;
  for (const name of readdirSync(resultsDir).filter((n) => n.endsWith('-result.json'))) {
    let result;
    try {
      result = JSON.parse(readFileSync(join(resultsDir, name), 'utf8'));
    } catch {
      continue;
    }
    const run = (result.labels ?? []).find((l) => l.name === 'run')?.value;
    if (run && (!latest || (result.stop ?? 0) > latest.stop))
      latest = { run, stop: result.stop ?? 0 };
  }
  return latest?.run ?? null;
}

/**
 * The environment of the case at `index`: the lane's selection plus one run id for every case.
 * Results are kept, except by the first case of a new run, whose global setup clears old ones.
 */
export function caseEnv(index, { runId, join: joining }) {
  return { ...LANE_ENV, QA_RUN_ID: runId, QA_KEEP_RESULTS: joining || index > 0 ? '1' : '0' };
}

// ---------------------------------------------------------------------------------------------
// Running

/** Playwright arguments that select exactly one case. */
export function caseArgs(file, line, project, config) {
  return [
    ...(config ? ['--config', config] : []),
    `--project=${project}`,
    '--workers=1',
    `${file}:${line}`,
  ];
}

/**
 * Run each case in its own process, then its recovery. `recover()` returns `{ ok, outcome, detail }`.
 * After a failed recovery the remaining cases are reported as not run.
 */
export async function runDestructive(
  cases,
  { scanRoot, runRoot, project, config, recover, run, runId = 'lane', join: joining = false },
) {
  const results = [];
  let stopped = null;
  for (const [index, item] of cases.entries()) {
    if (stopped) {
      results.push({ ...item, verdict: 'not-run', detail: `lane stopped: ${stopped}` });
      continue;
    }
    const file = relative(runRoot, join(scanRoot, item.file)).replace(/\\/g, '/');
    const env = caseEnv(index, { runId, join: joining });
    const lane = (run ?? runLane)(runRoot, caseArgs(file, item.line, project, config), env);
    if (retriedRecords(lane.records).length > 0) {
      throw new Error('a case was retried although QA_RETRIES=0; gate lanes run without retries');
    }
    const result = classifyCase(recordsFor({ ...item, file }, lane.records, project));
    const failure = unexplainedExit(lane, PROBLEM_VERDICTS.has(result.verdict));
    if (failure) Object.assign(result, { verdict: 'failed', detail: failure });
    else if (result.verdict === 'not-run' && lane.exitCode !== 0) result.detail = exitDetail(lane);
    const recovery = await recover();
    if (!recovery.ok) stopped = `recovery after ${item.caseId ?? item.title} failed`;
    results.push({
      ...item,
      ...result,
      recovery: recovery.outcome,
      recoveryDetail: recovery.detail,
    });
  }
  return results;
}

/** The recovery step for the active environment: the command, then the readiness poll. */
export function recoveryStep(recovery, baseUrl, root) {
  return async () => {
    const command = runRecoveryCommand(recovery.command, root);
    if (!command.ok) return { ok: false, outcome: 'command-failed', detail: command.detail };
    const ready = await waitUntilAnswers(baseUrl, recovery.readyTimeoutS);
    return ready.ok
      ? { ok: true, outcome: 'recovered', detail: ready.detail }
      : { ok: false, outcome: 'not-ready', detail: ready.detail };
  };
}

export const laneProblems = (results) =>
  results.filter(
    (r) => PROBLEM_VERDICTS.has(r.verdict) || (r.recovery && r.recovery !== 'recovered'),
  );

function printResults(results) {
  console.log(
    formatTable(results, [
      ['Verdict', (r) => r.verdict ?? 'selected'],
      ['Recovery', (r) => r.recovery ?? ''],
      ['Case', (r) => r.caseId ?? r.title],
      ['Location', (r) => `${r.file}:${r.line}`],
      ['Detail', (r) => [r.detail, r.recoveryDetail].filter(Boolean).join('; ')],
    ]),
  );
}

async function main(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: {
      project: { type: 'string', default: 'api' },
      list: { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
      root: { type: 'string' },
      config: { type: 'string' },
      'new-run': { type: 'boolean', default: false },
    },
  });
  const scanRoot = values.root ? resolve(values.root) : REPO_ROOT;
  const cases = findDestructive(scanRoot);
  if (cases.length === 0) {
    if (values.json) console.log(JSON.stringify({ cases: [] }, null, 2));
    else console.log('destructive-lane: no @destructive cases in the specs; nothing to run.');
    return 0;
  }
  if (values.list) {
    if (values.json) console.log(JSON.stringify({ cases }, null, 2));
    else printResults(cases);
    return 0;
  }
  assertZeroRetries();
  const environment = activeEnvironment(REPO_ROOT);
  if (!environment.config.allow_writes) {
    throw new Error(
      `environment "${environment.name}" has allow_writes false; destructive cases never run there`,
    );
  }
  const recovery = recoveryOf(environment);
  if (!recovery) {
    throw new Error(
      `environment "${environment.name}" names no recovery (api.environments.${environment.name}.recovery ` +
        `in ${environment.source}); a destructive case needs one`,
    );
  }
  const baseUrl = (process.env.API_BASE_URL || environment.config.base_url).replace(/\/+$/, '');
  const previous = values['new-run'] ? null : latestRunId(join(REPO_ROOT, 'allure-results'));
  const runId = previous ?? randomBytes(4).toString('hex');
  console.log(
    previous
      ? `destructive-lane: joining run ${runId}, the latest in allure-results (--new-run starts one)`
      : `destructive-lane: new run ${runId}`,
  );
  const results = await runDestructive(cases, {
    runId,
    join: Boolean(previous),
    scanRoot,
    runRoot: REPO_ROOT,
    project: values.project,
    config: values.config,
    recover: recoveryStep(recovery, baseUrl, REPO_ROOT),
  });
  const problems = laneProblems(results);
  if (values.json) console.log(JSON.stringify({ cases: results }, null, 2));
  else {
    console.log(
      `destructive-lane: ${results.length} case(s) on "${environment.name}", one process each, ` +
        `each followed by: ${recovery.command}`,
    );
    printResults(results);
    if (problems.length > 0) console.log(`\n${problems.length} case(s) need attention.`);
  }
  return problems.length > 0 ? 1 : 0;
}

const entryScript = process.argv[1];
if (entryScript && pathToFileURL(entryScript).href === import.meta.url) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error(`destructive-lane: ${error.message}`);
      process.exit(2);
    },
  );
}
