#!/usr/bin/env node
/**
 * Known-gap lane: re-check every case armed as an expected failure, one Playwright process per case.
 *
 * Why. An expected failure stays green for as long as the case keeps failing, for any reason. When
 * the defect is fixed the case starts passing and the arm reports it as a failure that no daily
 * view highlights; when the reproduction breaks first, the arm hides it (L-13, L-14). Each case
 * runs alone so that one result can never mask another: a crash, a timeout or a collection problem
 * in one case cannot change what is reported for the next.
 *
 * Selection is read from the syntax tree of the packs' specs, never from titles alone:
 *   - a `test.fail(...)` inside a test body whose reason is `knownGap(key, why)`, directly or through
 *     a variable initialised from it (`const reason = await knownGap(...)`);
 *   - or a test tagged `@known-gap`.
 * A `@destructive` known gap is left out: it runs only in the destructive lane, followed by its
 * recovery (scripts/destructive-lane.mjs), which reports its arm the same way. A `@quarantine` one
 * is left out too: every run but the flake lane's leaves it out (`projectTagFilter` in
 * scripts/lib/tags.mjs).
 *
 * Verdicts (one per case):
 *   open        the arm was reached and the case still fails: the gap is open, nothing to do
 *   passing     the arm was reached and the case passed: the defect may be fixed or the
 *               reproduction may have broken. Investigate before removing the arm (L-14)
 *   unarmed     the case passed without reaching an arm (its condition did not hold)
 *   errored     the case failed before the arm, or ended in a timeout or an interruption; or its
 *               Playwright process did not finish (killed, could not start), or exited non-zero
 *               while the case's own result looked fine (L-49: the exit code has the last word)
 *   skipped     the case skipped itself (reported, does not fail the lane)
 *   not-run     Playwright produced no result for the case
 *
 *   node scripts/known-gap-lane.mjs [--service pack] [--project name] [--list] [--json] [--root dir]
 *                                   [--config file]
 *
 * `--service` keeps the gaps of one pack. Each case runs in its pack's project (`api-<pack>`, from
 * its spec path), so it waits only on that pack's preflight; an explicit `--project` replaces it.
 * `--list` prints the selection without running anything (offline). `--root` is where `services/`
 * is scanned (default: the repository); `--config` is handed to Playwright.
 *
 * Exit codes: 0 no gap needs attention (including when there are none); 1 a gap is passing,
 * unarmed, errored or not run; 2 the lane could not run.
 */

import { join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT } from './lib/cli.mjs';
import { classifyCall, literalText, parseSpecFile, specFiles, ts } from './lib/corpus.mjs';
import {
  GATE_ENV,
  assertZeroRetries,
  caseProject,
  errorLine,
  exitDetail,
  formatTable,
  projectMatches,
  retriedRecords,
  runLane,
  unexplainedExit,
} from './lib/playwright-lane.mjs';
import { DESTRUCTIVE_TAG, KNOWN_GAP_TAG, QUARANTINE_TAG } from './lib/tags.mjs';

export { KNOWN_GAP_TAG };

const HELPER = 'knownGap';
export const PROBLEM_VERDICTS = new Set(['passing', 'unarmed', 'errored', 'not-run']);

// ---------------------------------------------------------------------------------------------
// Selection

const unwrap = (node) => {
  let current = node;
  while (current && (ts.isAwaitExpression(current) || ts.isParenthesizedExpression(current))) {
    current = current.expression;
  }
  return current;
};

/** `knownGap(...)` or `meta.knownGap(...)`, after removing `await` and parentheses; else null. */
export function helperCall(node) {
  const call = unwrap(node);
  if (!call || !ts.isCallExpression(call)) return null;
  const callee = call.expression;
  const name = ts.isIdentifier(callee)
    ? callee.text
    : ts.isPropertyAccessExpression(callee)
      ? callee.name.text
      : null;
  return name === HELPER ? call : null;
}

function descendants(root, visit) {
  const walk = (node) => {
    visit(node);
    ts.forEachChild(node, walk);
  };
  if (root) walk(root);
}

/**
 * The known-gap arm inside one test body: `{ key, why, line }` for the first `test.fail(...)` whose
 * reason comes from `knownGap(...)`, or null. Keys and reasons are null when they are computed.
 */
export function findArm(body, sourceFile) {
  if (!body) return null;
  const initialisers = new Map();
  descendants(body, (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      initialisers.set(node.name.text, node.initializer);
    }
  });
  let arm = null;
  descendants(body, (node) => {
    if (arm || !ts.isCallExpression(node)) return;
    const { kind, modifier } = classifyCall(node);
    if (kind !== 'other' || modifier !== 'fail') return;
    // test.fail(condition, reason) or test.fail(reason)
    const reason = unwrap(node.arguments[node.arguments.length - 1]);
    const source =
      helperCall(reason) ??
      (reason && ts.isIdentifier(reason) ? helperCall(initialisers.get(reason.text)) : null);
    if (!source) return;
    arm = {
      key: literalText(source.arguments[0]),
      why: literalText(source.arguments[1]),
      line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
    };
  });
  return arm;
}

/** Known-gap cases of one parsed spec (see `parseSpecSource` in scripts/lib/corpus.mjs). */
export function knownGapsOf(spec) {
  const gaps = [];
  for (const test of spec.tests) {
    if (test.tags.includes(DESTRUCTIVE_TAG) || test.tags.includes(QUARANTINE_TAG)) continue;
    const body = test.node.arguments.find((argument) => ts.isFunctionLike(argument));
    const arm = findArm(body, spec.sourceFile);
    const tagged = test.tags.includes(KNOWN_GAP_TAG);
    if (!arm && !tagged) continue;
    gaps.push({
      file: spec.file,
      line: test.line,
      title: test.title,
      caseId: test.caseId,
      key: arm?.key ?? null,
      why: arm?.why ?? null,
      armed: Boolean(arm),
      tagged,
    });
  }
  return gaps;
}

/** Every known-gap case under `<root>/services/<pack>/specs`. */
export function findKnownGaps(root, pack = null) {
  return specFiles(root, pack).flatMap((file) => knownGapsOf(parseSpecFile(root, file)));
}

// ---------------------------------------------------------------------------------------------
// Classification

/** True when the report's file (relative to a test directory) names the selected spec. */
export function sameFile(selected, reported) {
  const a = selected.replace(/\\/g, '/');
  const b = String(reported ?? '').replace(/\\/g, '/');
  return a === b || a.endsWith(`/${b}`);
}

/** The records of a lane that belong to the selected case; `project` is the `--project` filter. */
export function recordsFor(gap, records, project) {
  return records.filter(
    (r) => projectMatches(project, r.project) && r.line === gap.line && sameFile(gap.file, r.file),
  );
}

/** One verdict (see the header) from the records of the case's own run. */
export function classifyGap(records) {
  if (records.length === 0) return { verdict: 'not-run', detail: 'no result for this case' };
  if (records.length > 1) {
    return { verdict: 'errored', detail: `${records.length} results for one case; expected one` };
  }
  const [record] = records;
  const last = record.attempts.at(-1);
  const error = errorLine(last);
  if (record.outcome === 'skipped') return { verdict: 'skipped', detail: 'skipped itself' };
  if (record.expectedStatus === 'failed') {
    if (record.outcome === 'expected') return { verdict: 'open', detail: 'still fails' };
    if (last?.status === 'passed') {
      return {
        verdict: 'passing',
        detail: 'passed with the arm in place; investigate before removing the arm',
      };
    }
    return { verdict: 'errored', detail: `ended as ${last?.status ?? 'unknown'} ${error}`.trim() };
  }
  if (record.outcome === 'expected') {
    return { verdict: 'unarmed', detail: 'passed without reaching an arm' };
  }
  return { verdict: 'errored', detail: `failed before the arm: ${error}`.trim() };
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
 * Run every gap in its own process. `runRoot` is where Playwright runs (it has node_modules);
 * `project` replaces the project of each gap's pack when given.
 */
export function runKnownGaps(gaps, { scanRoot, runRoot, project = null, config, run = runLane }) {
  return gaps.map((gap) => {
    const file = relative(runRoot, join(scanRoot, gap.file)).replace(/\\/g, '/');
    const own = caseProject(gap.file, project);
    const lane = run(runRoot, caseArgs(file, gap.line, own, config), GATE_ENV);
    if (retriedRecords(lane.records).length > 0) {
      throw new Error('a case was retried although QA_RETRIES=0; gate lanes run without retries');
    }
    const result = classifyGap(recordsFor({ ...gap, file }, lane.records, own));
    const failure = unexplainedExit(lane, PROBLEM_VERDICTS.has(result.verdict));
    if (failure) Object.assign(result, { verdict: 'errored', detail: failure });
    else if (result.verdict === 'not-run' && lane.exitCode !== 0) result.detail = exitDetail(lane);
    return { ...gap, ...result };
  });
}

function printResults(results) {
  console.log(
    formatTable(results, [
      ['Verdict', (r) => r.verdict ?? 'selected'],
      ['Issue', (r) => r.key ?? (r.armed ? '(computed)' : '(no arm)')],
      ['Case', (r) => r.caseId ?? r.title],
      ['Location', (r) => `${r.file}:${r.line}`],
      ['Detail', (r) => r.detail ?? (r.tagged && !r.armed ? 'tagged, no knownGap() arm' : '')],
    ]),
  );
}

function main(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: {
      service: { type: 'string' },
      project: { type: 'string' },
      list: { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
      root: { type: 'string' },
      config: { type: 'string' },
    },
  });
  const scanRoot = values.root ? resolve(values.root) : REPO_ROOT;
  const gaps = findKnownGaps(scanRoot, values.service ?? null);
  if (gaps.length === 0) {
    if (values.json) console.log(JSON.stringify({ gaps: [] }, null, 2));
    else console.log('known-gap-lane: no known-gap cases in the specs; nothing to check.');
    return 0;
  }
  if (values.list) {
    if (values.json) console.log(JSON.stringify({ gaps }, null, 2));
    else printResults(gaps);
    return 0;
  }
  assertZeroRetries();
  const results = runKnownGaps(gaps, {
    scanRoot,
    runRoot: REPO_ROOT,
    project: values.project ?? null,
    config: values.config,
  });
  const problems = results.filter((r) => PROBLEM_VERDICTS.has(r.verdict));
  if (values.json) console.log(JSON.stringify({ gaps: results }, null, 2));
  else {
    console.log(`known-gap-lane: ${results.length} case(s), one Playwright process each`);
    printResults(results);
    if (problems.length > 0) {
      console.log(
        `\n${problems.length} case(s) need attention. A passing gap is investigated before its ` +
          'arm is removed: the fix may be real, or the reproduction may have broken.',
      );
    }
  }
  return problems.length > 0 ? 1 : 0;
}

const entryScript = process.argv[1];
if (entryScript && pathToFileURL(entryScript).href === import.meta.url) {
  try {
    process.exit(main());
  } catch (error) {
    console.error(`known-gap-lane: ${error.message}`);
    process.exit(2);
  }
}
