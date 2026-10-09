// Outcomes depend on the repeat index only, so the lane's verdicts are deterministic.
import { expect, test } from '@playwright/test';

test('always passes', () => {
  expect(1 + 1).toBe(2);
});

test('passes on even repeats only', () => {
  expect(test.info().repeatEachIndex % 2).toBe(0);
});

test('always fails', () => {
  expect('actual').toBe('expected');
});

test('held back but steady', { tag: '@quarantine' }, () => {
  expect(true).toBe(true);
});

test('held back and still unsteady @quarantine', () => {
  expect(test.info().repeatEachIndex).toBeLessThan(1);
});
