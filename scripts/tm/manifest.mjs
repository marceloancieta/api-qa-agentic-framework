#!/usr/bin/env node
/**
 * The neutral case manifest every test-management adapter reads (ADR 0004): what the cases are and
 * how the latest run went, in one shape that belongs to no tool.
 *
 *   cases     designed cases from the registries, joined with the spec test that automates each one;
 *             a spec test whose title carries a case id but that no registry lists is included too
 *             (source "spec"), so nothing executed goes missing
 *   results   the latest run in allure-results/, one entry per case (retries collapse to the last
 *             attempt), keyed by the stable identity `<service>-<version>-<TC id>`
 *   excluded  results that cannot be attributed to a case, each with its reason (L-05, L-17): a test
 *             without a case id in its title, or one that never started and so carries no identity
 *
 *   node scripts/tm/manifest.mjs [--service x] [--results dir] [--out file] [--json]
 *
 * Writes reports/tm/manifest.json by default and prints a summary.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseCli, readService, REPO_ROOT, servicePacks } from '../lib/cli.mjs';
import { loadCorpus } from '../lib/corpus.mjs';
import { createLogger } from '../lib/log.mjs';
import { loadRegistries } from '../lib/registry.mjs';
import { groupRuns, lastAttempts, readResultFiles } from '../lib/results.mjs';

export const MANIFEST_VERSION = 1;
const IDENTITY = /^[a-z][a-z0-9-]*-[a-z0-9][a-z0-9.-]*-TC-[A-Z][A-Z0-9]*-\d+$/;

const issueKeys = (result) =>
  (result.links ?? []).filter((link) => link.type === 'issue').map((link) => link.name ?? link.url);
const label = (result, name) => (result.labels ?? []).find((l) => l.name === name)?.value ?? null;

/** Designed and automated cases of the given packs, keyed by identity. */
export function collectCases(root, packs) {
  const cases = new Map();
  for (const pack of packs) {
    const service = readService(pack, root);
    const identityOf = (caseId) => `${service.name}-${service.version}-${caseId}`;
    const tests = new Map();
    for (const spec of loadCorpus(root, pack)) {
      for (const test of spec.tests) {
        if (test.caseId && !tests.has(test.caseId)) tests.set(test.caseId, { spec, test });
      }
    }
    for (const registry of loadRegistries(root, pack)) {
      for (const row of registry.cases) {
        const automated = tests.get(row.id);
        cases.set(identityOf(row.id), {
          identity: identityOf(row.id),
          caseId: row.id,
          service: service.name,
          version: service.version,
          pack,
          source: 'registry',
          feature: registry.meta.feature ?? null,
          title: row.title,
          requirement: row.requirement || null,
          technique: row.technique,
          priority: row.priority,
          status: row.status,
          defect: row.defect || null,
          endpoints: registry.meta.endpoints ?? [],
          registry: registry.file,
          spec: automated ? { file: automated.spec.file, line: automated.test.line } : null,
          tags: automated?.test.tags ?? [],
        });
      }
    }
    for (const [caseId, { spec, test }] of tests) {
      if (cases.has(identityOf(caseId))) continue;
      cases.set(identityOf(caseId), {
        identity: identityOf(caseId),
        caseId,
        service: service.name,
        version: service.version,
        pack,
        source: 'spec',
        feature: null,
        title: test.title,
        requirement: null,
        technique: null,
        priority: null,
        status: null,
        defect: null,
        endpoints: [],
        registry: null,
        spec: { file: spec.file, line: test.line },
        tags: test.tags,
      });
    }
  }
  return cases;
}

/** Results of the latest run attributed to cases, and everything that could not be, with reasons. */
// The spec file a result came from: allure-playwright starts `fullName` with its relative path.
const specOf = (result) =>
  String(result.fullName ?? '')
    .split(' ')[0]
    .replace(/\\/g, '/');

/**
 * Results of the latest run of the selected packs' specs, attributed to cases, and everything that
 * could not be, with reasons. Results from elsewhere (the core's unit tests) are not test-management
 * cases: they are counted in `outside`, not listed, and never decide which run is the latest.
 */
export function collectResults(resultsDir, cases, packs) {
  const prefixes = packs.map((pack) => `services/${pack}/specs/`);
  const all = readResultFiles(resultsDir);
  const inPacks = all.filter((result) =>
    prefixes.some((prefix) => specOf(result).startsWith(prefix)),
  );
  const run = groupRuns(inPacks).at(-1) ?? [];
  const { byKey, unkeyed } = lastAttempts(run, (result) =>
    IDENTITY.test(result.testCaseId ?? '') ? result.testCaseId : null,
  );
  const excluded = unkeyed.map((result) => ({
    file: result.file,
    name: result.name ?? '(unnamed)',
    reason: 'no case identity: the title carries no TC id, or the test never started',
  }));
  const results = [];
  for (const [identity, { result, attempts }] of byKey) {
    if (!cases.has(identity)) {
      excluded.push({
        file: result.file,
        name: result.name ?? '(unnamed)',
        reason: `identity ${identity} matches no case of the selected packs`,
      });
      continue;
    }
    results.push({
      identity,
      status: result.status ?? 'unknown',
      name: result.name ?? '',
      start: result.start ?? null,
      stop: result.stop ?? null,
      durationMs: result.start && result.stop ? result.stop - result.start : null,
      attempts,
      issues: issueKeys(result),
      run: label(result, 'run'),
      file: result.file,
    });
  }
  results.sort((a, b) => a.identity.localeCompare(b.identity));
  excluded.sort((a, b) => a.name.localeCompare(b.name) || a.file.localeCompare(b.file));
  return { runSize: run.length, outside: all.length - inPacks.length, results, excluded };
}

export function buildManifest({ root = REPO_ROOT, packs, resultsDir, runId, now = new Date() }) {
  const selected = packs ?? servicePacks(root);
  const cases = collectCases(root, selected);
  const { runSize, outside, results, excluded } = collectResults(
    resultsDir ?? join(root, 'allure-results'),
    cases,
    selected,
  );
  return {
    manifestVersion: MANIFEST_VERSION,
    generatedAt: now.toISOString(),
    runId: runId ?? null,
    packs: selected,
    cases: [...cases.values()].sort((a, b) => a.identity.localeCompare(b.identity)),
    results,
    excluded,
    runSize,
    outside,
  };
}

function main() {
  const values = parseCli({
    results: { type: 'string' },
    out: { type: 'string' },
    json: { type: 'boolean', default: false },
  });
  const log = createLogger('tm-manifest');
  const packs = values.service ? [values.service] : undefined;
  const manifest = buildManifest({
    packs,
    resultsDir: values.results ? resolve(values.results) : undefined,
    runId: log.runId,
  });
  const out = resolve(values.out ?? join(REPO_ROOT, 'reports', 'tm', 'manifest.json'));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`);
  if (values.json) {
    console.log(JSON.stringify(manifest, null, 2));
    return;
  }
  const byStatus = manifest.results.reduce(
    (acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }),
    {},
  );
  log.info('manifest written', {
    file: relative(REPO_ROOT, out).replace(/\\/g, '/'),
    cases: manifest.cases.length,
    results: manifest.results.length,
    excluded: manifest.excluded.length,
    outside: manifest.outside,
    ...byStatus,
  });
  for (const item of manifest.excluded) {
    log.warn('result excluded', { name: item.name, reason: item.reason });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
