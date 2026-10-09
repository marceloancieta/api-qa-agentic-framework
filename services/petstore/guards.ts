// Guards for Petstore's shared seed data (pets 1-10 exist in every fresh container). A case that
// modifies one runs inside `withResourceGuard(seedPet(...), ...)` so the next case finds it intact.

import type { GuardedResource } from '../../helpers/resource-guard';
import { changedFields } from '../../helpers/state-compare';
import type { PetClient } from './clients/pet-client';
import { PET_FIELDS } from './state-models';
import type { Pet } from './types';

export function seedPet(pets: PetClient, id: number): GuardedResource<Pet> {
  return {
    label: `seed pet ${id}`,
    capture: async () => {
      const response = await pets.getById(id);
      return response.status() === 200 ? ((await response.json()) as Pet) : null;
    },
    diff: (baseline, current) => changedFields(baseline, current, PET_FIELDS),
    restore: async (baseline) => (await pets.update(baseline)).status(),
  };
}
