// Running a Playwright lane from a script and reading what happened. The lane gets its JSON report
// through QA_JSON_REPORT (never `--reporter`, which would replace the evidence reporters), and the
// report is flattened into one record per test and attempt.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { join } from 'node:path';

// Resolved like an import, so it is found from a git worktree that has no node_modules of its own.
const CLI = createRequire(import.meta.url).resolve('@playwright/test/cli');

/**
 * One record per test: `{ title, titlePath, file, line, project, tags, annotations, expectedStatus,
 * outcome, attempts: [{ status, retry, durationMs, errors }] }`. `outcome` is Playwright's verdict:
 * expected, unexpected, flaky or skipped.
 */
export function flattenReport(report) {
  const records = [];
  const walk = (suite, path) => {
    const titlePath = suite.title ? [...path, suite.title] : path;
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        records.push({
          title: spec.title,
          titlePath: [...titlePath, spec.title],
          file: spec.file,
          line: spec.line,
          project: test.projectName,
          tags: spec.tags ?? [],
          annotations: test.annotations ?? [],
          expectedStatus: test.expectedStatus,
          outcome: test.status,
          attempts: (test.results ?? []).map((result) => ({
            status: result.status,
            retry: result.retry,
            durationMs: result.duration,
            errors: (result.errors ?? []).map((error) => error.message ?? String(error)),
          })),
        });
      }
    }
    for (const child of suite.suites ?? []) walk(child, titlePath);
  };
  // The top-level suites are files; their titles are file paths, kept out of the title path.
  for (const file of report.suites ?? []) {
    for (const spec of file.specs ?? []) walk({ specs: [spec] }, []);
    for (const child of file.suites ?? []) walk(child, []);
  }
  return records;
}

/**
 * Run `playwright test <args>` in `root` and return `{ exitCode, records, stdout, stderr }`.
 * `env` is added to the current environment.
 */
export function runLane(root, args, env = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'lane-'));
  const reportFile = join(dir, 'report.json');
  try {
    const run = spawnSync(process.execPath, [CLI, 'test', ...args], {
      cwd: root,
      env: { ...process.env, ...env, QA_JSON_REPORT: reportFile },
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    let records = [];
    try {
      records = flattenReport(JSON.parse(readFileSync(reportFile, 'utf8')));
    } catch {
      // No report: the run failed before any test (config error, refused lock). stderr says why.
    }
    return { exitCode: run.status ?? 1, records, stdout: run.stdout, stderr: run.stderr };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
