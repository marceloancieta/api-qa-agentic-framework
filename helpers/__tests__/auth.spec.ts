import { test, expect, type APIRequestContext, type APIResponse } from '@playwright/test';
import { createAuth, noAuth, type OutgoingRequest } from '../auth';

const blank = (): OutgoingRequest => ({ headers: {}, params: {} });

test.describe('createAuth', () => {
  test('none applies nothing', () => {
    const request = blank();
    createAuth({ type: 'none' }).apply(request);
    expect(request).toEqual(blank());
  });

  test('api_key in a header uses the configured name and secret', () => {
    const auth = createAuth(
      { type: 'api_key', in: 'header', name: 'X-Key', env: 'K' },
      { K: 'secret-1' },
    );
    const request = blank();
    auth.apply(request);
    expect(request.headers).toEqual({ 'X-Key': 'secret-1' });
    expect(auth.secretKeys).toEqual(['X-Key']);
  });

  test('api_key in the query adds a parameter', () => {
    const auth = createAuth({ type: 'api_key', in: 'query', name: 'key', env: 'K' }, { K: 's' });
    const request = blank();
    auth.apply(request);
    expect(request.params).toEqual({ key: 's' });
    expect(request.headers).toEqual({});
  });

  test('bearer sets the Authorization header', () => {
    const request = blank();
    createAuth({ type: 'bearer', env: 'T' }, { T: 'abc' }).apply(request);
    expect(request.headers).toEqual({ Authorization: 'Bearer abc' });
  });

  test('a header the caller set wins, whatever its case', () => {
    const request: OutgoingRequest = { headers: { authorization: 'Bearer wrong' }, params: {} };
    createAuth({ type: 'bearer', env: 'T' }, { T: 'abc' }).apply(request);
    expect(request.headers).toEqual({ authorization: 'Bearer wrong' });
  });

  test('a missing or blank secret fails by variable name', () => {
    for (const env of [{}, { T: '  ' }]) {
      expect(() => createAuth({ type: 'bearer', env: 'T' }, env)).toThrow(/variable T\b/);
    }
  });

  test('none needs no variable', () => {
    expect(createAuth({ type: 'none' }, {})).toBe(noAuth);
  });
});

test.describe('login', () => {
  const config = {
    type: 'login' as const,
    path: 'users/v1/login',
    username_env: 'U',
    password_env: 'P',
  };
  const env = { U: 'user-a', P: 'pw' };

  // Stand-in context whose login answers come from `answers`, one per call, recording each body.
  function loginContext(answers: Array<{ status: number; body: unknown }>) {
    const logins: unknown[] = [];
    const context = {
      post: async (path: string, options: { data: unknown }) => {
        logins.push({ path, ...(options.data as object) });
        const answer = answers.shift() ?? { status: 500, body: null };
        return {
          ok: () => answer.status >= 200 && answer.status < 300,
          status: () => answer.status,
          json: async () => answer.body,
        } as unknown as APIResponse;
      },
    } as unknown as APIRequestContext;
    return { context, logins };
  }

  test('logs in on the first request only, and concurrent first requests share one login', async () => {
    const { context, logins } = loginContext([{ status: 200, body: { auth_token: 't1' } }]);
    const auth = createAuth(config, env);
    const [a, b, c] = [blank(), blank(), blank()];
    await Promise.all([auth.apply(a, context), auth.apply(b, context)]);
    await auth.apply(c, context);
    expect([a, b, c].map((r) => r.headers)).toEqual(Array(3).fill({ Authorization: 'Bearer t1' }));
    expect(logins).toEqual([{ path: 'users/v1/login', username: 'user-a', password: 'pw' }]);
    expect(auth.secretKeys).toEqual(['authorization']);
  });

  test('a 401 to its own token logs in again; a credential the caller set is never replaced', async () => {
    const { context, logins } = loginContext([
      { status: 200, body: { auth_token: 'old' } },
      { status: 200, body: { auth_token: 'new' } },
    ]);
    const auth = createAuth(config, env);
    const request = blank();
    await auth.apply(request, context);
    expect(await auth.refresh?.(request, context)).toBe(true);
    expect(request.headers).toEqual({ Authorization: 'Bearer new' });

    const own: OutgoingRequest = { headers: { authorization: 'Bearer forged' }, params: {} };
    await auth.apply(own, context);
    expect(await auth.refresh?.(own, context)).toBe(false);
    expect(own.headers).toEqual({ authorization: 'Bearer forged' });
    expect(logins).toHaveLength(2);
  });

  test('a refused login names the variables, never their values, and is retried next time', async () => {
    const { context, logins } = loginContext([
      { status: 400, body: { status: 'fail', message: 'Password is not correct' } },
      { status: 200, body: { token: 'x' } },
    ]);
    const auth = createAuth(config, env);
    const refused = auth.apply(blank(), context);
    await expect(refused).rejects.toThrow(/answered 400 .*U and P/);
    await expect(refused).rejects.not.toThrow(/user-a|pw/);
    await expect(auth.apply(blank(), context)).rejects.toThrow(/without a "auth_token"/);
    expect(logins).toHaveLength(2);
  });

  test('both credential variables are required, by name', () => {
    expect(() => createAuth(config, { U: 'user-a' })).toThrow(/variable P\b/);
    expect(() => createAuth(config, { P: 'pw' })).toThrow(/variable U\b/);
  });
});
