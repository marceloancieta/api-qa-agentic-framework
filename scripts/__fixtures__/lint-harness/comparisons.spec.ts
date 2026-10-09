// Fixture: date-times compared as raw text (unnormalized-comparison).

import { test, expect } from '../fixtures';
import { expectSameState, normalize } from '../../../helpers/state-compare';
import { ORDER_FIELDS } from '../state-models';

test('raw date-time comparisons', async ({ store }) => {
  const sent = { id: 1, shipDate: '2030-01-01T00:00:00Z', updatedAt: '2030-01-01T00:00:00Z' };
  const body = await (await store.getOrder(1)).json();
  expect(body.shipDate).toBe(sent.shipDate); // expect-finding: unnormalized-comparison
  expect(body['updatedAt']).toEqual('2030-01-01T00:00:00Z'); // expect-finding: unnormalized-comparison
  expect.soft(sent.shipDate).not.toStrictEqual(body.shipDate); // expect-finding: unnormalized-comparison
  expect(body.timestamp).toBe(sent.updatedAt); // expect-finding: unnormalized-comparison
});

// Look-alikes that are correct.

test('normalized or not an equality', async ({ store }) => {
  const sent = { id: 1, shipDate: '2030-01-01T00:00:00Z', format: 'json' };
  const body = await (await store.getOrder(1)).json();
  expect(normalize.instant(body.shipDate)).toBe(normalize.instant(sent.shipDate));
  expect(Date.parse(body.shipDate)).toBe(Date.parse(sent.shipDate));
  expectSameState(sent, body, ORDER_FIELDS);
  expect(body.deletedAt).toBe(null);
  expect(body.shipDate).toBeDefined();
  expect(typeof body.shipDate).toBe('string');
  expect(body.format).toBe(sent.format);
  expect(body.status).toBe('placed');
});
