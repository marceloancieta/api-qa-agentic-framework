// The repository's own configuration, pointed at offline specs: its first `api-<pack>` project keeps
// the `grep` and `grepInvert` it computes from the environment, and nothing else of the pack (no
// preflight, no base URL, no global setup, no run lock, no results reporters). What this project
// lists or runs is what an `api-<pack>` project of the real configuration selects. Output goes to
// the system temporary directory.
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, type ReporterDescription } from '@playwright/test';
import repository from '../../../playwright.config';

const api = repository.projects?.find((project) => project.name?.startsWith('api-'));
if (!api) throw new Error('playwright.config.ts defines no api-<pack> project');

const report = process.env.QA_JSON_REPORT;
const reporter: ReporterDescription[] = report
  ? [['line'], ['json', { outputFile: report }]]
  : [['line']];

export default defineConfig({
  testDir: './specs',
  outputDir: join(tmpdir(), 'qa-fixture-quarantine'),
  retries: Number(process.env.QA_RETRIES ?? '0'),
  workers: 1,
  reporter,
  grep: repository.grep,
  grepInvert: repository.grepInvert,
  projects: [{ name: 'api-fixture', grep: api.grep, grepInvert: api.grepInvert }],
});
