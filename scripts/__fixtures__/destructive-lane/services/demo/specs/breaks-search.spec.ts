// Fixture for the destructive lane's selection: destructive cases tagged in the title or through a
// describe, an armed one, and a quarantined one the lane leaves out.

import { test } from '@playwright/test';

test('TC-DEMO-01 a record that breaks the search @regression @destructive', () => {});

test.describe('a group', { tag: '@destructive' }, () => {
  test('TC-DEMO-02 tagged through the describe @regression', () => {});
});

declare function knownGap(key: string, why: string): Promise<string>;

test('TC-DEMO-04 an armed destructive gap @regression @destructive @known-gap', async () => {
  test.fail(true, await knownGap('DEMO-1', 'the record breaks every search'));
});

test('TC-DEMO-05 a quarantined destructive case @regression @destructive @quarantine', () => {});
