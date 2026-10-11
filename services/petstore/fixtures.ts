// Petstore fixtures: the core `test` plus this pack's manifest, contract and clients, either bound to
// the default credential (`pets`, `store`, `users`) or to any named actor (`actor('user')`). Every case gets
// its identity and suite labels automatically. Specs import `test` and `expect` from here.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { APIRequestContext } from '@playwright/test';
import { test as core, expect } from '../../fixtures';
import type { AuthStrategy } from '../../helpers/auth';
import { applyCaseMeta } from '../../helpers/case-meta';
import { loadEnvelopeCatalog, type EnvelopeCatalog } from '../../helpers/error-envelope';
import type { RedactionPolicy } from '../../helpers/redact';
import { createSchemaValidator, type SchemaValidator } from '../../helpers/schema';
import { loadService, type ServicePack } from '../../helpers/service';
import { PetClient } from './clients/pet-client';
import { StoreClient } from './clients/store-client';
import { UserClient } from './clients/user-client';

export function clientsFor(request: APIRequestContext, auth: AuthStrategy, service: ServicePack) {
  const redaction: RedactionPolicy = {
    identityFields: service.identity_fields,
    secretKeys: service.secret_keys,
  };
  return {
    pets: new PetClient(request, auth, redaction),
    store: new StoreClient(request, auth, redaction),
    users: new UserClient(request, auth, redaction),
  };
}

export type PetstoreClients = ReturnType<typeof clientsFor>;
export type Actor = PetstoreClients & { name: string };

interface PetstoreFixtures {
  pets: PetClient;
  store: StoreClient;
  users: UserClient;
  /** The pack's clients bound to a named credential: `default`, `anonymous` or one of `api.actors`. */
  actor: (name: string) => Promise<Actor>;
  caseMeta: void;
}

interface PetstoreWorkerFixtures {
  /** The pack manifest (service.json), read when the first case needs it, not at import. */
  service: ServicePack;
  /** Validator for the schemas of the pack's OpenAPI document. */
  contract: SchemaValidator;
  /** The pack's error envelopes (error-envelopes.json). */
  envelopes: EnvelopeCatalog;
}

export const test = core.extend<PetstoreFixtures, PetstoreWorkerFixtures>({
  service: [
    // eslint-disable-next-line no-empty-pattern -- Playwright requires the destructuring form.
    async ({}, use) => {
      await use(loadService(__dirname));
    },
    { scope: 'worker' },
  ],
  contract: [
    async ({ service }, use) => {
      const file = join(service.dir, service.spec ?? 'openapi.json');
      await use(createSchemaValidator(JSON.parse(readFileSync(file, 'utf8'))));
    },
    { scope: 'worker' },
  ],
  envelopes: [
    async ({ service }, use) => {
      await use(loadEnvelopeCatalog(join(service.dir, 'error-envelopes.json')));
    },
    { scope: 'worker' },
  ],
  caseMeta: [
    async ({ service }, use, testInfo) => {
      await applyCaseMeta(service, testInfo);
      await use();
    },
    { auto: true },
  ],
  pets: async ({ request, auth, service }, use) => {
    await use(clientsFor(request, auth, service).pets);
  },
  store: async ({ request, auth, service }, use) => {
    await use(clientsFor(request, auth, service).store);
  },
  users: async ({ request, auth, service }, use) => {
    await use(clientsFor(request, auth, service).users);
  },
  actor: async ({ actorSession, service }, use) => {
    await use(async (name) => {
      const session = await actorSession(name);
      return { name, ...clientsFor(session.request, session.auth, service) };
    });
  },
});

export { expect };
