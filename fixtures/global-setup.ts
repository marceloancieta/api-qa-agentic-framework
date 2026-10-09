// Global setup: check that this run will produce results, then delete the old ones.
// Order matters. Clearing is destructive, so it happens only after every check has passed: a
// misconfigured run fails with the old results still on disk.

import { rmSync } from 'node:fs';
import { join } from 'node:path';
import type { FullConfig } from '@playwright/test';
import { REPO_ROOT, loadRuntime } from '../helpers/config';
import { rootSeed, SEED_VARIABLE } from '../helpers/rng';

export const RESULTS_DIR = join(REPO_ROOT, 'allure-results');

/**
 * Playwright treats a `--reporter` flag as the full reporter list, discarding the configured one, so
 * such a run can pass while writing no results at all. Extra reporters are added through the
 * QA_JSON_REPORT and QA_JUNIT_REPORT variables instead (see playwright.config.ts).
 */
export function assertResultsReporter(config: FullConfig, provider: string): void {
  if (!provider.startsWith('allure')) return;
  // Resolved reporter entries carry the module path, so match on the package name inside it.
  const reporters = config.reporter.map((entry) => String(entry[0]));
  if (reporters.some((path) => /allure-playwright/.test(path))) return;
  throw new Error(
    `test_management.provider is "${provider}" but the Allure reporter is not active ` +
      `(active: ${reporters.join(', ')}). A --reporter flag replaces the configured reporters; drop it ` +
      'and use QA_JSON_REPORT / QA_JUNIT_REPORT for extra reports.',
  );
}

export default function globalSetup(config: FullConfig): void {
  assertResultsReporter(config, loadRuntime().testManagement);
  rmSync(RESULTS_DIR, { recursive: true, force: true });

  // Fix the root seed before workers start: they inherit this environment, so every worker derives
  // its test seeds from the same root, and the printed value replays the whole run.
  process.env[SEED_VARIABLE] = rootSeed();
  console.log(`[seed] ${SEED_VARIABLE}=${process.env[SEED_VARIABLE]}`);
}
