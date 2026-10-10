// Fixture: the tag taxonomy (tag-taxonomy). The marked calls keep their layout with prettier-ignore,
// so the marker stays on the line the finding is reported on. `@securty` is misspelled on purpose.

import { test, expect } from '../fixtures';

// prettier-ignore
test.describe('a group with a made-up tag', { tag: '@nightly' }, () => { // expect-finding: tag-taxonomy
  test('an undesigned test needs no layer', async ({ store }) => {
    expect((await store.inventory()).status()).toBe(200);
  });
});

test.describe('a regression group', { tag: '@regression' }, () => {
  test('TC-PET-01 takes its layer from the describe', async ({ store }) => {
    expect((await store.inventory()).status()).toBe(200);
  });

  // prettier-ignore
  test('TC-PET-02 cannot add a second layer @smoke', async ({ store }) => { // expect-finding: tag-taxonomy
    expect((await store.inventory()).status()).toBe(200);
  });
});

// prettier-ignore
test('TC-PET-03 a designed case with no layer', async ({ store }) => { // expect-finding: tag-taxonomy
  expect((await store.inventory()).status()).toBe(200);
});

test('TC-PET-04 a layer and two categories @smoke @security @data-integrity', async ({ store }) => {
  expect((await store.inventory()).status()).toBe(200);
});

// prettier-ignore
test('a misspelled category @securty', async ({ store }) => { // expect-finding: tag-taxonomy
  expect((await store.inventory()).status()).toBe(200);
});

test(
  'TC-PET-05 tags in the details',
  { tag: ['@regression', '@contract-drift'] },
  async ({ store }) => {
    expect((await store.inventory()).status()).toBe(200);
  },
);
