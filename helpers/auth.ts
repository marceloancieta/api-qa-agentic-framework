// Authentication strategies, selected by a pack's `auth.type` in qa-config (Strategy pattern). A
// strategy only decorates an outgoing request; clients never know which scheme is in use. A new
// scheme is a new entry in `factories`, plus its branch in the qa-config schema.
//
// `login` (FUT-07) is the one strategy that calls the API itself: it mints a token from credentials
// on the first request it decorates, reuses it, and mints a new one when a request it decorated is
// answered 401 (an expired token). The login exchange is never recorded as evidence: it carries the
// password and returns the token.

import type { APIRequestContext } from '@playwright/test';
import type { AuthConfig } from './config';
import { missingEnvVars } from './config';

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

export const noAuth: AuthStrategy = {
  type: 'none',
  secretKeys: [],
  apply: () => {},
};

type LoginConfig = Extract<AuthConfig, { type: 'login' }>;
type SecretConfig = Exclude<AuthConfig, LoginConfig>;
type Factory<T extends SecretConfig> = (config: T, secret: string) => AuthStrategy;

/**
 * `login`: POST `{ username, password }` to `config.path` (relative to the pack's base URL), read
 * the token from `config.token_field` of the answer and send it as `Authorization: Bearer <token>`.
 * Concurrent first requests share one login.
 */
function loginStrategy(config: LoginConfig, username: string, password: string): AuthStrategy {
  const field = config.token_field ?? 'auth_token';
  let pending: Promise<string> | null = null;
  let current: string | null = null;

  const mint = async (context: APIRequestContext): Promise<string> => {
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
    current = token;
    return token;
  };
  const token = (context?: APIRequestContext): Promise<string> => {
    if (!context) throw new Error('The login strategy needs the request context of the client.');
    pending ??= mint(context).catch((error: unknown) => {
      pending = null; // a failed login is retried by the next request, not cached
      throw error;
    });
    return pending;
  };

  return {
    type: 'login',
    secretKeys: ['authorization'],
    apply: async (request, context) => {
      if (hasHeader(request.headers, 'Authorization')) return; // the caller's own credential
      request.headers['Authorization'] = `Bearer ${await token(context)}`;
    },
    refresh: async (request, context) => {
      const key = headerKey(request.headers, 'Authorization');
      if (!key || current === null || request.headers[key] !== `Bearer ${current}`) return false;
      pending = null;
      current = null;
      request.headers[key] = `Bearer ${await token(context)}`;
      return true;
    },
  };
}

const factories: { [K in SecretConfig['type']]: Factory<Extract<SecretConfig, { type: K }>> } = {
  none: () => noAuth,
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
 * Build the strategy for `config`, reading its secret from the variable the config names. A missing
 * secret fails here, by variable name, instead of later as a puzzling 401.
 */
export function createAuth(config: AuthConfig, env: NodeJS.ProcessEnv = process.env): AuthStrategy {
  if (config.type === 'none') return noAuth;
  const names = config.type === 'login' ? [config.username_env, config.password_env] : [config.env];
  const [missing] = missingEnvVars(names, env);
  if (missing) {
    throw new Error(
      `Auth "${config.type}" needs the environment variable ${missing}, which is not set.`,
    );
  }
  if (config.type === 'login') {
    return loginStrategy(
      config,
      env[config.username_env] as string,
      env[config.password_env] as string,
    );
  }
  const secret = env[config.env] as string;
  const factory = factories[config.type] as Factory<typeof config>;
  return factory(config, secret);
}
