// Types for scripts/lib/auth-tokens.mjs.

import type { AuthConfig } from '../../helpers/config';

export interface PostAnswer {
  ok: boolean;
  status: number;
  body: Record<string, unknown> | null;
}

export type Post = (
  url: string,
  request: { data?: unknown; form?: Record<string, string>; headers: Record<string, string> },
) => Promise<PostAnswer>;

export interface Issued {
  value: string;
  /** When the token is due for renewal, in ms on the clock passed in; undefined: at a 401. */
  renewAt?: number;
}

export interface LaneCredential {
  type: AuthConfig['type'];
  header: string;
  value: string;
  renewAt?: number;
  renew(): Promise<LaneCredential>;
}

export function base64(text: string): string;
export function formEncode(value: string): string;
export function jwtExpiry(token: string): number | undefined;
export function renewAtFor(
  token: string,
  issuedAt: number,
  expiresInSeconds?: unknown,
): number | undefined;
export function issueLoginToken(options: {
  config: Extract<AuthConfig, { type: 'login' }>;
  url: string;
  username: string;
  password: string;
  post: Post;
  now?: () => number;
}): Promise<Issued>;
export function issueOAuth2Token(options: {
  config: Extract<AuthConfig, { type: 'oauth2_client_credentials' }>;
  clientId: string;
  clientSecret: string;
  post: Post;
  now?: () => number;
}): Promise<Issued>;
export function fetchPost(
  url: string,
  request: { data?: unknown; form?: Record<string, string>; headers?: Record<string, string> },
): Promise<PostAnswer>;
export function laneCredential(
  auth: AuthConfig,
  options: { baseUrl: string; env?: NodeJS.ProcessEnv; post?: Post; now?: () => number },
): Promise<LaneCredential | null>;

export const DEFAULT_ACTOR: 'default';
export const ANONYMOUS_ACTOR: 'anonymous';
export function actorAuthOf(
  environment: {
    config: { auth: AuthConfig; actors?: Record<string, AuthConfig> };
    source: string;
    name: string;
    pack: string;
  },
  actor?: string,
): AuthConfig;
