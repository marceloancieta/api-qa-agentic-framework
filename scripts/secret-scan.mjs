#!/usr/bin/env node
/**
 * Secret scan. `--staged` (the pre-commit gate): gitleaks on the staged changes, then the local
 * denylist scan. `--history`: gitleaks over every commit (release gate, `npm run scan:secrets`).
 *
 * Fails CLOSED when gitleaks is missing: a secret scanner that silently does not run reports the same
 * green as one that found nothing. Install it (https://github.com/gitleaks/gitleaks#installing) or,
 * knowing what you skip, bypass once with `git commit --no-verify`. CI runs the same scan.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

function findGitleaks() {
  const probe = spawnSync('gitleaks', ['version'], { encoding: 'utf8' });
  if (probe.status === 0) return 'gitleaks';
  // winget installs a link here, but a shell started before the install has a stale PATH.
  const winget =
    process.env.LOCALAPPDATA &&
    join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links', 'gitleaks.exe');
  return winget && existsSync(winget) ? winget : null;
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  return result.status ?? 1;
}

const gitleaks = findGitleaks();
if (!gitleaks) {
  console.error(
    'secret-scan: gitleaks is not installed, so the secret scan could NOT run.\n' +
      '  Install: winget install Gitleaks.Gitleaks | brew install gitleaks | see https://github.com/gitleaks/gitleaks\n' +
      '  Bypass once (you skip the scan): git commit --no-verify',
  );
  process.exit(1);
}

const mode = process.argv[2];
if (mode === '--history') {
  process.exit(run(gitleaks, ['git', '--redact', '--no-banner']));
}
if (mode !== '--staged') {
  console.error('usage: secret-scan.mjs --staged | --history');
  process.exit(2);
}

if (
  run(gitleaks, ['git', '--pre-commit', '--staged', '--redact', '--no-banner', '--verbose']) !== 0
) {
  console.error('pre-commit: gitleaks found a potential secret in the staged changes.');
  process.exit(1);
}
process.exit(run(process.execPath, ['scripts/scan-denylist.mjs', '--staged']));
