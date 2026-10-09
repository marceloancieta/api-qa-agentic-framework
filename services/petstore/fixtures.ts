// Petstore fixtures: the core `test` plus this pack's clients, either bound to the default
// credential (`pets`, `store`) or to any named actor (`actor('user')`). Specs import from here.

import type { APIRequestContext } from '@playwright/test';
import { test as core, expect } from '../../fixtures';
import type { AuthStrategy } from '../../helpers/auth';
import { PetClient } from './clients/pet-client';
import { StoreClient } from './clients/store-client';

export function clientsFor(request: APIRequestContext, auth: AuthStrategy) {
  return { pets: new PetClient(request, auth), store: new StoreClient(request, auth) };
}

export type PetstoreClients = ReturnType<typeof clientsFor>;
export type Actor = PetstoreClients & { name: string };

interface PetstoreFixtures {
  pets: PetClient;
  store: StoreClient;
  /** The pack's clients bound to a named credential: `default`, `anonymous` or one of `api.actors`. */
  actor: (name: string) => Promise<Actor>;
}

export const test = core.extend<PetstoreFixtures>({
  pets: async ({ request, auth }, use) => {
    await use(new PetClient(request, auth));
  },
  store: async ({ request, auth }, use) => {
    await use(new StoreClient(request, auth));
  },
  actor: async ({ actorSession }, use) => {
    await use(async (name) => {
      const session = await actorSession(name);
      return { name, ...clientsFor(session.request, session.auth) };
    });
  },
});

export { expect };
