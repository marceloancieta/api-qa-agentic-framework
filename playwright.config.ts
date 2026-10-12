import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  defineConfig,
  type PlaywrightTestProject,
  type ReporterDescription,
} from '@playwright/test';
import { configuredPacks, loadLocalEnvFile, loadRuntime } from './helpers/config';

loadLocalEnvFile();

// A service pack is a directory under services/ with a service.json, the same rule as the contract
// tools (scripts/lib/cli.mjs servicePacks). Each one gets its own projects, so a new pack runs
// without editing this file.
function servicePacks(): string[] {
  const dir = join(__dirname, 'services');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(dir, entry.name, 'service.json')))
    .map((entry) => entry.name)
    .sort();
}
const configured = new Set(configuredPacks());

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
// Generated output, including the sandbox copy a mutation run leaves behind if it is interrupted.
const reportsOfThisCheckout = new RegExp(`^${escapedRoot}[\\\\/]reports[\\\\/]`);

const DESTRUCTIVE = /@destructive/;
const destructiveLane = process.env.QA_DESTRUCTIVE === '1';

// Retries hide flakiness, so they are off unless a lane opts in. Gate lanes never set QA_RETRIES.
function retries(): number {
  const raw = process.env.QA_RETRIES ?? '0';
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`QA_RETRIES must be a non-negative integer, got "${raw}".`);
  }
  return value;
}

function traceMode(): 'off' | 'on' | 'retain-on-failure' {
  const raw = process.env.QA_TRACE ?? 'retain-on-failure';
  if (raw === 'off' || raw === 'on' || raw === 'retain-on-failure') return raw;
  throw new Error(`QA_TRACE must be off, on or retain-on-failure, got "${raw}".`);
}

// One preflight and one API project per pack. A pack the active environment does not configure
// still gets both, without a base URL: its preflight fails with loadRuntime's message when the pack
// is selected, and Playwright never runs the preflight of a pack that was not selected.
function packProjects(pack: string): PlaywrightTestProject[] {
  const baseURL = configured.has(pack) ? `${loadRuntime(pack).baseUrl}/` : undefined;
  return [
    {
      name: `preflight-${pack}`,
      testDir: './fixtures',
      testMatch: 'preflight.setup.ts',
      metadata: { pack },
    },
    {
      name: `api-${pack}`,
      testDir: `./services/${pack}`,
      testMatch: '**/specs/**/*.spec.ts',
      dependencies: [`preflight-${pack}`],
      metadata: { pack },
      ...(baseURL ? { use: { baseURL } } : {}),
      // A @destructive case breaks the service for every other caller until its recovery runs, so
      // every run leaves it out. The destructive lane (`npm run lanes:destructive`) sets
      // QA_DESTRUCTIVE=1, which selects only those cases, and runs each alone (L-59).
      ...(destructiveLane ? { grep: DESTRUCTIVE } : { grepInvert: DESTRUCTIVE }),
    },
  ];
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
    // Each API project sets its pack's baseURL (packProjects).
    // Traces record request headers unredacted (unlike the clients' evidence, L-42) and the HTML
    // report embeds them; QA_TRACE=off keeps a real credential out of uploaded CI artifacts.
    trace: traceMode(),
  },
  projects: [
    // Unit tests of the core and the packs: no network, part of `npm run gates`.
    {
      name: 'unit',
      testDir: '.',
      testMatch: '**/__tests__/**/*.spec.ts',
      testIgnore: [worktreesOfThisCheckout, reportsOfThisCheckout],
    },
    // `--project=api-<pack>` runs one pack; `--project=api-*` runs every pack.
    ...servicePacks().flatMap(packProjects),
  ],
});
