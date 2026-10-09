// Petstore fixtures: the core `test` plus one client per resource, bound to the configured auth.
// Specs import `test` and `expect` from here.

import { test as core, expect } from '../../fixtures';
import { PetClient } from './clients/pet-client';
import { StoreClient } from './clients/store-client';

interface PetstoreFixtures {
  pets: PetClient;
  store: StoreClient;
}

export const test = core.extend<PetstoreFixtures>({
  pets: async ({ request, auth }, use) => {
    await use(new PetClient(request, auth));
  },
  store: async ({ request, auth }, use) => {
    await use(new StoreClient(request, auth));
  },
});

export { expect };
