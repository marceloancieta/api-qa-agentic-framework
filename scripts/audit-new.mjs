#!/usr/bin/env node
/**
 * Fails when the lockfile brings in an advisory its base does not have (GATE-32). `release:check`
 * audits a release, but a pull request can take a package back to a vulnerable release and stay
 * green until then, as an `allure` update did with `dompurify` (CI-19). A plain `npm audit` on pull
 * requests would fail them for every advisory published that day, so this one compares: both
 * lockfiles are audited now, against the same advisories, and only the difference counts.
 * `.github/workflows/audit.yml` runs it on pull requests that change the lockfile.
 *
 *   node scripts/audit-new.mjs --base <commit>
 *
 * Exit codes: 0 no new advisory at the audit level; 1 at least one, each printed; 2 the comparison
 * could not run (no `--base`, the base has no lockfile, the registry could not be asked), because
 * an audit that did not run must not pass.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { advisoriesOf, AUDIT_HINT, AUDIT_LEVEL, newAdvisories } from './lib/audit.mjs';
import { REPO_ROOT } from './lib/cli.mjs';
import { gitEnv } from './lib/git.mjs';
import { describeExit, spawnFailure } from './lib/spawn.mjs';

/** The files an audit of the lockfile reads; the first of them holds the `overrides`. */
export const AUDIT_FILES = ['package.json', 'package-lock.json'];

export const AUDIT_ARGS = ['audit', '--package-lock-only', '--json'];

/** A commit, branch or tag; never an option, which `git show` would read as one. */
const REVISION = /^[\w][\w./-]*$/;

const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

/** The advisories at the audit level of the lockfile in `dir`. Throws if the audit did not run. */
function auditOf(dir, spawn) {
  // npm is npm.cmd on Windows, which only a shell runs; the arguments are fixed above.
  const result = spawn('npm', AUDIT_ARGS, {
    cwd: dir,
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
    shell: process.platform === 'win32',
  });
  // `npm audit` exits 1 when it finds anything, so the exit says nothing about whether it ran.
  if (spawnFailure(result)) throw new Error(`npm audit ${describeExit(result)}`);
  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    throw new Error(`npm audit (${describeExit(result)}) did not print a report`);
  }
  return advisoriesOf(report, AUDIT_LEVEL);
}

/** Copy the audited files of `revision` into `dir`. Throws when one is not in that commit. */
function checkOut(revision, dir, root, spawn) {
  for (const file of AUDIT_FILES) {
    const result = spawn('git', ['show', `${revision}:${file}`], {
      cwd: root,
      encoding: 'utf8',
      env: gitEnv(),
      maxBuffer: MAX_OUTPUT_BYTES,
    });
    if (spawnFailure(result) || result.status !== 0) {
      throw new Error(`git show ${revision}:${file} failed (${describeExit(result)})`);
    }
    writeFileSync(join(dir, file), result.stdout);
  }
}

/** The whole check, as an exit code. */
export function auditNew({ base, root = REPO_ROOT, spawn = spawnSync, out = console } = {}) {
  if (!base || !REVISION.test(base)) {
    out.error('audit-new: name the commit to compare with: --base <commit>');
    return 2;
  }
  const dir = mkdtempSync(join(tmpdir(), 'audit-new-'));
  try {
    checkOut(base, dir, root, spawn);
    const found = newAdvisories(auditOf(dir, spawn), auditOf(root, spawn));
    if (found.length === 0) {
      out.log(`audit-new: no new ${AUDIT_LEVEL} or critical advisory against ${base}`);
      return 0;
    }
    for (const { name, severity, title, url } of found) {
      out.error(`audit-new: ${severity} ${name}: ${title} (${url})`);
    }
    out.error(`audit-new: ${found.length} new against ${base}: ${AUDIT_HINT}`);
    return 1;
  } catch (error) {
    out.error(`audit-new: ${error.message}; the comparison did not run`);
    return 2;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const { values } = parseArgs({ options: { base: { type: 'string' } } });
    process.exit(auditNew({ base: values.base }));
  } catch (error) {
    console.error(`audit-new: ${error.message}`);
    process.exit(2);
  }
}
