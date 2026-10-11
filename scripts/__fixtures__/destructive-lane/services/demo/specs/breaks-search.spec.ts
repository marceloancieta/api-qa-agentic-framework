// Fixture for the destructive lane's selection: two destructive cases, one tagged in its title and
// one through its describe.

import { test } from '@playwright/test';

test('TC-DEMO-01 a record that breaks the search @regression @destructive', () => {});

test.describe('a group', { tag: '@destructive' }, () => {
  test('TC-DEMO-02 tagged through the describe @regression', () => {});
});

declare function knownGap(key: string, why: string): Promise<string>;

test('TC-DEMO-04 an armed destructive gap @regression @destructive @known-gap', async () => {
  test.fail(true, await knownGap('DEMO-1', 'the record breaks every search'));
});
