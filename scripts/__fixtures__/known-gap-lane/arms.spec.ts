// Parsed only, never run: every way a test can (or cannot) be armed as a known gap.
import { expect, test } from '@playwright/test';
import * as meta from '../../../helpers/case-meta';
import { knownGap } from '../../../helpers/case-meta';

test('TC-ARM-01 reason held in a variable', async () => {
  const reason = await knownGap('ARM-1', 'returns 500 for an empty body');
  test.fail(true, reason);
  expect(500).toBe(400);
});

test('TC-ARM-02 reason passed inline', async () => {
  test.fail(true, await knownGap('ARM-2', 'ignores the limit'));
  expect(1).toBe(2);
});

test('TC-ARM-03 helper reached through a namespace', async () => {
  test.fail(true, await meta.knownGap('ARM-3', 'drops the header'));
  expect(1).toBe(2);
});

test('TC-ARM-04 conditional arm', async () => {
  const onCanary = process.env.CANARY === '1';
  const why = await knownGap('ARM-4', 'canary deployment only');
  test.fail(onCanary, why);
  expect(1).toBe(1);
});

test('TC-ARM-05 tagged without an arm', { tag: '@known-gap' }, async () => {
  expect(1).toBe(1);
});

test('TC-ARM-06 plain expected failure, not a known gap', async () => {
  test.fail(true, 'documented behaviour, no issue');
  expect(1).toBe(2);
});

test('TC-ARM-07 the helper only in a comment or a string', async () => {
  // test.fail(true, await knownGap('ARM-7', 'not code'));
  const text = "test.fail(true, await knownGap('ARM-7', 'not code'))";
  expect(text).toContain('knownGap');
});

test('TC-ARM-08 helper called but never used as the reason', async () => {
  await knownGap('ARM-8', 'linked, but the arm says something else');
  test.fail(true, 'unrelated');
  expect(1).toBe(2);
});

test.fail('TC-ARM-09 declared failing, no helper', async () => {
  expect(1).toBe(2);
});

test('TC-ARM-10 computed key', async () => {
  const key = ['ARM', '10'].join('-');
  test.fail(true, await knownGap(key, 'computed'));
  expect(1).toBe(2);
});
