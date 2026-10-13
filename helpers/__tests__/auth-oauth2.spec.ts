// The oauth2_client_credentials strategy against a token server the test starts itself, so the
// wire format (form, client authentication, absolute token URL) is the one a real endpoint sees.
// Time comes from an injected clock: no test waits for a token to expire.

import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, expect, request as apiRequest, type APIRequestContext } from '@playwright/test';
import { createAuth, type OutgoingRequest } from '../auth';
import type { AuthConfig } from '../config';

type OAuth2Config = Extract<AuthConfig, { type: 'oauth2_client_credentials' }>;

interface TokenRequest {
  method: string | undefined;
  path: string | undefined;
  contentType: string | undefined;
  authorization: string | undefined;
  form: Record<string, string>;
}

interface Answer {
  status: number;
  body: unknown;
}

const BEARER = 'Bearer';
const env = { CID: 'c1', CSEC: 's1' };

let server: Server;
let context: APIRequestContext;
let tokenUrl: string;
const received: TokenRequest[] = [];
const answers: Answer[] = [];

const blank = (): OutgoingRequest => ({ headers: {}, params: {} });
const issued = (value: string, extra: Record<string, unknown> = {}): Answer => ({
  status: 200,
  body: { access_token: value, token_type: BEARER, ...extra },
});
const config = (extra: Partial<OAuth2Config> = {}): OAuth2Config => ({
  type: 'oauth2_client_credentials',
  token_url: tokenUrl,
  client_id_env: 'CID',
  client_secret_env: 'CSEC',
  ...extra,
});

function clock(start = 1_000) {
  let time = start;
  return {
    now: () => time,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

async function readBody(message: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of message) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

test.beforeAll(async () => {
  // Records each token request and answers from the scripted queue, one answer per request.
  server = createServer((req, res) => {
    void readBody(req).then((text) => {
      received.push({
        method: req.method,
        path: req.url,
        contentType: req.headers['content-type'],
        authorization: req.headers.authorization,
        form: Object.fromEntries(new URLSearchParams(text)),
      });
      const answer = answers.shift() ?? { status: 500, body: null };
      res.writeHead(answer.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(answer.body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  tokenUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/oauth/token`;
  // A base URL nothing answers on: the absolute token URL has to override it.
  context = await apiRequest.newContext({ baseURL: 'http://127.0.0.1:9/api/' });
});

test.afterAll(async () => {
  await context.dispose();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

test.beforeEach(() => {
  received.length = 0;
  answers.length = 0;
});

test.describe('oauth2_client_credentials', () => {
  test('basic client authentication sends the form-encoded client credentials in an Authorization header', async () => {
    answers.push(issued('t1'));
    const auth = createAuth(config(), { CID: 'c:1', CSEC: 's 1' });
    const request = blank();
    await auth.apply(request, context);
    expect(request.headers).toEqual({ Authorization: 'Bearer t1' });
    expect(auth.secretKeys).toEqual(['authorization']);
    expect(received).toEqual([
      {
        method: 'POST',
        path: '/oauth/token',
        contentType: expect.stringMatching(/^application\/x-www-form-urlencoded/),
        authorization: `Basic ${Buffer.from('c%3A1:s+1').toString('base64')}`,
        form: { grant_type: 'client_credentials' },
      },
    ]);
  });

  test('body client authentication sends the client credentials as form fields, with the configured scope', async () => {
    answers.push(issued('t1'));
    await createAuth(config({ client_auth: 'body', scope: 'read write' }), env).apply(
      blank(),
      context,
    );
    expect(received).toHaveLength(1);
    expect(received[0]?.authorization).toBeUndefined();
    expect(received[0]?.form).toEqual({
      grant_type: 'client_credentials',
      scope: 'read write',
      client_id: 'c1',
      client_secret: 's1',
    });
  });

  test('the token is reused, and concurrent first requests share one token request', async () => {
    answers.push(issued('t1'), issued('t2'));
    const auth = createAuth(config(), env);
    const [a, b, c] = [blank(), blank(), blank()];
    await Promise.all([auth.apply(a, context), auth.apply(b, context)]);
    await auth.apply(c, context);
    expect([a, b, c].map((r) => r.headers)).toEqual(Array(3).fill({ Authorization: 'Bearer t1' }));
    expect(received).toHaveLength(1);
  });

  test('with expires_in a new token is requested once its lifetime minus the margin has passed, not before', async () => {
    const time = clock();
    answers.push(
      issued('t1', { expires_in: 100 }),
      issued('t2', { expires_in: 600 }),
      issued('t3'),
    );
    const auth = createAuth(config(), env, { now: time.now });
    const sent = async () => {
      const request = blank();
      await auth.apply(request, context);
      return request.headers['Authorization'];
    };
    expect(await sent()).toBe('Bearer t1');
    time.advance(89_999); // the margin is 10% of 100 s
    expect(await sent()).toBe('Bearer t1');
    time.advance(1);
    expect(await sent()).toBe('Bearer t2');
    time.advance(569_999); // 10% of 600 s is capped at 30 s
    expect(await sent()).toBe('Bearer t2');
    time.advance(1);
    expect(await sent()).toBe('Bearer t3');
    expect(received).toHaveLength(3);
  });

  test('without expires_in the token is kept until a 401', async () => {
    const time = clock();
    answers.push(issued('t1'), issued('t2'));
    const auth = createAuth(config(), env, { now: time.now });
    await auth.apply(blank(), context);
    time.advance(365 * 24 * 3600 * 1000);
    const later = blank();
    await auth.apply(later, context);
    expect(later.headers).toEqual({ Authorization: 'Bearer t1' });
    expect(await auth.refresh?.(later, context)).toBe(true);
    expect(later.headers).toEqual({ Authorization: 'Bearer t2' });
    expect(received).toHaveLength(2);
  });

  test('a 401 to its own token requests a new one; a credential the caller set is never replaced', async () => {
    answers.push(issued('t1'), issued('t2'));
    const auth = createAuth(config(), env);
    const request = blank();
    await auth.apply(request, context);
    expect(await auth.refresh?.(request, context)).toBe(true);
    expect(request.headers).toEqual({ Authorization: 'Bearer t2' });

    const own: OutgoingRequest = { headers: { authorization: 'Bearer forged' }, params: {} };
    await auth.apply(own, context);
    expect(await auth.refresh?.(own, context)).toBe(false);
    expect(own.headers).toEqual({ authorization: 'Bearer forged' });
    expect(received).toHaveLength(2);
  });

  test('concurrent 401s to one token share a single new token, and all are sent again', async () => {
    answers.push(issued('t1'), issued('t2'));
    const auth = createAuth(config(), env);
    const [a, b, c] = [blank(), blank(), blank()];
    await Promise.all([a, b, c].map((r) => auth.apply(r, context)));
    const resend = await Promise.all([a, b, c].map((r) => auth.refresh?.(r, context)));
    expect(resend).toEqual([true, true, true]);
    expect([a, b, c].map((r) => r.headers)).toEqual(Array(3).fill({ Authorization: 'Bearer t2' }));
    expect(received).toHaveLength(2);
  });

  test('a 401 to a token already renewed while the request was in flight sends it again with the new token', async () => {
    const time = clock();
    answers.push(issued('t1', { expires_in: 100 }), issued('t2', { expires_in: 100 }));
    const auth = createAuth(config(), env, { now: time.now });
    const inFlight = blank();
    await auth.apply(inFlight, context);
    time.advance(100_000); // past its lifetime: the next request renews it
    const next = blank();
    await auth.apply(next, context);
    expect(next.headers).toEqual({ Authorization: 'Bearer t2' });

    expect(await auth.refresh?.(inFlight, context)).toBe(true);
    expect(inFlight.headers).toEqual({ Authorization: 'Bearer t2' });
    expect(received).toHaveLength(2); // the replaced token needs no request of its own
  });

  test('a refused token request names the URL and the variables, never their values, and is retried next time', async () => {
    answers.push({ status: 400, body: { error: 'invalid_client' } }, issued('t1'));
    const auth = createAuth(config(), env);
    const refused = auth.apply(blank(), context);
    await expect(refused).rejects.toThrow(`${tokenUrl} answered 400 "invalid_client"`);
    await expect(refused).rejects.toThrow(/CID and CSEC/);
    await expect(refused).rejects.not.toThrow(/c1|s1/);

    const request = blank();
    await auth.apply(request, context);
    expect(request.headers).toEqual({ Authorization: 'Bearer t1' });
    expect(received).toHaveLength(2);
  });

  test('an answer without an access_token fails', async () => {
    answers.push({ status: 200, body: { token_type: BEARER } });
    const auth = createAuth(config(), env);
    await expect(auth.apply(blank(), context)).rejects.toThrow(
      /answered 200 without an "access_token"/,
    );
  });

  test('a token type other than bearer fails; bearer is matched whatever its case', async () => {
    answers.push(issued('t1', { token_type: 'mac' }), issued('t2', { token_type: 'BEARER' }));
    const auth = createAuth(config(), env);
    await expect(auth.apply(blank(), context)).rejects.toThrow(/type "mac"; only bearer/);
    const request = blank();
    await auth.apply(request, context);
    expect(request.headers).toEqual({ Authorization: 'Bearer t2' });
  });

  test('both client variables are required, by name', () => {
    expect(() => createAuth(config(), { CID: 'c1' })).toThrow(/variable CSEC\b/);
    expect(() => createAuth(config(), { CSEC: 's1' })).toThrow(/variable CID\b/);
  });
});
