// Preflight: runs once before the API projects (a Playwright setup project) and stops the run with
// one readable failure when the API cannot work, instead of every case failing on its own timeout.
// Skip it with `--no-deps` when the cause is known and the cases should run anyway.

import { test as setup } from '@playwright/test';
import { loadRuntime, missingEnvVars, requiredEnvVars } from '../helpers/config';

const REACHABILITY_TIMEOUT_MS = 5_000;

setup('required environment variables are set', () => {
  const qa = loadRuntime();
  const missing = missingEnvVars(requiredEnvVars(qa.auth));
  if (missing.length > 0) {
    throw new Error(
      `Missing environment variables: ${missing.join(', ')} (needed by api.auth "${qa.auth.type}" ` +
        `in ${qa.source}). Set them in the shell, the CI secret store or the local env file.`,
    );
  }
});

setup('the API host is reachable', async ({ request }) => {
  const qa = loadRuntime();
  try {
    // Any HTTP answer, even an error status, proves the host is there.
    await request.get(qa.baseUrl, { timeout: REACHABILITY_TIMEOUT_MS, maxRedirects: 0 });
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message.split('\n')[0] : String(cause);
    throw new Error(
      `${qa.baseUrl} (environment "${qa.environment}") is not reachable: ${reason}. ` +
        'Start the service or fix the network path, or pick another environment with QA_ENV. ' +
        'No API case was run.',
      { cause },
    );
  }
});
