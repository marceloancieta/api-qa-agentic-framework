// Fixture spec read by the coverage-status and traceability tests; never executed.
import { test } from '../fixtures';
import { knownGap } from '../../../helpers/case-meta';

test.describe('items', () => {
  test('TC-ITEM-02 approved row whose test already exists', async () => {});

  test('TC-ITEM-03 creates an item with only its name', async () => {});

  test('TC-ITEM-05 first copy', async () => {});

  test('TC-ITEM-05 second copy', async () => {});

  test.fixme('TC-ITEM-07 parked', async () => {});

  test('TC-ITEM-08 reads an item back', async () => {});

  test('TC-ITEM-09 reads an unknown item', async () => {});

  test('TC-ITEM-10 refuses an overlong name', async () => {
    test.skip(true, 'BUG-10: the service accepts any length');
  });

  test('TC-ITEM-12 not armed', async () => {});

  test('TC-ITEM-13 armed but passing', async () => {
    test.fail(true, await knownGap('BUG-13', 'answers 500'));
  });

  test('TC-ITEM-15 tracked known gap', async () => {
    test.fail(true, await knownGap('BUG-15', 'answers 500'));
  });

  test('TC-ITEM-20 not in any registry', async () => {});
});
