// Fixture: arming expected failures (xfail-armed-early, known-gap-untracked).

import { test, expect } from '../fixtures';
import { knownGap } from '../../../helpers/case-meta';
import { requireData, skipUnless } from '../../../helpers/data-gate';
import { aPet } from '../builders/pet-builder';

test.describe('arms', () => {
  test('armed before its preconditions @known-gap', async ({ pets, faker }) => {
    const reason = await knownGap('GAP-1', 'accepts a negative quantity');
    test.fail(true, reason); // expect-finding: xfail-armed-early
    const pet = aPet(faker).build();
    await pets.create(pet);
    const response = await pets.update({ ...pet, name: '' });
    expect(response.status()).toBe(400);
  });

  test('armed before a data gate @known-gap', async ({ pets, qa }) => {
    test.fail(true, await knownGap('GAP-2', 'wrong code')); // expect-finding: xfail-armed-early
    skipUnless(qa.allowWrites, 'read-only environment');
    const response = await pets.findByStatus('pending');
    expect(response.status()).toBe(200);
  });

  test('armed right before the action @known-gap', async ({ pets, faker }) => {
    const pet = aPet(faker).build();
    await pets.create(pet);
    const before = await requireData('a pet', async () => pet);
    const reason = await knownGap('GAP-3', 'empty name accepted');
    test.fail(true, reason);
    const response = await pets.update({ ...before, name: '' });
    const body = await response.json();
    expect(response.status()).toBe(400);
    expect(body).toBeTruthy();
  });

  test('armed with the action inside the assertion @known-gap', async ({ pets }) => {
    test.fail(true, await knownGap('GAP-4', 'wrong code'));
    expect((await pets.findByStatus('lost')).status()).toBe(400);
  });

  test.fail(
    'declared as failing', // expect-finding: known-gap-untracked, xfail-armed-early
    async ({ pets, faker }) => {
      const pet = aPet(faker).build();
      await pets.create(pet);
      const read = await pets.getById(pet.id);
      expect(read.status()).toBe(200);
    },
  );

  test('armed without a reason @known-gap', async ({ pets }) => {
    test.fail(); // expect-finding: known-gap-untracked
    expect((await pets.findByStatus('lost')).status()).toBe(400);
  });

  test('armed on a condition only @known-gap', async ({ pets, qa }) => {
    test.fail(qa.environment === 'local'); // expect-finding: known-gap-untracked
    expect((await pets.findByStatus('lost')).status()).toBe(400);
  });

  test('armed with a hand-written reason @known-gap', async ({ pets }) => {
    test.fail(true, 'GAP-5: wrong code'); // expect-finding: known-gap-untracked
    expect((await pets.findByStatus('lost')).status()).toBe(400);
  });

  test('armed but not tagged', async ({ pets }) => {
    const reason = await knownGap('GAP-6', 'wrong code');
    test.fail(true, reason); // expect-finding: known-gap-untracked
    expect((await pets.findByStatus('lost')).status()).toBe(400);
  });

  test(
    'tagged but never armed' /* expect-finding: known-gap-untracked */,
    { tag: '@known-gap' },
    async ({ pets }) => {
      expect((await pets.findByStatus('sold')).status()).toBe(200);
    },
  );

  test('a skip with a condition is not an arm', async ({ pets, qa }) => {
    test.skip(!qa.allowWrites, 'read-only environment');
    expect((await pets.findByStatus('sold')).status()).toBe(200);
  });
});

test.describe('tagged group', { tag: '@known-gap' }, () => {
  test('inherits the tag from its describe', async ({ pets }) => {
    const reason = await knownGap('GAP-7', 'wrong code');
    test.fail(true, reason);
    expect((await pets.findByStatus('lost')).status()).toBe(400);
  });
});

test.describe('armed group', () => {
  test.fail(); // expect-finding: xfail-armed-early, known-gap-untracked

  test.beforeEach(async () => {
    test.fail(true, 'flaky upstream'); // expect-finding: xfail-armed-early, known-gap-untracked
  });

  test('inside a group arm', async ({ pets }) => {
    expect((await pets.findByStatus('sold')).status()).toBe(200);
  });
});
