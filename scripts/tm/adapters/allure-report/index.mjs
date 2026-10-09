// The `allure-report` adapter (the default provider): a static HTML report generated with Allure 3
// from the results directory. The report keeps no case definitions, so publishing is skipped, and a
// "run" is one generated report.
//
// Options (qa-config test_management.options):
//   resultsDir   Allure results to read      (default allure-results)
//   outputDir    where the report is written (default reports/allure-report)
//
// Read-back (L-04): after generating, the report's own summary and per-test statuses are read and
// compared with the results it was generated from: the totals must match, and every reported case
// must appear in the report with its status.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { lastAttempts, readResultFiles } from '../../../lib/results.mjs';

// The package does not export its CLI file, so it is located next to the package's main entry.
const CLI = join(dirname(dirname(createRequire(import.meta.url).resolve('allure'))), 'cli.js');

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

export function createAdapter(options = {}, { root = process.cwd() } = {}) {
  const resultsDir = resolve(root, options.resultsDir ?? 'allure-results');
  const outputDir = resolve(root, options.outputDir ?? join('reports', 'allure-report'));
  const runs = new Map();

  // What the report shows: { total, byName: { name: status } }, or null when there is no report.
  const readReport = () => {
    const summaryFile = join(outputDir, 'summary.json');
    if (!existsSync(summaryFile)) return null;
    const byId = readJson(join(outputDir, 'test-results.json')).byId ?? {};
    return {
      total: readJson(summaryFile).stats?.total ?? 0,
      byName: Object.fromEntries(Object.values(byId).map((test) => [test.name, test.status])),
    };
  };

  // The source results, one per test (last attempt), so the report can be checked against them.
  const sourceTests = () => {
    const { byKey } = lastAttempts(readResultFiles(resultsDir), (r) => r.historyId ?? r.testCaseId ?? r.name);
    return [...byKey.values()].map(({ result }) => result);
  };

  return {
    name: 'allure-report',
    capabilities: { definitions: false, runs: true },

    async publishDefinitions() {
      return { published: [], unchanged: [] };
    },

    async startRun({ name, runId }) {
      const id = runId ?? name ?? 'report';
      runs.set(id, { name: name ?? id, closed: false });
      return { id, url: pathToFileURL(join(outputDir, 'index.html')).href };
    },

    async reportResults(run, results) {
      const state = runs.get(run.id);
      if (!state) throw new Error(`Run ${run.id} was not started.`);
      if (state.closed) throw new Error(`Run ${run.id} is closed; start a new run to report.`);
      const generate = spawnSync(
        process.execPath,
        [CLI, 'generate', resultsDir, '--output', outputDir, '--report-name', state.name],
        { encoding: 'utf8', cwd: root },
      );
      if (generate.status !== 0) {
        throw new Error(`allure generate failed (${generate.status}): ${(generate.stderr || generate.stdout).trim().slice(0, 500)}`);
      }
      const source = sourceTests();
      const report = readReport();
      if (!report) throw new Error(`allure generate wrote no summary to ${outputDir}.`);
      if (report.total !== source.length) {
        throw new Error(`Read-back: the report lists ${report.total} tests, the results directory has ${source.length}.`);
      }
      const byIdentity = new Map(source.map((r) => [r.testCaseId, r]));
      const reported = [];
      const skipped = [];
      for (const result of results) {
        const origin = byIdentity.get(result.identity);
        if (!origin) {
          skipped.push({ identity: result.identity, reason: `not in ${resultsDir}` });
          continue;
        }
        const shown = report.byName[origin.name];
        if (shown !== origin.status) {
          throw new Error(`Read-back: ${result.identity} is "${shown}" in the report, "${origin.status}" in the results.`);
        }
        reported.push(result.identity);
      }
      return { reported, skipped };
    },

    async readRun() {
      const report = readReport();
      if (!report) return null;
      const results = {};
      for (const origin of sourceTests()) {
        if (origin.testCaseId && origin.name in report.byName) {
          results[origin.testCaseId] = { status: report.byName[origin.name] };
        }
      }
      return { total: report.total, results };
    },

    async closeRun(run) {
      const state = runs.get(run.id);
      if (!state) throw new Error(`Run ${run.id} was not started.`);
      const alreadyClosed = state.closed;
      state.closed = true;
      return { closed: true, alreadyClosed };
    },
  };
}
