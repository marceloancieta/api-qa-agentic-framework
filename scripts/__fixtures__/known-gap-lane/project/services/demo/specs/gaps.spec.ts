// Known-gap shapes for the lane, all offline. `knownGap` stands in for the helper in
// helpers/case-meta.ts: the lane recognizes the arm by the call's name in the syntax tree.
import { expect, test } from '@playwright/test';

async function knownGap(key: string, why: string): Promise<string> {
  test.info().annotations.push({ type: 'issue', description: key });
  return `${key}: ${why}`;
}

test('TC-DEMO-01 the defect still reproduces', async () => {
  const reason = await knownGap('DEMO-11', 'answers 500 for a malformed id');
  test.fail(true, reason);
  expect(500).toBe(400);
});

test('TC-DEMO-02 the defect no longer reproduces', async () => {
  test.fail(true, await knownGap('DEMO-12', 'ignores the page size'));
  expect(400).toBe(400);
});

test('TC-DEMO-03 the precondition breaks before the arm @known-gap', async () => {
  expect('setup', 'precondition').toBe('ready');
  const reason = await knownGap('DEMO-13', 'drops the trailing slash');
  test.fail(true, reason);
});

test('TC-DEMO-04 an ordinary case', () => {
  expect(true).toBe(true);
});
