// A self-contained Playwright project for the flake-lane end-to-end test: no API, no global setup and
// no run lock, so it can run while other lanes run. Output goes to the system temporary directory.
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from '@playwright/test';

const report = process.env.QA_JSON_REPORT;

export default defineConfig({
  testDir: './specs',
  outputDir: join(tmpdir(), 'qa-fixture-flake-lane'),
  retries: Number(process.env.QA_RETRIES ?? '0'),
  workers: 1,
  reporter: report ? [['line'], ['json', { outputFile: report }]] : [['line']],
  projects: [{ name: 'offline' }],
});
