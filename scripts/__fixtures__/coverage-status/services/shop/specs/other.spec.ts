// Fixture spec read by the coverage-status and traceability tests; never executed.
import { test } from '../fixtures';
import { knownGap } from '../../../helpers/case-meta';

test('TC-ITEM-06 written in the wrong file', async () => {});

test('a check without a case id', async () => {
  test.fail(true, await knownGap('BUG-99', 'not filed in any registry'));
});

test('TC-ITEM-15 second home with another key', async () => {
  test.fail(true, await knownGap('BUG-16', 'not the row defect'));
});
