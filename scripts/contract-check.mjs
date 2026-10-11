#!/usr/bin/env node
/**
 * The contract check of `npm run gates`, for every service pack: the tracked digest, the generated
 * value sets, the probe matrix and the decision tables must match each pack's sources. The tools
 * default to the only pack when there is one; with several, each check runs once per pack, so
 * adding a pack cannot turn the gate into an error about a missing --service flag.
 *
 *   node scripts/contract-check.mjs [--service <pack>]
 *
 * Exit codes: 0 every check passed (or there is no pack); 1 a check failed, was killed by a signal or
 * could not start (L-49: a check without an exit code of its own is a failure, never a pass); 2 the
 * wrapper itself could not run (bad arguments, unreadable services/).
 */

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT, servicePacks } from './lib/cli.mjs';
import { describeExit, exitCodeOf } from './lib/spawn.mjs';

export const CHECKS = [
  'swagger-digest.mjs',
  'derive-probe-matrix.mjs',
  'derive-value-sets.mjs',
  'derive-decision-tables.mjs',
];

/**
 * Run every check for every pack and return the exit code. `spawn` replaces `spawnSync` and `out`
 * replaces the console in tests.
 */
export function contractCheck(packs, { root = REPO_ROOT, spawn = spawnSync, out = console } = {}) {
  if (packs.length === 0) {
    out.log('contract-check: no service packs under services/.');
    return 0;
  }
  let failed = 0;
  for (const pack of packs) {
    for (const script of CHECKS) {
      const run = spawn(
        process.execPath,
        [join(root, 'scripts', script), '--service', pack, '--check'],
        {
          stdio: 'inherit',
          cwd: root,
        },
      );
      if (exitCodeOf(run) !== 0) {
        failed += 1;
        out.error(`contract-check: ${script} --service ${pack} failed (${describeExit(run)}).`);
      }
    }
  }
  return failed === 0 ? 0 : 1;
}

const entryScript = process.argv[1];
if (entryScript && pathToFileURL(entryScript).href === import.meta.url) {
  try {
    const { values } = parseArgs({ options: { service: { type: 'string' } } });
    process.exit(contractCheck(values.service ? [values.service] : servicePacks(REPO_ROOT)));
  } catch (error) {
    console.error(`contract-check: ${error.message}`);
    process.exit(2);
  }
}
