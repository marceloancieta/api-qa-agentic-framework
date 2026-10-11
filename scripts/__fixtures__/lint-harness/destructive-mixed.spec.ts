// Fixture: a destructive case that shares its file with an ordinary one (destructive-isolation).

import { test, expect } from '../fixtures';

// prettier-ignore
test('TC-PET-20 a write that breaks the search for everyone @regression @destructive', async ({ store }) => { // expect-finding: destructive-isolation
  expect((await store.inventory()).status()).toBe(200);
});

test('TC-PET-21 an ordinary read in the same file @regression', async ({ store }) => {
  expect((await store.inventory()).status()).toBe(200);
});

test.describe('a destructive group', { tag: '@destructive' }, () => {
  // prettier-ignore
  test('TC-PET-22 takes the tag from its describe @regression', async ({ store }) => { // expect-finding: destructive-isolation
    expect((await store.inventory()).status()).toBe(200);
  });
});
