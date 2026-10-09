// Cases for the published lane, all offline. Only some of them are published in the registry.
import { expect, test } from '@playwright/test';

test('TC-BOOK-01 a published case that passes', () => {
  expect([1, 2, 3]).toHaveLength(3);
});

test('TC-BOOK-02 a published case that fails', () => {
  expect('shelved').toBe('lent');
});

test('TC-BOOK-03 an automated case, not published', () => {
  expect(true).toBe(true);
});

test('TC-BOOK-010 a case whose id extends a published one', () => {
  expect('this case must never be selected by TC-BOOK-01').toBe('');
});

test('TC-BOOK-05 a published case held in quarantine', { tag: '@quarantine' }, () => {
  expect(1).toBe(1);
});
