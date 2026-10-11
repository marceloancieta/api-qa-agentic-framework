// Checks that several specs of this pack share. A spec imports them from here, never from another
// spec. A check belongs here when the contract declares the shape inline, so there is no named
// schema for `toMatchSchema` to use.

import type { APIResponse } from '@playwright/test';
import { expect } from './fixtures';

const INT32_MIN = -(2 ** 31);
const INT32_MAX = 2 ** 31 - 1;

/** `GET /store/inventory`: `200`, JSON, an object whose every value is an int32 (inline schema). */
export async function expectInventoryMap(response: APIResponse): Promise<void> {
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/json');
  const body: unknown = await response.json();
  expect(body !== null && typeof body === 'object' && !Array.isArray(body)).toBe(true);
  for (const [key, count] of Object.entries(body as Record<string, unknown>)) {
    expect(Number.isInteger(count), `count of ${key}`).toBe(true);
    expect(count as number, `count of ${key}`).toBeGreaterThanOrEqual(INT32_MIN);
    expect(count as number, `count of ${key}`).toBeLessThanOrEqual(INT32_MAX);
  }
}
