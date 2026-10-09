// Fixture: writes on shared data outside a resource guard (shared-fixture-mutation).

import { test, expect } from '../fixtures';
import { requireData } from '../../../helpers/data-gate';
import { withResourceGuard } from '../../../helpers/resource-guard';
import { aPet } from '../builders/pet-builder';
import { SHARED_ORDER_ID } from '../seeds';
import { seedPet } from '../guards';

const SEED_PET_ID = 1;
const KNOWN_PET = 7;
const STATUS = 'sold';

test('writes on seed data without a guard', async ({ pets, store, request }) => {
  await pets.remove(SEED_PET_ID); // expect-finding: shared-fixture-mutation
  await pets.update({ id: KNOWN_PET, name: 'Rex' }); // expect-finding: shared-fixture-mutation
  await store.deleteOrder(SHARED_ORDER_ID); // expect-finding: shared-fixture-mutation
  await pets.remove(3); // expect-finding: shared-fixture-mutation
  await request.delete('/pet/5'); // expect-finding: shared-fixture-mutation
  await request.put(`/pet/${SEED_PET_ID}`, { data: {} }); // expect-finding: shared-fixture-mutation
});

test('a value read from a seed is still shared', async ({ pets }) => {
  const before = await requireData(`seed pet ${SEED_PET_ID}`, async () => null);
  const changed = { ...before, status: STATUS };
  await pets.update(changed); // expect-finding: shared-fixture-mutation
  await pets.updateWithForm({ ...before }, 'Rex'); // expect-finding: shared-fixture-mutation
});

// Look-alikes that are correct.

test('the same write inside a guard', async ({ pets }) => {
  await withResourceGuard(seedPet(pets, SEED_PET_ID), { expectChange: true }, async () => {
    expect((await pets.update({ id: SEED_PET_ID, status: STATUS })).status()).toBe(200);
  });
});

test('writes on data the case created', async ({ pets, request, faker }) => {
  const pet = aPet(faker).build();
  const id = pet.id as number;
  try {
    await pets.create(pet);
    await pets.update({ ...pet, status: STATUS });
    await request.post('/pet', { data: pet });
  } finally {
    await pets.remove(id);
  }
});

test('reads on seed data', async ({ pets }) => {
  expect((await pets.getById(SEED_PET_ID)).status()).toBe(200);
  expect((await pets.findByStatus(STATUS)).status()).toBe(200);
});

test('an id from the response', async ({ pets, faker }) => {
  const created = await (await pets.create(aPet(faker).build())).json();
  await pets.remove(created.id);
});
