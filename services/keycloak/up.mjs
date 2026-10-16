#!/usr/bin/env node
// Starts the local Keycloak (`npm run keycloak:up`). At start it imports realm/qa-realm.json and
// fills the client secrets from the container's environment, which compose passes through from
// this process: a secret that is not set would import a client nobody can authenticate as, so the
// variables are checked first and a missing one is named, never printed.

import { spawnSync } from 'node:child_process';
import { REPO_ROOT } from '../../scripts/lib/cli.mjs';
import { loadLocalEnv } from '../../scripts/lib/env.mjs';
import { missingVariableMessage } from '../../scripts/lib/env-names.mjs';
import { describeExit, exitCodeOf } from '../../scripts/lib/spawn.mjs';

/** The variables the realm reads: a client id and a secret per service-account client. */
const CLIENT_VARIABLES = ['ADMIN', 'VIEWER', 'NO_ROLE'].flatMap((client) => [
  `KEYCLOAK_${client}_CLIENT_ID`,
  `KEYCLOAK_${client}_CLIENT_SECRET`,
]);

loadLocalEnv();
const missing = CLIENT_VARIABLES.filter((name) => !process.env[name]);
if (missing.length > 0) {
  for (const name of missing) console.error(missingVariableMessage('The Keycloak realm', name));
  console.error('Set them in the local env file (template: .env.example), then run this again.');
  process.exit(1);
}

const up = spawnSync('docker', ['compose', 'up', '-d', '--wait', 'keycloak'], {
  cwd: REPO_ROOT,
  stdio: 'inherit',
});
if (exitCodeOf(up) !== 0) {
  console.error(`docker compose up keycloak: ${describeExit(up)}`);
  process.exit(1);
}
