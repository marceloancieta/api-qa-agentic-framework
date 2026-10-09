import { defineConfig, type ReporterDescription } from '@playwright/test';
import { loadLocalEnvFile, loadRuntime } from './helpers/config';

loadLocalEnvFile();
const qa = loadRuntime();

// `--list` reports every collected case through the reporters without running setup, so a results
// reporter would leave one empty "skipped" result per case on top of the last real run. Listing
// only needs the console.
const isListing = process.argv.includes('--list');

// Extra machine-readable reports are added through variables, never `--reporter` (which replaces
// the configured reporters and silently drops the evidence; global-setup refuses that case).
const extraReporters: ReporterDescription[] = [
  ...(process.env.QA_JSON_REPORT
    ? [['json', { outputFile: process.env.QA_JSON_REPORT }] as ReporterDescription]
    : []),
  ...(process.env.QA_JUNIT_REPORT
    ? [['junit', { outputFile: process.env.QA_JUNIT_REPORT }] as ReporterDescription]
    : []),
];

// Git worktrees nested under this checkout (parallel agent work) hold their own copies of the tests.
// Anchored to this config's directory, so a checkout that is itself such a worktree keeps its tests.
const escapedRoot = __dirname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\\|\//g, '[\\\\/]');
const worktreesOfThisCheckout = new RegExp(
  `^${escapedRoot}[\\\\/]\\.claude[\\\\/]worktrees[\\\\/]`,
);

// Retries hide flakiness, so they are off unless a lane opts in. Gate lanes never set QA_RETRIES.
function retries(): number {
  const raw = process.env.QA_RETRIES ?? '0';
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`QA_RETRIES must be a non-negative integer, got "${raw}".`);
  }
  return value;
}

export default defineConfig({
  globalSetup: './fixtures/global-setup.ts',
  globalTeardown: './fixtures/global-teardown.ts',
  // Files run in parallel; cases inside a file run in order in one worker. Unlike a serial describe,
  // a failure does not abandon the cases after it, so every case keeps its own verdict.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: retries(),
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: isListing
    ? [['list']]
    : [
        ['list'],
        ['html', { open: 'never' }],
        ['allure-playwright', { resultsDir: 'allure-results' }],
        ...extraReporters,
      ],
  use: {
    baseURL: `${qa.baseUrl}/`,
    trace: 'retain-on-failure',
  },
  projects: [
    // Unit tests of the core and the packs: no network, part of `npm run gates`.
    {
      name: 'unit',
      testDir: '.',
      testMatch: '**/__tests__/**/*.spec.ts',
      // Worktrees of this checkout, not this checkout's own path when it is itself a worktree.
      testIgnore: worktreesOfThisCheckout,
    },
    { name: 'preflight', testDir: './fixtures', testMatch: 'preflight.setup.ts' },
    {
      name: 'api',
      testDir: './services',
      testMatch: '**/specs/**/*.spec.ts',
      dependencies: ['preflight'],
    },
  ],
});
