// Every way a case can carry the tags every run leaves out. All offline and always passing, so the
// flake lane finds them stable.
import { expect, test } from '@playwright/test';

test('TC-QUA-01 an ordinary case @regression', () => {
  expect(true).toBe(true);
});

test('TC-QUA-02 quarantined in the title @regression @quarantine', () => {
  expect(true).toBe(true);
});

test('TC-QUA-03 quarantined through the tag option @regression', { tag: '@quarantine' }, () => {
  expect(true).toBe(true);
});

test.describe('a quarantined group', { tag: '@quarantine' }, () => {
  test('TC-QUA-04 quarantined through its describe @regression', () => {
    expect(true).toBe(true);
  });
});

test('TC-QUA-05 a destructive case @regression @destructive', () => {
  expect(true).toBe(true);
});

test('TC-QUA-06 destructive and quarantined @regression @destructive @quarantine', () => {
  expect(true).toBe(true);
});

test('TC-QUA-07 a tag that only starts like it @regression @quarantined-elsewhere', () => {
  expect(true).toBe(true);
});
