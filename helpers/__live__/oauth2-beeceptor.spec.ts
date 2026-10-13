// The oauth2_client_credentials strategy against a public OAuth 2.0 mock (Beeceptor), on demand
// only: `npm run auth:live`. No example pack uses the grant, and the unit tests run it against a
// token server they start themselves; this check shows the same requests are accepted by a server
// someone else wrote. It proves the wire format only: the mock answers any request with a token
// and no `expires_in`, so rejections, expiry and renewal stay with the unit tests. The client id
// and secret are throwaway values made for each run. QA_OAUTH2_LIVE_TOKEN_URL replaces the URL.

import { randomUUID } from 'node:crypto';
import { test, expect, request as apiRequest, type APIRequestContext } from '@playwright/test';
import { createAuth, type OutgoingRequest } from '../auth';
import type { AuthConfig } from '../config';

const TOKEN_URL =
  process.env.QA_OAUTH2_LIVE_TOKEN_URL?.trim() ||
  'https://oauth-mock.mock.beeceptor.com/oauth/token/google';

const env = { LIVE_CLIENT_ID: `client-${randomUUID()}`, LIVE_CLIENT_KEY: randomUUID() };
const config = (extra: Partial<AuthConfig> = {}) =>
  ({
    type: 'oauth2_client_credentials',
    token_url: TOKEN_URL,
    client_id_env: 'LIVE_CLIENT_ID',
    client_secret_env: 'LIVE_CLIENT_KEY',
    ...extra,
  }) as AuthConfig;

let context: APIRequestContext;

test.beforeAll(async () => {
  context = await apiRequest.newContext();
});

test.afterAll(async () => {
  await context.dispose();
});

test.describe('oauth2_client_credentials against a public OAuth mock', () => {
  for (const clientAuth of ['basic', 'body'] as const) {
    test(`client authentication ${clientAuth} gets a bearer token, reused by the next request`, async () => {
      const auth = createAuth(config({ client_auth: clientAuth, scope: 'read write' }), env);
      const first: OutgoingRequest = { headers: {}, params: {} };
      const second: OutgoingRequest = { headers: {}, params: {} };
      await auth.apply(first, context);
      await auth.apply(second, context);
      expect(first.headers.Authorization).toMatch(/^Bearer \S+$/);
      expect(second.headers).toEqual(first.headers);
    });
  }
});
