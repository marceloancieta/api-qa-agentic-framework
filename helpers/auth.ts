// Authentication strategies, selected by a pack's `auth.type` in qa-config (Strategy pattern). A
// strategy only decorates an outgoing request; clients never know which scheme is in use. A scheme
// that sends the secret of one variable as it is is a new entry in `factories`; one that needs a
// credential pair or keeps state gets its own builder in `createAuth`. Either way it also needs its
// branch in the qa-config schema.
//
// `basic` sends a username and password as `Authorization: Basic` (RFC 7617) on every request.
//
// `login` (FUT-07) and `oauth2_client_credentials` (FUT-04) obtain a token before the first request
// they decorate: `login` from the API's own login operation, the OAuth2 one from a token endpoint
// with the client credentials grant (RFC 6749 4.4). Both reuse the token and request a new one when
// a request carrying it is answered 401 (an expired token); the OAuth2 one also renews it shortly
// before its `expires_in` runs out. The token exchange is never recorded as evidence: it carries
// the credentials and returns the token.

import type { APIRequestContext } from '@playwright/test';
import type { AuthConfig } from './config';
import { missingEnvVars, requiredEnvVars } from './config';

export type QueryParams = Record<string, string | number | boolean>;

export interface OutgoingRequest {
  headers: Record<string, string>;
  params: QueryParams;
}

export interface AuthStrategy {
  readonly type: AuthConfig['type'];
  /** Header and query names this strategy fills, so evidence can mask them whatever they are called. */
  readonly secretKeys: readonly string[];
  /** Decorate a request. `context` is the sending client's, for a strategy that must log in first. */
  apply(request: OutgoingRequest, context?: APIRequestContext): void | Promise<void>;
  /**
   * After a 401 to `request`: replace the credential this strategy put on it and answer true when
   * the request should be sent once more. A credential the caller set itself is never replaced.
   */
  refresh?(request: OutgoingRequest, context?: APIRequestContext): Promise<boolean>;
}

export interface AuthOptions {
  /** The clock token lifetimes are measured on, in milliseconds; `Date.now` when omitted. */
  now?: () => number;
}

function headerKey(headers: Record<string, string>, name: string): string | undefined {
  const wanted = name.toLowerCase();
  return Object.keys(headers).find((key) => key.toLowerCase() === wanted);
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  return headerKey(headers, name) !== undefined;
}

// An explicit caller value is never overwritten, which lets a spec send a deliberately bad credential.
function setHeader(headers: Record<string, string>, name: string, value: string): void {
  if (!hasHeader(headers, name)) headers[name] = value;
}

const base64 = (text: string): string => Buffer.from(text, 'utf8').toString('base64');

// application/x-www-form-urlencoded, which RFC 6749 2.3.1 applies to each half of a client's
// Basic credential before it is encoded.
const formEncode = (value: string): string =>
  new URLSearchParams([['', value]]).toString().slice(1);

export const noAuth: AuthStrategy = {
  type: 'none',
  secretKeys: [],
  apply: () => {},
};

type LoginConfig = Extract<AuthConfig, { type: 'login' }>;
type OAuth2Config = Extract<AuthConfig, { type: 'oauth2_client_credentials' }>;
/** Schemes that send the secret of one variable as it is: the ones `factories` builds. */
type SecretConfig = Extract<AuthConfig, { env: string }>;
type Factory<T extends SecretConfig> = (config: T, secret: string) => AuthStrategy;

/** A token, and the time on the strategy's clock from which it is renewed; without one, at a 401. */
interface Issued {
  value: string;
  renewAt?: number;
}

/**
 * What the token strategies share: get a token from `issue` for the first request, shared by
 * concurrent first requests, and send it as `Authorization: Bearer <token>`. It is renewed once the
 * clock reaches its `renewAt`, and after a 401 to a request that carried it. A failed `issue` is
 * not cached: the next request tries again.
 *
 * A 401 can also come back for a token that was replaced while the request was in flight (renewed
 * at its `renewAt`, or by a concurrent 401). The strategy remembers every token it issued, so such a
 * request is sent again with the token now in use, and concurrent 401s to one token share a single
 * renewal instead of each asking for its own.
 */
function tokenStrategy(
  type: AuthConfig['type'],
  issue: (context: APIRequestContext) => Promise<Issued>,
  now: () => number,
): AuthStrategy {
  let pending: Promise<Issued> | null = null;
  let current: Issued | null = null;
  const issuedValues = new Set<string>();

  const token = async (context?: APIRequestContext): Promise<string> => {
    if (!context) throw new Error(`The ${type} strategy needs the request context of the client.`);
    if (current?.renewAt !== undefined && now() >= current.renewAt) {
      pending = null;
      current = null;
    }
    pending ??= issue(context).then(
      (issued) => {
        current = issued;
        issuedValues.add(issued.value);
        return issued;
      },
      (error: unknown) => {
        pending = null; // a failed request is retried by the next one, not cached
        throw error;
      },
    );
    return (await pending).value;
  };

  return {
    type,
    secretKeys: ['authorization'],
    apply: async (request, context) => {
      if (hasHeader(request.headers, 'Authorization')) return; // the caller's own credential
      request.headers['Authorization'] = `Bearer ${await token(context)}`;
    },
    refresh: async (request, context) => {
      const key = headerKey(request.headers, 'Authorization');
      const sent = key ? /^Bearer (.+)$/.exec(request.headers[key] ?? '')?.[1] : undefined;
      // Only a token this strategy issued; a credential the caller set is answered as it is.
      if (!key || sent === undefined || !issuedValues.has(sent)) return false;
      if (sent === current?.value) {
        pending = null;
        current = null;
      }
      const renewed = await token(context);
      if (renewed === sent) return false;
      request.headers[key] = `Bearer ${renewed}`;
      return true;
    },
  };
}

/** `basic`: `Authorization: Basic base64(username:password)` on every request. */
function basicStrategy(username: string, password: string): AuthStrategy {
  const credential = `Basic ${base64(`${username}:${password}`)}`;
  return {
    type: 'basic',
    secretKeys: ['authorization'],
    apply: (request) => setHeader(request.headers, 'Authorization', credential),
  };
}

/**
 * `login`: POST `{ username, password }` to `config.path` (relative to the pack's base URL), read
 * the token from `config.token_field` of the answer and send it as a bearer token until a 401.
 */
function loginStrategy(config: LoginConfig, username: string, password: string): AuthStrategy {
  const field = config.token_field ?? 'auth_token';
  const issue = async (context: APIRequestContext): Promise<Issued> => {
    const response = await context.post(config.path, { data: { username, password } });
    const body: unknown = await response.json().catch(() => null);
    const token = (body as Record<string, unknown> | null)?.[field];
    if (!response.ok() || typeof token !== 'string' || !token) {
      throw new Error(
        `Login at ${config.path} as the user in ${config.username_env} answered ` +
          `${response.status()} without a "${field}" string; check the credentials in ` +
          `${config.username_env} and ${config.password_env}.`,
      );
    }
    return { value: token };
  };
  return tokenStrategy('login', issue, () => Date.now());
}

/**
 * `oauth2_client_credentials`: POST the client credentials grant as a form to `config.token_url`
 * (absolute, so it overrides the client's base URL), authenticating the client with HTTP Basic or
 * with form fields as `config.client_auth` says. The `access_token` of the answer must be a bearer
 * token; with `expires_in` it is renewed a margin of 10% of its lifetime, at most 30 s, before it
 * expires, and without it at the first 401.
 */
function oauth2Strategy(
  config: OAuth2Config,
  clientId: string,
  clientSecret: string,
  now: () => number,
): AuthStrategy {
  const variables = `${config.client_id_env} and ${config.client_secret_env}`;
  const issue = async (context: APIRequestContext): Promise<Issued> => {
    const form: Record<string, string> = { grant_type: 'client_credentials' };
    if (config.scope) form['scope'] = config.scope;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (config.client_auth === 'body') {
      form['client_id'] = clientId;
      form['client_secret'] = clientSecret;
    } else {
      headers['Authorization'] =
        `Basic ${base64(`${formEncode(clientId)}:${formEncode(clientSecret)}`)}`;
    }

    const requested = now();
    const response = await context.post(config.token_url, { form, headers });
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    const answered = `Token endpoint ${config.token_url} answered ${response.status()}`;
    if (!response.ok()) {
      const code = body?.['error']; // RFC 6749 5.2
      throw new Error(
        `${answered}${typeof code === 'string' ? ` "${code}"` : ''} to the client in ` +
          `${config.client_id_env}; check the client credentials in ${variables}` +
          `${config.scope ? ` and the scope "${config.scope}"` : ''}.`,
      );
    }
    const token = body?.['access_token'];
    if (typeof token !== 'string' || !token) {
      throw new Error(`${answered} without an "access_token" string.`);
    }
    const kind = body?.['token_type'];
    if (kind !== undefined && (typeof kind !== 'string' || kind.toLowerCase() !== 'bearer')) {
      throw new Error(
        `${answered} with a token of type "${String(kind)}"; only bearer tokens are supported.`,
      );
    }
    const seconds = body?.['expires_in'];
    if (typeof seconds !== 'number' || !(seconds > 0)) return { value: token };
    const margin = Math.min(30, seconds / 10);
    return { value: token, renewAt: requested + (seconds - margin) * 1000 };
  };
  return tokenStrategy('oauth2_client_credentials', issue, now);
}

const factories: { [K in SecretConfig['type']]: Factory<Extract<SecretConfig, { type: K }>> } = {
  api_key: (config, secret) => ({
    type: 'api_key',
    secretKeys: [config.name],
    apply: (request) => {
      if (config.in === 'header') setHeader(request.headers, config.name, secret);
      else if (!(config.name in request.params)) request.params[config.name] = secret;
    },
  }),
  bearer: (_config, secret) => ({
    type: 'bearer',
    secretKeys: ['authorization'],
    apply: (request) => setHeader(request.headers, 'Authorization', `Bearer ${secret}`),
  }),
};

/**
 * Build the strategy for `config`, reading its secrets from the variables the config names. A
 * missing secret fails here, by variable name, instead of later as a puzzling 401.
 */
export function createAuth(
  config: AuthConfig,
  env: NodeJS.ProcessEnv = process.env,
  options: AuthOptions = {},
): AuthStrategy {
  const [missing] = missingEnvVars(requiredEnvVars(config), env);
  if (missing) {
    throw new Error(
      `Auth "${config.type}" needs the environment variable ${missing}, which is not set.`,
    );
  }
  const value = (name: string): string => env[name] as string;
  switch (config.type) {
    case 'none':
      return noAuth;
    case 'basic':
      return basicStrategy(value(config.username_env), value(config.password_env));
    case 'login':
      return loginStrategy(config, value(config.username_env), value(config.password_env));
    case 'oauth2_client_credentials':
      return oauth2Strategy(
        config,
        value(config.client_id_env),
        value(config.client_secret_env),
        options.now ?? (() => Date.now()),
      );
    default: {
      const factory = factories[config.type] as Factory<typeof config>;
      return factory(config, value(config.env));
    }
  }
}
