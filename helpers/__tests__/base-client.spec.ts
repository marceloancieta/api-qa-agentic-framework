import { test, expect, type APIRequestContext, type APIResponse } from '@playwright/test';
import { BaseClient } from '../base-client';
import { pseudonym } from '../redact';

const BASE = 'http://api.test/v1/';

// Stand-in request context: remembers each requested path and replies 200, no body.
function fakeContext(calls: string[]): APIRequestContext {
  return {
    fetch: async (path: string) => {
      calls.push(path);
      return {
        url: () => new URL(path, BASE).toString(),
        status: () => 200,
        headers: () => ({}),
        text: async () => '',
      } as unknown as APIResponse;
    },
  } as unknown as APIRequestContext;
}

class Users extends BaseClient {
  remove(username: string) {
    return this.delete(this.route('users/{username}/keys/{keyId}', { username, keyId: 'a/b' }));
  }
  broken() {
    return this.get(this.route('users/{username}'));
  }
}

// eslint-disable-next-line no-empty-pattern -- Playwright requires the destructuring form.
test('route values are encoded on the wire and identity values pseudonymized in evidence', async ({}, testInfo) => {
  const calls: string[] = [];
  const users = new Users(fakeContext(calls), undefined, { identityFields: ['username'] });
  await users.remove('ana smith');

  expect(calls).toEqual(['users/ana%20smith/keys/a%2Fb']);
  const evidence = JSON.parse(String(testInfo.attachments.at(-1)?.body)) as {
    request: { url: string };
  };
  expect(evidence.request.url).toBe(
    `http://api.test/v1/users/${encodeURIComponent(pseudonym('ana smith'))}/keys/a%2Fb`,
  );
  expect(testInfo.attachments.at(-1)?.name).not.toContain('ana');
});

test('a missing route parameter fails by name', async () => {
  await expect(new Users(fakeContext([])).broken()).rejects.toThrow(/needs parameter "username"/);
});
