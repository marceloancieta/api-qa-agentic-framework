// Core fixtures every service pack builds on. A pack extends this `test` with its own clients
// (see services/<name>/fixtures.ts); the core never imports from a pack.

import { test as base, expect as baseExpect, type APIRequestContext } from '@playwright/test';
import { Faker, en } from '@faker-js/faker';
import { createAuth, type AuthStrategy } from '../helpers/auth';
import { clockFromEnv, type Clock } from '../helpers/clock';
import { actorAuth, loadRuntime, type QaRuntime } from '../helpers/config';
import { createRng, rootSeed, SEED_VARIABLE, testSeed, type Rng } from '../helpers/rng';
import type { SchemaValidator } from '../helpers/schema';

/** One named credential with its own request context, so cookies never leak between actors. */
export interface ActorSession {
  name: string;
  auth: AuthStrategy;
  request: APIRequestContext;
}

export interface CoreTestFixtures {
  /** Opens (once per name and test) the session for a credential from `api.actors`. */
  actorSession: (name: string) => Promise<ActorSession>;
  /** Seeded generator for this test; its seed is recorded on the test. */
  rng: Rng;
  /** Faker seeded from `rng`, with dates relative to `clock`. */
  faker: Faker;
  /** "Now" for this test: the system clock, or a manual one pinned by QA_CLOCK. */
  clock: Clock;
}

export interface CoreWorkerFixtures {
  /** The resolved qa-config for this run: environment, base URL, write permission, auth. */
  qa: QaRuntime;
  /** The default credential (`api.auth`), ready to decorate requests. */
  auth: AuthStrategy;
}

export const test = base.extend<CoreTestFixtures, CoreWorkerFixtures>({
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

  actorSession: async ({ qa, playwright, baseURL, extraHTTPHeaders, ignoreHTTPSErrors }, use) => {
    const sessions = new Map<string, Promise<ActorSession>>();
    const open = async (name: string): Promise<ActorSession> => {
      const auth = createAuth(actorAuth(qa, name));
      const request = await playwright.request.newContext({
        baseURL,
        extraHTTPHeaders,
        ignoreHTTPSErrors,
      });
      return { name, auth, request };
    };
    await use((name) => {
      let session = sessions.get(name);
      if (!session) {
        session = open(name);
        sessions.set(name, session);
      }
      return session;
    });
    const opened = await Promise.allSettled(sessions.values());
    for (const result of opened) {
      if (result.status === 'fulfilled') await result.value.request.dispose();
    }
  },

  // eslint-disable-next-line no-empty-pattern -- Playwright requires the destructuring form.
  rng: async ({}, use, testInfo) => {
    const root = rootSeed();
    const rng = createRng(testSeed(root, testInfo.titlePath));
    testInfo.annotations.push({ type: 'seed', description: `${SEED_VARIABLE}=${root}` });
    await use(rng);
    if (testInfo.status !== testInfo.expectedStatus) {
      console.log(
        `[seed] "${testInfo.title}" failed; replay its data with ${SEED_VARIABLE}=${root}.`,
      );
    }
  },

  // eslint-disable-next-line no-empty-pattern -- Playwright requires the destructuring form.
  clock: async ({}, use) => {
    await use(clockFromEnv());
  },

  faker: async ({ rng, clock }, use) => {
    const faker = new Faker({ locale: [en] });
    faker.seed(rng.int(0, 2 ** 31 - 1));
    faker.setDefaultRefDate(() => clock.now());
    await use(faker);
  },
});

export const expect = baseExpect.extend({
  /** `expect(body).toMatchSchema(contract, 'Pet')`: every mismatch is listed in the failure. */
  toMatchSchema(received: unknown, validator: SchemaValidator, name: string) {
    const problems = validator.validate(name, received);
    const pass = problems.length === 0;
    return {
      pass,
      name: 'toMatchSchema',
      message: () =>
        pass
          ? `expected the value not to match schema "${name}"`
          : `value does not match schema "${name}" (${validator.format}):\n  ${problems.join('\n  ')}`,
    };
  },
});
