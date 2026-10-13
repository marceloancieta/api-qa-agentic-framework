#!/usr/bin/env node
// Runs the auth strategies against public third-party services (`helpers/__live__/`), on demand:
// `npm run auth:live`. It sets QA_AUTH_LIVE=1, the flag that adds the `auth-live` Playwright
// project, so no other run ever calls those services. Like any Playwright run it clears
// allure-results first, so do not run it between a run and its report.

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { REPO_ROOT } from './lib/cli.mjs';
import { describeExit, exitCodeOf } from './lib/spawn.mjs';

const CLI = createRequire(import.meta.url).resolve('@playwright/test/cli');

const run = spawnSync(
  process.execPath,
  [CLI, 'test', '--project=auth-live', ...process.argv.slice(2)],
  { cwd: REPO_ROOT, env: { ...process.env, QA_AUTH_LIVE: '1' }, stdio: 'inherit' },
);
const code = exitCodeOf(run);
if (code !== 0) console.error(`auth-live: Playwright ${describeExit(run)}`);
process.exit(code);
