import { test, expect } from '@playwright/test';
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
