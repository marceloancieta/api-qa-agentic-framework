// Shared seed data: the case changes a pet every container starts with, so it runs inside a guard
// that puts the pet back afterwards, whatever the outcome. The assertion is on the change set: the
// update must change the status and nothing else.

import { test, expect } from '../fixtures';
import { requireData, skipUnless } from '../../../helpers/data-gate';
import { withResourceGuard } from '../../../helpers/resource-guard';
import { expectOnlyChanged } from '../../../helpers/state-compare';
import { seedPet } from '../guards';
import { PET_FIELDS } from '../state-models';
import type { Pet } from '../types';

const SEED_PET_ID = 1;

test.describe('Petstore shared data', () => {
  test('updating a seed pet status changes only the status', async ({ pets, qa }) => {
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);
    const before = await requireData(
      `seed pet ${SEED_PET_ID}`,
      async () => {
        const response = await pets.getById(SEED_PET_ID);
        return response.status() === 200 ? ((await response.json()) as Pet) : null;
      },
      (pet) => (pet.status === 'sold' ? ['its status is already "sold"'] : []),
    );

    await withResourceGuard(seedPet(pets, SEED_PET_ID), { expectChange: true }, async () => {
      expect((await pets.update({ ...before, status: 'sold' })).status()).toBe(200);

      const after = (await (await pets.getById(SEED_PET_ID)).json()) as Pet;
      expectOnlyChanged(before, after, PET_FIELDS, ['status']);
    });
  });
});
