// Smoke: proves the core end to end (config, auth, clients, evidence) against the configured Petstore.

import { test, expect } from '../fixtures';
import { PetMother } from '../builders/mother';
import { skipUnless } from '../../../helpers/data-gate';

test.describe('Petstore smoke', { tag: '@smoke' }, () => {
  test('GET /store/inventory returns counts per status', async ({ store }) => {
    const response = await store.inventory();

    expect(response.status()).toBe(200);
    const inventory = (await response.json()) as Record<string, unknown>;
    for (const count of Object.values(inventory)) {
      expect(Number.isInteger(count)).toBe(true);
    }
  });

  test('a created pet can be read back and deleted', async ({ pets, qa, faker, contract }) => {
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const pet = PetMother.available(faker);
    const id = pet.id as number;
    try {
      expect((await pets.create(pet)).status()).toBe(200);

      const read = await pets.getById(id);
      expect(read.status()).toBe(200);
      const body: unknown = await read.json();
      expect(body).toMatchSchema(contract, 'Pet');
      expect(body).toMatchObject({ ...pet });

      expect((await pets.remove(id)).status()).toBe(200);
      expect((await pets.getById(id)).status()).toBe(404);
    } finally {
      await pets.remove(id);
    }
  });
});
