// Smoke: proves the core end to end (config, auth, clients, evidence) against the configured Petstore.

import { test, expect } from '../fixtures';
import type { Pet } from '../types';

test.describe('Petstore smoke', { tag: '@smoke' }, () => {
  test('GET /store/inventory returns counts per status', async ({ store }) => {
    const response = await store.inventory();

    expect(response.status()).toBe(200);
    const inventory = (await response.json()) as Record<string, unknown>;
    for (const count of Object.values(inventory)) {
      expect(Number.isInteger(count)).toBe(true);
    }
  });

  test('a created pet can be read back and deleted', async ({ pets, qa }, testInfo) => {
    test.skip(!qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    // One id per worker keeps parallel runs apart without random data (seeded data arrives in CORE-06).
    const id = 9_100_000 + testInfo.workerIndex;
    const pet: Pet = {
      id,
      name: 'smoke-pet',
      photoUrls: [],
      status: 'available',
    };
    try {
      expect((await pets.create(pet)).status()).toBe(200);

      const read = await pets.getById(id);
      expect(read.status()).toBe(200);
      expect(await read.json()).toMatchObject({ ...pet });

      expect((await pets.remove(id)).status()).toBe(200);
      expect((await pets.getById(id)).status()).toBe(404);
    } finally {
      await pets.remove(id);
    }
  });
});
