// A self-contained Playwright project for the published-lane end-to-end test. It mirrors the
// layout the lane scans (services/<pack>/specs and registry) and names the pack's project
// `api-<pack>`, but needs no API, no global setup and no run lock. Output goes to the system
// temporary directory.
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from '@playwright/test';

const report = process.env.QA_JSON_REPORT;

export default defineConfig({
  testDir: './services',
  outputDir: join(tmpdir(), 'qa-fixture-published-lane'),
  retries: Number(process.env.QA_RETRIES ?? '0'),
  workers: 1,
  reporter: report ? [['line'], ['json', { outputFile: report }]] : [['line']],
  projects: [{ name: 'api-shelf', testMatch: 'shelf/specs/**/*.spec.ts' }],
});
