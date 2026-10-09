// Authentication strategies, selected by qa-config `api.auth.type` (Strategy pattern). A strategy
// only decorates an outgoing request; clients never know which scheme is in use. A new scheme is a
// new entry in `factories`, plus its branch in the qa-config schema.

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
  apply(request: OutgoingRequest): void;
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  const wanted = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === wanted);
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

type Factory<T extends AuthConfig> = (config: T, secret: string) => AuthStrategy;

const factories: { [K in AuthConfig['type']]: Factory<Extract<AuthConfig, { type: K }>> } = {
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
  const [missing] = missingEnvVars([config.env], env);
  if (missing) {
    throw new Error(
      `Auth "${config.type}" needs the environment variable ${missing}, which is not set.`,
    );
  }
  const secret = env[config.env] as string;
  const factory = factories[config.type] as Factory<typeof config>;
  return factory(config, secret);
}
