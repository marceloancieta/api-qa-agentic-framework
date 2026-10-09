import { test, expect } from '@playwright/test';
import { requireData, skipUnless } from '../data-gate';

test('requireData returns data in the needed state', async () => {
  expect(await requireData('seed pet', async () => ({ status: 'available' }))).toEqual({
    status: 'available',
  });
});

test('requireData fails, not skips, when the data is in the wrong state', async () => {
  await expect(
    requireData(
      'seed pet',
      async () => ({ status: 'sold' }),
      (pet) => (pet.status === 'sold' ? ['its status is already "sold"'] : []),
    ),
  ).rejects.toThrow('Precondition: the seed pet is not in the state this case needs');
});

test('skipUnless does nothing when the condition holds', () => {
  skipUnless(true, 'never shown');
  expect(test.info().annotations).toEqual([]);
});

// eslint-disable-next-line no-empty-pattern -- Playwright requires the destructuring form.
test('requireData skips visibly when the data is absent', async ({}, testInfo) => {
  try {
    await requireData('seed pet', async () => null);
  } finally {
    // Runs although test.skip ended the case: the reason must be on record.
    expect(testInfo.annotations).toContainEqual({
      type: 'skip-reason',
      description: 'no seed pet available in this environment',
    });
  }
});
