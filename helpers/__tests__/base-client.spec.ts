import { test, expect, type APIRequestContext, type APIResponse } from '@playwright/test';
import type { AuthStrategy } from '../auth';
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

// A context whose API accepts only the token `fresh` and answers 401 otherwise, recording each header.
function expiringContext(sent: string[]): APIRequestContext {
  return {
    fetch: async (path: string, options: { headers: Record<string, string> }) => {
      const authorization = options.headers['Authorization'] ?? '(none)';
      sent.push(authorization);
      return {
        url: () => new URL(path, BASE).toString(),
        status: () => (authorization === 'Bearer fresh' ? 200 : 401),
        headers: () => ({}),
        text: async () => '',
      } as unknown as APIResponse;
    },
  } as unknown as APIRequestContext;
}

// A strategy holding `stale` until refreshed, like an expired login token.
function renewable(): AuthStrategy {
  let token = 'stale';
  return {
    type: 'login',
    secretKeys: ['authorization'],
    apply: async (request) => {
      request.headers['Authorization'] ??= `Bearer ${token}`;
    },
    refresh: async (request) => {
      if (request.headers['Authorization'] !== `Bearer ${token}`) return false;
      token = 'fresh';
      request.headers['Authorization'] = `Bearer ${token}`;
      return true;
    },
  };
}

class Books extends BaseClient {
  read(headers?: Record<string, string>, auth?: boolean, bearer?: string) {
    return this.get('books/v1', { headers, auth, bearer });
  }
}

test('a bearer value of the caller is sent as is, never replaced or renewed', async () => {
  const sent: string[] = [];
  const books = new Books(expiringContext(sent), renewable());
  expect((await books.read(undefined, true, 'not-a-jwt')).status()).toBe(401);
  expect(sent).toEqual(['Bearer not-a-jwt']);
});

// The caller resends a token the strategy issued (an expired token of the same actor): the strategy
// would recognise it as its own, so the client must not ask it to renew.
test('a token of the strategy sent by the caller is final, as bearer or as a header', async () => {
  const sent: string[] = [];
  const books = new Books(expiringContext(sent), renewable());
  expect((await books.read(undefined, true, 'stale')).status()).toBe(401);
  expect((await books.read({ Authorization: 'Bearer stale' })).status()).toBe(401);
  expect(sent).toEqual(['Bearer stale', 'Bearer stale']);
});

// eslint-disable-next-line no-empty-pattern -- Playwright requires the destructuring form.
test('a 401 to a renewable credential is sent once more, and both exchanges are recorded', async ({}, testInfo) => {
  const sent: string[] = [];
  const before = testInfo.attachments.length;
  const response = await new Books(expiringContext(sent), renewable()).read();
  expect(response.status()).toBe(200);
  expect(sent).toEqual(['Bearer stale', 'Bearer fresh']);
  expect(testInfo.attachments.length - before).toBe(2);
});

test('a 401 to the caller own credential or to an unauthenticated request is final', async () => {
  const sent: string[] = [];
  const books = new Books(expiringContext(sent), renewable());
  expect((await books.read({ Authorization: 'Bearer forged' })).status()).toBe(401);
  expect(sent).toEqual(['Bearer forged']);

  const noAuthSent: string[] = [];
  const anonymous = new Books(expiringContext(noAuthSent), renewable());
  expect((await anonymous.read(undefined, false)).status()).toBe(401);
  expect(noAuthSent).toEqual(['(none)']);
});
