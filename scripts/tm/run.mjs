#!/usr/bin/env node
/**
 * Publishing case definitions and reporting a run to the configured test-management tool
 * (ADR 0004), through its adapter. The tool comes from qa-config test_management.provider and its
 * options from test_management.options; credentials are read by the adapter from the environment.
 *
 *   node scripts/tm/run.mjs publish [--service x] [--dry-run]
 *   node scripts/tm/run.mjs report  [--service x] [--results dir] [--name text]
 *
 * publish   sends the definitions of cases whose registry status is automated or published: a
 *           case is published after a reviewed spec proves it (lifecycle in
 *           .claude/rules/registry.md), so drafts, approved and blocked cases stay out; a tool
 *           without definitions skips the phase with a notice
 * report    starts a run, reports the latest results of the packs' specs, and closes the run even
 *           when reporting failed; results that cannot be attributed are listed, never dropped
 *
 * Writes reports/tm/<phase>-<provider>.json with what was done, for the next step to read.
 *
 * Exit codes: 0 the phase finished, or was skipped with a notice (a tool without definitions or
 * runs, no results to report); 1 the phase failed (an adapter error, a failed read-back, a report
 * generator that exited non-zero); 2 a usage error.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT } from '../lib/cli.mjs';
import { loadLocalEnv } from '../lib/env.mjs';
import { createLogger, RUN_ID_VARIABLE } from '../lib/log.mjs';
import { loadAdapter } from './adapters/index.mjs';
import { buildManifest } from './manifest.mjs';

export const PUBLISHABLE = ['automated', 'published'];

/**
 * The tool and its options. `QA_TM_PROVIDER` replaces the configured provider for one run, the way
 * `QA_ENV` replaces the environment: CI reports to a tool whose credentials only it holds without a
 * per-machine qa-config.json. The configured options belong to the configured provider, so they are
 * kept only when the override names the same one; other adapters fall back to their defaults.
 */
export function testManagementConfig(root = REPO_ROOT, env = process.env) {
  const file = ['qa-config.json', 'qa-config.example.json'].find((name) =>
    existsSync(join(root, name)),
  );
  if (!file) throw new Error('No qa-config.json or qa-config.example.json found.');
  const section = JSON.parse(readFileSync(join(root, file), 'utf8')).test_management ?? {};
  const configured = section.provider ?? 'allure-report';
  const provider = env.QA_TM_PROVIDER?.trim() || configured;
  return { provider, options: provider === configured ? (section.options ?? {}) : {} };
}

/** The run id the results were recorded under, when they agree on one. */
export function recordedRunId(manifest) {
  return manifest.recordedRuns?.length === 1 ? manifest.recordedRuns[0] : null;
}

export async function publish({ adapter, manifest, log, dryRun = false }) {
  if (!adapter.capabilities.definitions) {
    log.info(
      'publish skipped: the tool keeps no case definitions; cases appear when results are reported',
      {
        provider: adapter.name,
      },
    );
    return { skipped: true, published: [], unchanged: [], heldBack: [] };
  }
  const ready = manifest.cases.filter((c) => PUBLISHABLE.includes(c.status));
  const heldBack = manifest.cases
    .filter((c) => !PUBLISHABLE.includes(c.status))
    .map((c) => ({
      identity: c.identity,
      reason: c.status ? `status ${c.status}` : 'not in a registry',
    }));
  for (const item of heldBack) log.info('not published', item);
  if (dryRun) {
    log.info('dry run: nothing sent', { wouldPublish: ready.length });
    return {
      skipped: false,
      dryRun: true,
      published: [],
      unchanged: [],
      heldBack,
      wouldPublish: ready.map((c) => c.identity),
    };
  }
  const { published, unchanged } = await adapter.publishDefinitions(ready);
  for (const item of published) log.info('published', item);
  log.info('publish done', {
    provider: adapter.name,
    published: published.length,
    unchanged: unchanged.length,
    heldBack: heldBack.length,
  });
  return { skipped: false, published, unchanged, heldBack };
}

export async function report({ adapter, manifest, log, name }) {
  for (const item of manifest.excluded) log.warn('result without a case identity', item);
  if (!adapter.capabilities.runs) {
    log.info('report skipped: the tool records no runs', { provider: adapter.name });
    return { skipped: true };
  }
  // Most tools can only record attributed results; a report of the whole results directory
  // (capability wholeRun) still has something to show without them.
  if (manifest.results.length === 0 && !adapter.capabilities.wholeRun) {
    log.warn('no results to report: run the API suite first', {
      excluded: manifest.excluded.length,
    });
    return { skipped: true, reason: 'no results' };
  }
  const run = await adapter.startRun({ name, runId: manifest.runId });
  log.info('run started', { provider: adapter.name, run: run.id, url: run.url });
  let outcome;
  try {
    outcome = await adapter.reportResults(run, manifest.results);
    for (const item of outcome.skipped) log.warn('result skipped by the tool', item);
  } finally {
    const closed = await adapter.closeRun(run);
    log.info('run closed', { run: run.id, alreadyClosed: closed.alreadyClosed });
  }
  log.info('report done', {
    reported: outcome.reported.length,
    skipped: outcome.skipped.length,
    excluded: manifest.excluded.length,
  });
  return { skipped: false, run, ...outcome, excluded: manifest.excluded };
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      service: { type: 'string' },
      results: { type: 'string' },
      name: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
  });
  const phase = positionals[0];
  if (!['publish', 'report'].includes(phase)) {
    console.error(
      'Usage: node scripts/tm/run.mjs <publish|report> [--service x] [--results dir] [--dry-run]',
    );
    process.exit(2);
  }
  const manifest = buildManifest({
    packs: values.service ? [values.service] : undefined,
    resultsDir: values.results ? resolve(values.results) : undefined,
  });
  // Continue the test run's id when this step runs in a separate process (L-48).
  process.env[RUN_ID_VARIABLE] ||= recordedRunId(manifest) ?? '';
  const log = createLogger(`tm-${phase}`);
  manifest.runId = log.runId;
  const { provider, options } = testManagementConfig();
  loadLocalEnv();
  const adapter = await loadAdapter(provider, options, { root: REPO_ROOT, log });
  const outcome =
    phase === 'publish'
      ? await publish({ adapter, manifest, log, dryRun: values['dry-run'] })
      : await report({
          adapter,
          manifest,
          log,
          name: values.name ?? `${manifest.packs.join(', ')} ${log.runId}`,
        });
  const dir = join(REPO_ROOT, 'reports', 'tm');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${phase}-${provider}.json`),
    `${JSON.stringify({ runId: log.runId, provider, ...outcome }, null, 2)}\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
