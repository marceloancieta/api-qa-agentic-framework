// Preflight: runs once before each pack's API project (a Playwright setup project, one per pack) and
// stops that pack's run with one readable failure when it cannot work, instead of every case failing
// on its own timeout. The pack comes from the project's metadata; a pack the active environment does
// not configure fails here with loadRuntime's message. Skip it with `--no-deps` when the cause is
// known and the cases should run anyway.

import { test as setup } from '@playwright/test';
import {
  DEFAULT_ACTOR,
  loadRuntime,
  missingEnvVars,
  packVariable,
  requiredEnvVars,
  type QaRuntime,
} from '../helpers/config';
import { projectPack } from './index';

const REACHABILITY_TIMEOUT_MS = 5_000;

function packRuntime(): QaRuntime {
  return loadRuntime(projectPack(setup.info().project));
}

setup('required environment variables are set', () => {
  const qa = packRuntime();
  const credentials = { [DEFAULT_ACTOR]: qa.auth, ...qa.actors };
  // Each missing name with the actors that need it. Names only: values never leave the process.
  const missing = new Map<string, string[]>();
  for (const [actor, auth] of Object.entries(credentials)) {
    for (const name of missingEnvVars(requiredEnvVars(auth))) {
      missing.set(name, [...(missing.get(name) ?? []), actor]);
    }
  }
  if (missing.size > 0) {
    const listed = [...missing].map(([name, actors]) => `${name} (${actors.join(', ')})`);
    throw new Error(
      `Missing environment variables for pack "${qa.pack}": ${listed.join(', ')}. They are named ` +
        `in ${qa.source} at api.environments.${qa.environment}.packs.${qa.pack} (auth, actors). ` +
        'Set them in the shell, the CI secret store or the local env file.',
    );
  }
});

setup('the API host is reachable', async ({ request }) => {
  const qa = packRuntime();
  try {
    // Any HTTP answer, even an error status, proves the host is there.
    await request.get(qa.baseUrl, { timeout: REACHABILITY_TIMEOUT_MS, maxRedirects: 0 });
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message.split('\n')[0] : String(cause);
    throw new Error(
      `${qa.baseUrl} (pack "${qa.pack}", environment "${qa.environment}") is not reachable: ` +
        `${reason}. Start the service or fix the network path, set ` +
        `${packVariable(qa.pack, 'BASE_URL')} for a one-off URL, or pick another environment ` +
        `with QA_ENV. No case of pack "${qa.pack}" was run.`,
      { cause },
    );
  }
});
