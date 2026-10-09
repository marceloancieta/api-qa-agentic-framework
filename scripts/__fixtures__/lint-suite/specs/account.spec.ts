// Fixture: identifiers hard-coded in a spec instead of injected at run time.

import { test, expect } from '../fixtures';

test('hard-coded identifiers', async ({ users }) => {
  await users.login('m.rossi@studio-north.it', 'secret'); // expect-finding: email-address
  const response = await users.getById(987654321012); // expect-finding: numeric-id
  expect(response.status()).toBe(200);
});

test('injected or reserved values', async ({ users, qa }) => {
  await users.login(qa.user ?? 'buyer@example.net', 'secret');
  const response = await users.getById(Number.MAX_SAFE_INTEGER);
  expect(response.status()).toBe(404);
  expect(`${qa.baseUrl}/user/${qa.userId}`).toContain('/user/');
  expect('+1-202-555-0199').toMatch(/555/);
});
