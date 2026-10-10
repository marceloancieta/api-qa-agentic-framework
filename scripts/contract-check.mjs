#!/usr/bin/env node
/**
 * The contract check of `npm run gates`, for every service pack: the tracked digest, the generated
 * value sets and the probe matrix must match each pack's contract. The tools default to the only
 * pack when there is one; with several, each check runs once per pack, so adding a pack cannot turn
 * the gate into an error about a missing --service flag.
 *
 *   node scripts/contract-check.mjs [--service <pack>]
 */

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { REPO_ROOT, servicePacks } from './lib/cli.mjs';

const CHECKS = ['swagger-digest.mjs', 'derive-probe-matrix.mjs', 'derive-value-sets.mjs'];

const { values } = parseArgs({ options: { service: { type: 'string' } } });
const packs = values.service ? [values.service] : servicePacks(REPO_ROOT);
if (packs.length === 0) {
  console.log('contract-check: no service packs under services/.');
  process.exit(0);
}
let failed = 0;
for (const pack of packs) {
  for (const script of CHECKS) {
    const run = spawnSync(
      process.execPath,
      [join(REPO_ROOT, 'scripts', script), '--service', pack, '--check'],
      { stdio: 'inherit', cwd: REPO_ROOT },
    );
    if (run.status !== 0) {
      failed += 1;
      console.error(`contract-check: ${script} --service ${pack} failed (exit ${run.status}).`);
    }
  }
}
process.exit(failed === 0 ? 0 : 1);
