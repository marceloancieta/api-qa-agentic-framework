// Obtaining credentials from qa-config `auth` entries, shared by the test runner (helpers/auth.ts,
// which applies them per request) and the lanes that send traffic with a tool of their own (the
// DAST and performance lanes, which put one credential on everything the tool sends). One place
// decides how a token is requested and when it is due for renewal, so both sides behave alike.
//
// A token is renewed a margin before it expires: 10% of its lifetime, at most 30 s. The lifetime
// comes from the `expires_in` of an OAuth 2.0 answer, otherwise from the `exp` claim when the token
// is a JWT; a token with neither is kept until the API refuses it.
//
// Requests go through `post(url, { data | form, headers })`, which answers `{ ok, status, body }`
// (`body` parsed JSON or null): the runner adapts Playwright's request context to it, the lanes use
// `fetchPost`. Error messages name variables, never their values (scripts/lib/env-names.mjs).

import { missingVariableMessage, redactUnlessVariableName } from './env-names.mjs';

/** `text` as base64, from its UTF-8 bytes. */
export const base64 = (text) => Buffer.from(text, 'utf8').toString('base64');

/** application/x-www-form-urlencoded, which RFC 6749 2.3.1 applies to each half of a client's Basic credential. */
export const formEncode = (value) => new URLSearchParams([['', value]]).toString().slice(1);

/** The `exp` claim of a JWT in milliseconds, or undefined when `token` is no JWT or has none. */
export function jwtExpiry(token) {
  const parts = String(token).split('.');
  if (parts.length !== 3) return undefined;
  try {
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return typeof claims?.exp === 'number' && claims.exp > 0 ? claims.exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}

/**
 * When a token issued at `issuedAt` (ms) is due for renewal: `expiresInSeconds` first, else the
 * token's JWT `exp`; undefined when neither is known.
 */
export function renewAtFor(token, issuedAt, expiresInSeconds) {
  const expiresAt =
    typeof expiresInSeconds === 'number' && expiresInSeconds > 0
      ? issuedAt + expiresInSeconds * 1000
      : jwtExpiry(token);
  if (expiresAt === undefined) return undefined;
  const lifetime = Math.max(0, expiresAt - issuedAt);
  return expiresAt - Math.min(30_000, lifetime / 10);
}

/**
 * `login`: POST `{ username, password }` to `url` (the login operation, already resolved against
 * the pack's base URL by the caller) and read the token from `config.token_field`.
 */
export async function issueLoginToken({ config, url, username, password, post, now = Date.now }) {
  const field = config.token_field ?? 'auth_token';
  const issuedAt = now();
  const response = await post(url, { data: { username, password }, headers: {} });
  const token = response.body?.[field];
  if (!response.ok || typeof token !== 'string' || !token) {
    const user = redactUnlessVariableName(config.username_env);
    throw new Error(
      `Login at ${config.path} as the user in ${user} answered ${response.status} without a ` +
        `"${field}" string; check the credentials in ${user} and ` +
        `${redactUnlessVariableName(config.password_env)}.`,
    );
  }
  return { value: token, renewAt: renewAtFor(token, issuedAt) };
}

/**
 * `oauth2_client_credentials`: POST the client credentials grant as a form to `config.token_url`,
 * authenticating the client with HTTP Basic or with form fields as `config.client_auth` says. The
 * `access_token` must be a bearer token.
 */
export async function issueOAuth2Token({ config, clientId, clientSecret, post, now = Date.now }) {
  const client = redactUnlessVariableName(config.client_id_env);
  const variables = `${client} and ${redactUnlessVariableName(config.client_secret_env)}`;
  const form = { grant_type: 'client_credentials' };
  if (config.scope) form.scope = config.scope;
  const headers = { Accept: 'application/json' };
  if (config.client_auth === 'body') {
    form.client_id = clientId;
    form.client_secret = clientSecret;
  } else {
    headers.Authorization = `Basic ${base64(`${formEncode(clientId)}:${formEncode(clientSecret)}`)}`;
  }

  const issuedAt = now();
  const response = await post(config.token_url, { form, headers });
  const body = response.body;
  const answered = `Token endpoint ${config.token_url} answered ${response.status}`;
  if (!response.ok) {
    const code = body?.error; // RFC 6749 5.2
    throw new Error(
      `${answered}${typeof code === 'string' ? ` "${code}"` : ''} to the client in ` +
        `${client}; check the client credentials in ${variables}` +
        `${config.scope ? ` and the scope "${config.scope}"` : ''}.`,
    );
  }
  const token = body?.access_token;
  if (typeof token !== 'string' || !token) {
    throw new Error(`${answered} without an "access_token" string.`);
  }
  const kind = body?.token_type;
  if (kind !== undefined && (typeof kind !== 'string' || kind.toLowerCase() !== 'bearer')) {
    throw new Error(
      `${answered} with a token of type "${String(kind)}"; only bearer tokens are supported.`,
    );
  }
  return { value: token, renewAt: renewAtFor(token, issuedAt, body?.expires_in) };
}

/** `post` over the global fetch: JSON for `data`, a form for `form`. */
export async function fetchPost(url, { data, form, headers = {} }) {
  const init =
    form !== undefined
      ? {
          body: new URLSearchParams(form).toString(),
          headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
        }
      : { body: JSON.stringify(data), headers: { 'content-type': 'application/json', ...headers } };
  const response = await fetch(url, {
    method: 'POST',
    ...init,
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, body };
}

function variablesOf(auth) {
  switch (auth.type) {
    case 'none':
      return [];
    case 'login':
    case 'basic':
      return [auth.username_env, auth.password_env];
    case 'oauth2_client_credentials':
      return [auth.client_id_env, auth.client_secret_env];
    default:
      return [auth.env];
  }
}

/**
 * The credential a lane puts on every request its tool sends, for a qa-config `auth` entry:
 * `{ type, header, value, renewAt, renew }`, or null for `none`. `renew()` issues a new token and
 * answers the next credential; for a scheme without a token it answers the same one. An API key
 * sent in the query is refused: a tool's requests can carry a fixed header, not a query parameter.
 *
 *   options: { baseUrl, env, post = fetchPost, now = Date.now }
 */
export async function laneCredential(
  auth,
  { baseUrl, env = process.env, post = fetchPost, now = Date.now },
) {
  if (auth.type === 'none') return null;
  const missing = variablesOf(auth).find((name) => !env[name]?.trim());
  if (missing) throw new Error(missingVariableMessage(`Auth "${auth.type}"`, missing));
  const value = (name) => env[name];
  const fixed = (header, credential) => {
    const self = { type: auth.type, header, value: credential, renewAt: undefined };
    return { ...self, renew: async () => fixed(header, credential) };
  };
  switch (auth.type) {
    case 'api_key':
      if (auth.in !== 'header') {
        throw new Error(
          `Auth "api_key" sends the key in the query parameter "${auth.name}"; a lane can only add a ` +
            'header to the requests its tool sends.',
        );
      }
      return fixed(auth.name, value(auth.env));
    case 'bearer':
      return fixed('Authorization', `Bearer ${value(auth.env)}`);
    case 'basic':
      return fixed(
        'Authorization',
        `Basic ${base64(`${value(auth.username_env)}:${value(auth.password_env)}`)}`,
      );
    case 'login':
    case 'oauth2_client_credentials': {
      const issue = () =>
        auth.type === 'login'
          ? issueLoginToken({
              config: auth,
              url: new URL(auth.path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).href,
              username: value(auth.username_env),
              password: value(auth.password_env),
              post,
              now,
            })
          : issueOAuth2Token({
              config: auth,
              clientId: value(auth.client_id_env),
              clientSecret: value(auth.client_secret_env),
              post,
              now,
            });
      const issued = async () => {
        const token = await issue();
        return {
          type: auth.type,
          header: 'Authorization',
          value: `Bearer ${token.value}`,
          renewAt: token.renewAt,
          renew: issued,
        };
      };
      return issued();
    }
    default:
      throw new Error(`Auth "${auth.type}" is not supported by the lanes.`);
  }
}

/** The actor every pack has: the entry's own `auth`. */
export const DEFAULT_ACTOR = 'default';
/** The built-in actor that sends no credential. */
export const ANONYMOUS_ACTOR = 'anonymous';

/**
 * The `auth` of `actor` in a pack's environment entry (`packEnvironment(...)` of cli.mjs), as the
 * test runner's `actorAuth` resolves it: `default` is the entry's `auth`, `anonymous` sends nothing,
 * any other name comes from the entry's `actors`.
 */
export function actorAuthOf(environment, actor = DEFAULT_ACTOR) {
  const { config, source, name, pack } = environment;
  if (actor === DEFAULT_ACTOR) return config.auth;
  if (actor === ANONYMOUS_ACTOR) return { type: 'none' };
  const auth = config.actors?.[actor];
  if (!auth) {
    const known = [DEFAULT_ACTOR, ANONYMOUS_ACTOR, ...Object.keys(config.actors ?? {})].join(', ');
    throw new Error(
      `Actor "${actor}" is not defined in ${source} api.environments.${name}.packs.${pack}.actors. ` +
        `Known: ${known}.`,
    );
  }
  return auth;
}
