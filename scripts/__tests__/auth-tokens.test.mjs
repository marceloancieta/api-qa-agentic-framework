import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actorAuthOf, jwtExpiry, laneCredential, renewAtFor } from '../lib/auth-tokens.mjs';

/** A JWT with the given claims; the signature is not checked by anything here. */
const jwt = (claims) =>
  ['{"alg":"none"}', JSON.stringify(claims), 'sig']
    .map((part, i) => (i < 2 ? Buffer.from(part).toString('base64url') : part))
    .join('.');

/** A `post` that answers from `answers` in order and records each request. */
function fakePost(answers) {
  const calls = [];
  const post = async (url, request) => {
    calls.push({ url, ...request });
    return answers.shift() ?? { ok: false, status: 500, body: null };
  };
  return { post, calls };
}

test('the exp claim of a JWT, in milliseconds; anything else has none', () => {
  assert.equal(jwtExpiry(jwt({ exp: 1_000, sub: 'a' })), 1_000_000);
  assert.equal(jwtExpiry(jwt({ sub: 'a' })), undefined);
  assert.equal(jwtExpiry('t1'), undefined);
  assert.equal(jwtExpiry('a.b.c'), undefined, 'three parts that are no JSON');
});

test('renewal is due a margin before expiry: 10% of the lifetime, at most 30 s', () => {
  assert.equal(renewAtFor('t1', 0, 100), 90_000, 'expires_in 100 s: 10 s margin');
  assert.equal(renewAtFor('t1', 0, 3_600), 3_570_000, 'expires_in 1 h: the 30 s cap');
  assert.equal(renewAtFor(jwt({ exp: 160 }), 100_000), 154_000, 'JWT exp 60 s ahead: 6 s margin');
  assert.equal(renewAtFor(jwt({ exp: 160 }), 100_000, 10), 109_000, 'expires_in wins over exp');
  assert.equal(renewAtFor('t1', 0), undefined, 'no lifetime known');
  assert.equal(renewAtFor('t1', 0, 0), undefined, 'a zero expires_in is no lifetime');
});

test('fixed schemes give one header that renewal keeps', async () => {
  const env = { K: 'k1', U: 'u1', P: 'pw' };
  const key = await laneCredential(
    { type: 'api_key', in: 'header', name: 'X-Key', env: 'K' },
    { baseUrl: 'http://x.test', env },
  );
  assert.deepEqual([key.header, key.value, key.renewAt], ['X-Key', 'k1', undefined]);
  assert.equal((await key.renew()).value, 'k1');
  const bearer = await laneCredential(
    { type: 'bearer', env: 'K' },
    { baseUrl: 'http://x.test', env },
  );
  assert.deepEqual([bearer.header, bearer.value], ['Authorization', 'Bearer k1']);
  const basic = await laneCredential(
    { type: 'basic', username_env: 'U', password_env: 'P' },
    { baseUrl: 'http://x.test', env },
  );
  assert.equal(basic.value, `Basic ${Buffer.from('u1:pw').toString('base64')}`);
  assert.equal(await laneCredential({ type: 'none' }, { baseUrl: 'http://x.test', env }), null);
});

test('an API key in the query and a missing variable are refused, by name', async () => {
  await assert.rejects(
    laneCredential(
      { type: 'api_key', in: 'query', name: 'key', env: 'K' },
      { baseUrl: 'http://x.test', env: { K: 'k1' } },
    ),
    /query parameter "key"; a lane can only add a header/,
  );
  await assert.rejects(
    laneCredential({ type: 'bearer', env: 'K' }, { baseUrl: 'http://x.test', env: { K: ' ' } }),
    /needs the environment variable K, which is not set/,
  );
});

test('login is resolved against the base URL, and each renewal logs in again', async () => {
  const token1 = jwt({ exp: 160 });
  const { post, calls } = fakePost([
    { ok: true, status: 200, body: { auth_token: token1 } },
    { ok: true, status: 200, body: { auth_token: 't2' } },
  ]);
  const auth = { type: 'login', path: 'users/v1/login', username_env: 'U', password_env: 'P' };
  const first = await laneCredential(auth, {
    baseUrl: 'http://api.test/v1',
    env: { U: 'u1', P: 'pw' },
    post,
    now: () => 100_000,
  });
  assert.deepEqual(calls[0], {
    url: 'http://api.test/v1/users/v1/login',
    data: { username: 'u1', password: 'pw' },
    headers: {},
  });
  assert.deepEqual(
    [first.header, first.value, first.renewAt],
    ['Authorization', `Bearer ${token1}`, 154_000],
  );
  const second = await first.renew();
  assert.deepEqual([second.value, second.renewAt], ['Bearer t2', undefined]);
  assert.equal(calls.length, 2);
});

test('a refused login or token request names the variables, never their values', async () => {
  const login = { type: 'login', path: 'login', username_env: 'U', password_env: 'P' };
  const { post } = fakePost([{ ok: true, status: 200, body: { status: 'fail' } }]);
  const refused = laneCredential(login, {
    baseUrl: 'http://x.test',
    env: { U: 'u1', P: 'pw' },
    post,
  });
  await assert.rejects(
    refused,
    /answered 200 without a "auth_token" string; check the credentials in U and P/,
  );
  await assert.rejects(refused, (error) => !/u1|pw/.test(error.message));

  const oauth = {
    type: 'oauth2_client_credentials',
    token_url: 'http://auth.test/token',
    client_id_env: 'CID',
    client_secret_env: 'CSEC',
  };
  const answer = fakePost([{ ok: false, status: 401, body: { error: 'invalid_client' } }]);
  await assert.rejects(
    laneCredential(oauth, {
      baseUrl: 'http://x.test',
      env: { CID: 'c1', CSEC: 's1' },
      post: answer.post,
    }),
    /answered 401 "invalid_client" to the client in CID; check the client credentials in CID and CSEC/,
  );
});

test('oauth2 client credentials: the token and its renewal time come from the answer', async () => {
  const { post, calls } = fakePost([
    { ok: true, status: 200, body: { access_token: 't1', token_type: 'Bearer', expires_in: 100 } },
  ]);
  const credential = await laneCredential(
    {
      type: 'oauth2_client_credentials',
      token_url: 'http://auth.test/token',
      client_id_env: 'CID',
      client_secret_env: 'CSEC',
      client_auth: 'body',
      scope: 'read',
    },
    { baseUrl: 'http://x.test', env: { CID: 'c1', CSEC: 's1' }, post, now: () => 0 },
  );
  assert.deepEqual([credential.value, credential.renewAt], ['Bearer t1', 90_000]);
  assert.deepEqual(calls[0].form, {
    grant_type: 'client_credentials',
    scope: 'read',
    client_id: 'c1',
    client_secret: 's1',
  });
});

test('an actor resolves as in the runner: default, anonymous, a named one, or an error listing them', () => {
  const environment = {
    source: 'qa-config.json',
    name: 'local',
    pack: 'shop',
    config: { auth: { type: 'bearer', env: 'K' }, actors: { buyer: { type: 'bearer', env: 'B' } } },
  };
  assert.deepEqual(actorAuthOf(environment), { type: 'bearer', env: 'K' });
  assert.deepEqual(actorAuthOf(environment, 'anonymous'), { type: 'none' });
  assert.deepEqual(actorAuthOf(environment, 'buyer'), { type: 'bearer', env: 'B' });
  assert.throws(
    () => actorAuthOf(environment, 'seller'),
    /Actor "seller" is not defined in qa-config.json api.environments.local.packs.shop.actors. Known: default, anonymous, buyer\./,
  );
});
