// Fixture: destructive cases with a file of their own; nothing to report.

import { test, expect } from '../fixtures';

test('TC-PET-23 a write that breaks the search for everyone @regression @destructive', async ({
  store,
}) => {
  expect((await store.inventory()).status()).toBe(200);
});

test.describe('another destructive case', { tag: '@destructive' }, () => {
  test('TC-PET-24 tagged through its describe @regression', async ({ store }) => {
    expect((await store.inventory()).status()).toBe(200);
  });
});
