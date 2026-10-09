#!/usr/bin/env node
/**
 * Published-case lane: re-run the cases a registry marks as `published`, optionally only those
 * whose feature touches an operation that changed in the contract.
 *
 * Why. Published cases are the ones people rely on, so they are re-run on a schedule even when
 * nothing seems to have changed, and right away when the contract moves: a diff of the description
 * says what changed, only running the affected cases says whether it matters (L-31).
 *
 * Selection.
 *   - Every registry row with status `published` names a case id; the case is the test of that pack
 *     whose title starts with the id (the registry's Spec column is preferred when it matches).
 *   - `--changed-from-digest` keeps only the registries whose `endpoints` intersect the operations
 *     that differ between the tracked digest (docs/discovery/<pack>-digest.json) and the pack's
 *     current description. Operations reached through a changed named schema count as changed, and
 *     so does changed operation text, since prose can announce a behaviour change.
 *   - Tests tagged `@quarantine` are left out (gate lanes run with `--grep-invert @quarantine`).
 *
 * All selected cases run in one Playwright process with zero retries, selected with a `--grep`
 * built from their ids. Each case gets a verdict: passed, known-gap (an armed expected failure that
 * still fails), failed, skipped, not-run (no result), missing (no test carries the id) or
 * quarantined (not run on purpose).
 *
 *   node scripts/published-lane.mjs [--changed-from-digest] [--pack name] [--project api]
 *                                   [--list] [--json] [--root dir] [--config file]
 *
 * Exit codes: 0 every selected case passed or was not selected (including when there is none);
 * 1 a case failed, did not run or has no test; 2 the lane could not run.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT, resolveSpecSource } from './lib/cli.mjs';
import { parseSpecFile, specFiles } from './lib/corpus.mjs';
import { loadModel } from './lib/openapi.mjs';
import { loadRegistries } from './lib/registry.mjs';
import { computeDigest, diffDigests, digestPath } from './swagger-digest.mjs';
import {
  GATE_ENV,
  QUARANTINE_TAG,
  assertZeroRetries,
  errorLine,
  formatTable,
  retriedRecords,
  runLane,
} from './lib/playwright-lane.mjs';

const CASE_ID = /^(TC-[A-Z][A-Z0-9]*-\d+)\b/;
export const PROBLEM_VERDICTS = new Set(['failed', 'not-run', 'missing']);

// ---------------------------------------------------------------------------------------------
// Changed operations

// Escapes only what is special outside a character class, so the result also stays valid for a
// RegExp built with the `u` flag (where a needless escape such as `\-` is an error).
export const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** `get  /pet/{petId} ` -> `GET /pet/{petId}`, the operation key format of the digest. */
export function normalizeEndpoint(endpoint) {
  const [method = '', ...rest] = String(endpoint).trim().split(/\s+/);
  return `${method.toUpperCase()} ${rest.join(' ')}`.trim();
}

/** The operation a drift entry belongs to, or null (named-schema entries belong to none). */
function operationOf(where, keys) {
  let found = null;
  for (const key of keys) {
    if ((where === key || where.startsWith(`${key} `)) && (!found || key.length > found.length)) {
      found = key;
    }
  }
  return found;
}

const mentions = (value, name) =>
  new RegExp(`ref=${escapeRegExp(name)}(?![\\w.-])`).test(JSON.stringify(value ?? {}));

/**
 * Operation keys whose contract differs between two digests: operations added or removed, any
 * entry of an operation that changed, changed operation text, and operations that reference a
 * changed named schema (directly or through other named schemas).
 */
export function changedOperations(tracked, current) {
  const { structural, descriptions } = diffDigests(tracked, current);
  const operations = { ...(tracked.operations ?? {}), ...(current.operations ?? {}) };
  const keys = Object.keys(operations);
  const changed = new Set();
  const schemas = new Set();
  for (const entry of [...structural, ...descriptions]) {
    if (entry.class === 'schemas') schemas.add(entry.where.split(' ')[0]);
    else {
      const key = operationOf(entry.where, keys);
      if (key) changed.add(key);
    }
  }
  // A schema that references a changed schema has changed too.
  const named = { ...(tracked.schemas ?? {}), ...(current.schemas ?? {}) };
  let grew = true;
  while (grew) {
    grew = false;
    for (const name of Object.keys(named)) {
      if (schemas.has(name)) continue;
      const refers = [...schemas].some(
        (target) =>
          mentions(tracked.schemas?.[name], target) || mentions(current.schemas?.[name], target),
      );
      if (refers) {
        schemas.add(name);
        grew = true;
      }
    }
  }
  for (const key of keys) {
    const uses = [...schemas].some(
      (name) =>
        mentions(tracked.operations?.[key], name) || mentions(current.operations?.[key], name),
    );
    if (uses) changed.add(key);
  }
  return [...changed].sort();
}

// ---------------------------------------------------------------------------------------------
// Selection

/** The registries under `root` and, for each pack that has one, its parsed specs. */
export function loadInputs(root, pack = null) {
  const registries = loadRegistries(root, pack);
  const packs = [...new Set(registries.map((r) => r.pack))];
  const corpusByPack = new Map(
    packs.map((name) => [name, specFiles(root, name).map((f) => parseSpecFile(root, f))]),
  );
  return { registries, corpusByPack };
}

/**
 * Published cases with the tests that carry their ids. `corpusByPack` maps a pack to its parsed
 * specs; `changed` (a Set of operation keys per pack, or null) narrows the selection.
 */
export function selectPublished(registries, corpusByPack, changed = null) {
  const selected = [];
  for (const registry of registries) {
    const endpoints = (registry.meta.endpoints ?? []).map(normalizeEndpoint);
    if (changed) {
      const keys = changed.get(registry.pack) ?? new Set();
      if (!endpoints.some((endpoint) => keys.has(endpoint))) continue;
    }
    const specs = corpusByPack.get(registry.pack) ?? [];
    for (const row of registry.cases.filter((c) => c.status === 'published')) {
      const preferred = row.spec ? `services/${registry.pack}/${row.spec}` : null;
      const matches = specs.flatMap((spec) =>
        spec.tests
          .filter((test) => test.caseId === row.id)
          .map((test) => ({
            file: spec.file,
            line: test.line,
            title: test.title,
            tags: test.tags,
          })),
      );
      const inSpec = matches.filter((m) => m.file === preferred);
      const tests = inSpec.length > 0 ? inSpec : matches;
      selected.push({
        id: row.id,
        pack: registry.pack,
        registry: registry.file,
        tests,
        quarantined: tests.length > 0 && tests.every((t) => t.tags.includes(QUARANTINE_TAG)),
      });
    }
  }
  return selected;
}

/**
 * A `--grep` pattern that matches exactly these case ids at the start of a title. Playwright tests
 * the pattern against the title path joined with spaces, so an id is preceded by the start or a
 * space, and must not continue (TC-X-01 never selects TC-X-010).
 */
export function buildGrep(ids) {
  if (ids.length === 0) throw new Error('buildGrep needs at least one case id');
  const unique = [...new Set(ids)].sort();
  return `(?:^|\\s)(?:${unique.map(escapeRegExp).join('|')})(?![\\w-])`;
}

/** Playwright arguments for one run over the selected cases. */
export function laneArgs(cases, { project, config, runFiles }) {
  return [
    ...(config ? ['--config', config] : []),
    `--project=${project}`,
    '--grep',
    buildGrep(cases.map((c) => c.id)),
    '--grep-invert',
    QUARANTINE_TAG,
    ...runFiles,
  ];
}

/** One verdict per case from the records of the run. */
export function classifyCase(selection, records) {
  if (selection.tests.length === 0) {
    return { verdict: 'missing', detail: `no test title starts with ${selection.id}` };
  }
  if (selection.quarantined) return { verdict: 'quarantined', detail: `tagged ${QUARANTINE_TAG}` };
  const own = records.filter((r) => CASE_ID.exec(r.title)?.[1] === selection.id);
  if (own.length === 0) return { verdict: 'not-run', detail: 'no result for this case' };
  const failed = own.filter((r) => r.outcome === 'unexpected' || r.outcome === 'flaky');
  if (failed.length > 0) {
    const error = errorLine(failed[0].attempts.at(-1));
    return { verdict: 'failed', detail: error || `ended as ${failed[0].attempts.at(-1)?.status}` };
  }
  if (own.every((r) => r.outcome === 'skipped')) return { verdict: 'skipped', detail: '' };
  if (own.some((r) => r.expectedStatus === 'failed')) {
    return { verdict: 'known-gap', detail: 'armed expected failure, still failing' };
  }
  return { verdict: 'passed', detail: '' };
}

/**
 * Run the runnable cases of a selection in one Playwright process (zero retries) and classify every
 * case. Returns `{ results, records }`; `runRoot` is where Playwright runs (it has node_modules).
 */
export function runPublished(selected, { scanRoot, runRoot, project, config, run = runLane }) {
  const runnable = selected.filter((s) => s.tests.length > 0 && !s.quarantined);
  let records = [];
  if (runnable.length > 0) {
    const runFiles = [
      ...new Set(
        runnable.flatMap((s) =>
          s.tests.map((t) => relative(runRoot, join(scanRoot, t.file)).replace(/\\/g, '/')),
        ),
      ),
    ].sort();
    const lane = run(runRoot, laneArgs(runnable, { project, config, runFiles }), GATE_ENV);
    if (retriedRecords(lane.records).length > 0) {
      throw new Error('a case was retried although QA_RETRIES=0; gate lanes run without retries');
    }
    records = lane.records.filter((r) => r.project === project);
    if (records.length === 0 && lane.exitCode !== 0) {
      throw new Error(
        `Playwright produced no results (exit ${lane.exitCode}).\n${lane.stderr || lane.stdout}`,
      );
    }
  }
  return { results: selected.map((s) => ({ ...s, ...classifyCase(s, records) })), records };
}

// ---------------------------------------------------------------------------------------------
// Command line

async function changedByPack(packs, root) {
  const changed = new Map();
  for (const pack of packs) {
    const file = digestPath(pack, root);
    if (!existsSync(file)) {
      throw new Error(`--changed-from-digest: no tracked digest for "${pack}" at ${file}.`);
    }
    const { source } = resolveSpecSource({ service: pack }, root);
    const current = computeDigest(await loadModel(source));
    const keys = changedOperations(JSON.parse(readFileSync(file, 'utf8')), current);
    changed.set(pack, new Set(keys));
  }
  return changed;
}

function printResults(results) {
  console.log(
    formatTable(results, [
      ['Verdict', (r) => r.verdict ?? 'selected'],
      ['Case', (r) => r.id],
      ['Test', (r) => (r.tests[0] ? `${r.tests[0].file}:${r.tests[0].line}` : '-')],
      ['Detail', (r) => r.detail ?? ''],
    ]),
  );
}

async function main(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: {
      'changed-from-digest': { type: 'boolean', default: false },
      pack: { type: 'string' },
      project: { type: 'string', default: 'api' },
      list: { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
      root: { type: 'string' },
      config: { type: 'string' },
    },
  });
  const scanRoot = values.root ? resolve(values.root) : REPO_ROOT;
  const { registries, corpusByPack } = loadInputs(scanRoot, values.pack ?? null);
  for (const registry of registries) {
    for (const p of registry.problems) {
      console.error(`published-lane: warning: ${p.file}:${p.line}: ${p.message}`);
    }
  }
  const packs = [...corpusByPack.keys()];
  const changed = values['changed-from-digest'] ? await changedByPack(packs, scanRoot) : null;
  if (changed) {
    for (const [pack, keys] of changed) {
      console.log(
        `published-lane: ${pack}: ${keys.size} changed operation(s)${keys.size ? `: ${[...keys].join(', ')}` : ''}`,
      );
    }
  }
  const selected = selectPublished(registries, corpusByPack, changed);
  if (selected.length === 0) {
    const why =
      registries.length === 0
        ? 'no test-case registries found'
        : changed
          ? 'no published case covers a changed operation'
          : 'no registry case has status published';
    if (values.json) console.log(JSON.stringify({ cases: [], reason: why }, null, 2));
    else console.log(`published-lane: ${why}; nothing to run.`);
    return 0;
  }
  if (values.list) {
    if (values.json) console.log(JSON.stringify({ cases: selected }, null, 2));
    else printResults(selected);
    return 0;
  }

  assertZeroRetries();
  const { results } = runPublished(selected, {
    scanRoot,
    runRoot: REPO_ROOT,
    project: values.project,
    config: values.config,
  });
  const problems = results.filter((r) => PROBLEM_VERDICTS.has(r.verdict));
  if (values.json) console.log(JSON.stringify({ cases: results }, null, 2));
  else {
    console.log(`published-lane: ${results.length} published case(s), one run, zero retries`);
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
      console.error(`published-lane: ${error.message}`);
      process.exit(2);
    },
  );
}
