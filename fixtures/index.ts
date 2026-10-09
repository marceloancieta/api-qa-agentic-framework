// Core fixtures every service pack builds on. A pack extends this `test` with its own clients
// (see services/<name>/fixtures.ts); the core never imports from a pack.

import { test as base, expect } from '@playwright/test';
import { createAuth, type AuthStrategy } from '../helpers/auth';
import { loadRuntime, type QaRuntime } from '../helpers/config';

export interface CoreWorkerFixtures {
  /** The resolved qa-config for this run: environment, base URL, write permission, auth. */
  qa: QaRuntime;
  /** The configured credential, ready to decorate requests. */
  auth: AuthStrategy;
}

export const test = base.extend<object, CoreWorkerFixtures>({
  qa: [
    // eslint-disable-next-line no-empty-pattern -- Playwright requires the destructuring form.
    async ({}, use) => {
      await use(loadRuntime());
    },
    { scope: 'worker' },
  ],
  auth: [
    async ({ qa }, use) => {
      await use(createAuth(qa.auth));
    },
    { scope: 'worker' },
  ],
});

export { expect };
