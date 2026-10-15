#!/usr/bin/env node
/**
 * Anti-flake lane: run a selection of tests several times in one Playwright process and report the
 * tests whose repeats disagree.
 *
 * Why. A retry turns an intermittent failure into a green run, so the failure is never looked at and
 * the randomness or timing problem behind it (L-27) stays in the suite. Gate lanes therefore run with
 * zero retries, and flakiness is measured on purpose here instead: `--repeat-each=N` executes every
 * selected test N times with retries forced to 0, and a test that both passed and failed is flaky.
 *
 * Quarantine convention.
 *   - A test confirmed flaky by this lane gets the tag `@quarantine` (in the title or in
 *     `{ tag: '@quarantine' }`) together with a link to the issue that tracks the fix.
 *   - Every other run leaves quarantined tests out: the suite, smoke, the known-gap, published and
 *     destructive lanes (the `grepInvert` of each `api-<pack>` project, `projectTagFilter` in
 *     scripts/lib/tags.mjs). This lane alone keeps them, by setting QA_INCLUDE_QUARANTINE=1 for its
 *     Playwright process; the variable is internal, never set by hand.
 *     Gate lanes run with zero retries, so nothing can hide behind a retry.
 *   - Quarantine is temporary: this lane keeps running the quarantined tests, and a quarantined test
 *     that passes every one of its N repeats is reported as a candidate for release.
 *
 *   node scripts/flake-lane.mjs [files...] [--service pack] [--project name] [--grep re]
 *                               [--grep-invert re] [--repeat-each 5] [--quarantine-report]
 *                               [--config file] [--json]
 *
 * The selection runs in every pack's project (`api-*`), or in one pack's (`api-<pack>`) with
 * `--service`; an explicit `--project` replaces either.
 *
 * Exit codes: 0 every non-quarantined test was stable; 1 a non-quarantined test was flaky or failed
 * in every repeat, or Playwright exited non-zero although no repeat failed (L-49); 2 the lane could
 * not run (bad arguments, retries enabled, no report, a Playwright process that was killed or could
 * not start).
 */

import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT } from './lib/cli.mjs';
import {
  QUARANTINE_TAG,
  assertZeroRetries,
  GATE_ENV,
  retriedRecords,
  formatTable,
  errorLine,
  normalizeTags,
  laneProject,
  runLane,
  unexplainedExit,
} from './lib/playwright-lane.mjs';
import { FLAKE_LANE_ENV } from './lib/tags.mjs';

export {
  QUARANTINE_TAG,
  assertZeroRetries,
  GATE_ENV,
  retriedRecords,
  formatTable,
  errorLine,
  normalizeTags,
};

export const DEFAULT_REPEATS = 5;

/** The environment this lane hands to Playwright: zero retries, and the quarantined tests kept. */
export const LANE_ENV = Object.freeze({ ...GATE_ENV, [FLAKE_LANE_ENV]: '1' });

// ---------------------------------------------------------------------------------------------
// Verdicts

/** One repeat's result: `pass`, `fail` or `skip`, judged by Playwright's outcome for that run. */
export function repeatResult(record) {
  if (record.outcome === 'skipped') return 'skip';
  return record.outcome === 'expected' ? 'pass' : 'fail';
}

/**
 * Group the records of a repeated run per test and give each a verdict:
 *   stable   every executed repeat passed
 *   failing  every executed repeat failed (a real failure, not flakiness)
 *   flaky    the repeats disagree
 *   skipped  no repeat executed
 */
export function flakeVerdicts(records) {
  const groups = new Map();
  for (const record of records) {
    const key = [record.project, record.file, record.line, record.titlePath.join(' > ')].join('|');
    if (!groups.has(key)) {
      groups.set(key, {
        title: record.titlePath.join(' > '),
        file: record.file,
        line: record.line,
        project: record.project,
        tags: normalizeTags(record.tags),
        pass: 0,
        fail: 0,
        skip: 0,
      });
    }
    groups.get(key)[repeatResult(record)] += 1;
  }
  return [...groups.values()].map((group) => {
    const verdict =
      group.pass + group.fail === 0
        ? 'skipped'
        : group.fail === 0
          ? 'stable'
          : group.pass === 0
            ? 'failing'
            : 'flaky';
    return { ...group, quarantined: group.tags.includes(QUARANTINE_TAG), verdict };
  });
}

/**
 * What to change in the specs: flaky tests not yet quarantined, and quarantined tests that passed
 * all `repeats` runs (candidates to release, after the fix is confirmed).
 */
export function quarantineReport(verdicts, repeats) {
  return {
    quarantine: verdicts.filter((v) => v.verdict === 'flaky' && !v.quarantined),
    release: verdicts.filter(
      (v) => v.quarantined && v.verdict === 'stable' && v.pass >= repeats && v.skip === 0,
    ),
    stillUnsteady: verdicts.filter((v) => v.quarantined && v.verdict !== 'stable'),
  };
}

/** Tests that make the lane fail: flaky or always failing, outside quarantine. */
export function blockingVerdicts(verdicts) {
  return verdicts.filter(
    (v) => !v.quarantined && (v.verdict === 'flaky' || v.verdict === 'failing'),
  );
}

/** Playwright arguments for a detection run. */
export function laneArgs({ files = [], project, grep, grepInvert, repeats, config }) {
  const args = [];
  if (config) args.push('--config', config);
  if (project) args.push(`--project=${project}`);
  if (grep) args.push('--grep', grep);
  if (grepInvert) args.push('--grep-invert', grepInvert);
  args.push(`--repeat-each=${repeats}`, ...files);
  return args;
}

// ---------------------------------------------------------------------------------------------
// Command line

export function parseRepeats(raw) {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 2) {
    throw new Error(`--repeat-each must be an integer of at least 2, got "${raw}".`);
  }
  return value;
}

/**
 * Run the lane and return `{ code, report }`; the caller prints. Throws when it cannot run, which
 * includes a Playwright process that did not finish (killed, could not start): its repeats are
 * incomplete. `report.failure` is set, and the code is 1, when Playwright exited non-zero although
 * no repeat failed (L-49). `run` replaces `runLane` in tests.
 */
export function flakeLane(options, root = REPO_ROOT, env = process.env, run = runLane) {
  assertZeroRetries(env);
  const lane = run(root, laneArgs(options), LANE_ENV);
  if (lane.runnerError) {
    throw new Error(`${unexplainedExit(lane, false)}.\n${lane.stderr || lane.stdout}`.trim());
  }
  if (lane.records.length === 0) {
    throw new Error(
      `Playwright produced no report (exit ${lane.exitCode}).\n${lane.stderr || lane.stdout}`.trim(),
    );
  }
  const retried = retriedRecords(lane.records);
  if (retried.length > 0) {
    throw new Error(
      `${retried.length} test(s) were retried although QA_RETRIES=0; a configuration sets retries ` +
        'another way. Gate lanes must run without retries.',
    );
  }
  const verdicts = flakeVerdicts(lane.records);
  const blocking = blockingVerdicts(verdicts);
  // A failed repeat, quarantined or not, accounts for a non-zero exit; nothing else does.
  const failure = unexplainedExit(
    lane,
    lane.records.some((record) => repeatResult(record) === 'fail'),
  );
  const report = {
    repeats: options.repeats,
    verdicts,
    quarantine: options.quarantineReport ? quarantineReport(verdicts, options.repeats) : null,
    failure,
  };
  return { code: blocking.length > 0 || failure ? 1 : 0, report };
}

function printReport(report) {
  const columns = [
    ['Verdict', (v) => v.verdict],
    ['Pass', (v) => v.pass],
    ['Fail', (v) => v.fail],
    ['Skip', (v) => v.skip],
    ['Q', (v) => (v.quarantined ? 'Q' : '')],
    ['Test', (v) => `[${v.project}] ${v.file}:${v.line} ${v.title}`],
  ];
  console.log(`flake-lane: ${report.verdicts.length} test(s), ${report.repeats} repeats each`);
  console.log(formatTable(report.verdicts, columns));
  const counts = Object.groupBy(report.verdicts, (v) => v.verdict);
  console.log(
    ['stable', 'flaky', 'failing', 'skipped']
      .map((verdict) => `${verdict}: ${counts[verdict]?.length ?? 0}`)
      .join(', '),
  );
  if (report.failure) console.log(`\nThe run failed: ${report.failure}`);
  if (!report.quarantine) return;
  const list = (heading, items, hint) => {
    console.log(`\n${heading} (${items.length})${items.length > 0 ? `: ${hint}` : ''}`);
    for (const v of items) console.log(`  ${v.file}:${v.line} ${v.title} (${v.pass}/${v.fail})`);
  };
  list(
    'Flaky, not quarantined',
    report.quarantine.quarantine,
    `tag ${QUARANTINE_TAG} with the issue that tracks the fix`,
  );
  list(
    `Quarantined and stable ${report.repeats} times`,
    report.quarantine.release,
    `candidates to drop ${QUARANTINE_TAG} once the fix is confirmed`,
  );
  list('Quarantined and still unsteady', report.quarantine.stillUnsteady, 'keep the quarantine');
}

function main(argv = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      service: { type: 'string' },
      project: { type: 'string' },
      grep: { type: 'string' },
      'grep-invert': { type: 'string' },
      'repeat-each': { type: 'string', default: String(DEFAULT_REPEATS) },
      'quarantine-report': { type: 'boolean', default: false },
      config: { type: 'string' },
      json: { type: 'boolean', default: false },
    },
  });
  const { code, report } = flakeLane({
    files: positionals,
    project: laneProject(values),
    grep: values.grep,
    grepInvert: values['grep-invert'],
    repeats: parseRepeats(values['repeat-each']),
    quarantineReport: values['quarantine-report'],
    config: values.config,
  });
  if (values.json) console.log(JSON.stringify(report, null, 2));
  else printReport(report);
  return code;
}

const entryScript = process.argv[1];
if (entryScript && pathToFileURL(entryScript).href === import.meta.url) {
  try {
    process.exit(main());
  } catch (error) {
    console.error(`flake-lane: ${error.message}`);
    process.exit(2);
  }
}
