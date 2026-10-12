// Runtime view of qa-config for the test runner: which environment is active and, for one service
// pack, where it lives and how to authenticate (FUT-09: `api.environments.<env>.packs.<pack>`, no
// global fallback). qa-config.json is per-machine and git-ignored; without it the tracked example
// is the effective config, which is what makes a fresh clone run against the local Petstore.
// Schema validation is `npm run config:check`'s job; this module only reads. The pack name always
// comes from the caller (a Playwright project's metadata), never from this module.

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const REPO_ROOT = resolve(__dirname, '..');

export type AuthConfig =
  | { type: 'none' }
  | { type: 'api_key'; in: 'header' | 'query'; name: string; env: string }
  | { type: 'bearer'; env: string }
  | {
      type: 'login';
      /** The login operation, relative to the pack's base URL (no leading slash). */
      path: string;
      username_env: string;
      password_env: string;
      /** The field of the login answer that holds the token; `auth_token` when omitted. */
      token_field?: string;
    };

export interface RecoveryConfig {
  command: string;
  ready_timeout_s?: number;
}

interface PackConfig {
  base_url: string;
  spec_url?: string;
  allow_writes?: boolean;
  recovery?: RecoveryConfig;
  auth: AuthConfig;
  actors?: Record<string, AuthConfig>;
}

interface QaConfigFile {
  project?: { name?: string };
  api?: {
    default_environment?: string;
    environments?: Record<string, { packs?: Record<string, PackConfig> }>;
  };
  test_management?: { provider?: string };
  tracker?: { key_pattern?: string | null; issue_url?: string | null };
}

/** What qa-config says for every pack: the source file, the environment and the tools. */
export interface QaSettings {
  /** The file the values came from, so a report can say which config a run used. */
  source: string;
  environment: string;
  testManagement: string;
  tracker: { keyPattern: string | null; issueUrl: string | null };
}

/** The settings plus one pack's entry in the active environment. */
export interface QaRuntime extends QaSettings {
  pack: string;
  baseUrl: string;
  specUrl: string | null;
  allowWrites: boolean;
  recovery: RecoveryConfig | null;
  /** The credential of the built-in `default` actor. */
  auth: AuthConfig;
  /** Named credentials from the pack's `actors`, without the built-in `default` and `anonymous`. */
  actors: Record<string, AuthConfig>;
}

/**
 * Load the variables from the local env file into `process.env`. Variables already set in the real
 * environment win, so CI secrets are never shadowed by a stray local file. A missing file is normal.
 */
export function loadLocalEnvFile(): void {
  try {
    process.loadEnvFile(join(REPO_ROOT, '.env'));
  } catch {
    // No local env file: everything comes from the real environment.
  }
}

function readConfigFile(root: string): { file: QaConfigFile; source: string } {
  for (const name of ['qa-config.json', 'qa-config.example.json']) {
    let text: string;
    try {
      text = readFileSync(join(root, name), 'utf8');
    } catch {
      continue;
    }
    return { file: JSON.parse(text) as QaConfigFile, source: name };
  }
  throw new Error(
    `No qa-config.json or qa-config.example.json in ${root}. Copy the example and adjust it.`,
  );
}

/**
 * The variable that overrides one of a pack's URLs for a one-off run:
 * `packVariable('petstore', 'BASE_URL')` is `QA_PETSTORE_BASE_URL` (hyphens become underscores).
 */
export function packVariable(pack: string, setting: 'BASE_URL' | 'SPEC_URL'): string {
  return `QA_${pack.toUpperCase().replace(/-/g, '_')}_${setting}`;
}

function selectEnvironment(file: QaConfigFile, source: string, env: NodeJS.ProcessEnv) {
  const api = file.api ?? {};
  const environment = env.QA_ENV || api.default_environment || '';
  const selected = api.environments?.[environment];
  if (!selected) {
    const known = Object.keys(api.environments ?? {}).join(', ') || '(none)';
    throw new Error(`${source}: environment "${environment}" is not defined. Known: ${known}.`);
  }
  return { environment, packs: selected.packs ?? {} };
}

/** The settings shared by every pack. QA_ENV picks the environment. */
export function loadSettings(env: NodeJS.ProcessEnv = process.env, root = REPO_ROOT): QaSettings {
  const { file, source } = readConfigFile(root);
  const { environment } = selectEnvironment(file, source, env);
  return {
    source,
    environment,
    testManagement: file.test_management?.provider ?? 'allure-report',
    tracker: {
      keyPattern: file.tracker?.key_pattern ?? null,
      issueUrl: file.tracker?.issue_url ?? null,
    },
  };
}

/** The packs the active environment configures, by name. */
export function configuredPacks(env: NodeJS.ProcessEnv = process.env, root = REPO_ROOT): string[] {
  const { file, source } = readConfigFile(root);
  return Object.keys(selectEnvironment(file, source, env).packs);
}

/**
 * One pack in the active environment. A pack the environment does not configure is an error that
 * names the environment and the packs it does configure; there is no global fallback.
 * QA_<PACK>_BASE_URL and QA_<PACK>_SPEC_URL override the pack's URLs for a one-off run.
 */
export function loadRuntime(
  pack: string,
  env: NodeJS.ProcessEnv = process.env,
  root = REPO_ROOT,
): QaRuntime {
  const { file, source } = readConfigFile(root);
  const { environment, packs } = selectEnvironment(file, source, env);
  const selected = packs[pack];
  if (!selected) {
    const known = Object.keys(packs).join(', ') || '(none)';
    throw new Error(
      `${source}: environment "${environment}" has no entry for pack "${pack}" ` +
        `(api.environments.${environment}.packs.${pack}). Configured packs: ${known}.`,
    );
  }
  return {
    ...loadSettings(env, root),
    pack,
    baseUrl: (env[packVariable(pack, 'BASE_URL')] || selected.base_url).replace(/\/+$/, ''),
    specUrl: env[packVariable(pack, 'SPEC_URL')] || selected.spec_url || null,
    allowWrites: selected.allow_writes ?? false,
    recovery: selected.recovery ?? null,
    auth: selected.auth,
    actors: selected.actors ?? {},
  };
}

export const DEFAULT_ACTOR = 'default';
export const ANONYMOUS_ACTOR = 'anonymous';

/** The credential an actor uses: `default` is the pack's `auth`, `anonymous` sends none. */
export function actorAuth(qa: QaRuntime, name: string): AuthConfig {
  if (name === DEFAULT_ACTOR) return qa.auth;
  if (name === ANONYMOUS_ACTOR) return { type: 'none' };
  const auth = qa.actors[name];
  if (!auth) {
    const known = [DEFAULT_ACTOR, ANONYMOUS_ACTOR, ...Object.keys(qa.actors)].join(', ');
    throw new Error(
      `Actor "${name}" is not defined in ${qa.source} ` +
        `api.environments.${qa.environment}.packs.${qa.pack}.actors. Known: ${known}.`,
    );
  }
  return auth;
}

/** Environment variable names the active auth needs. Names only: values never leave the process. */
export function requiredEnvVars(auth: AuthConfig): string[] {
  if (auth.type === 'none') return [];
  return auth.type === 'login' ? [auth.username_env, auth.password_env] : [auth.env];
}

/** Names from `names` that are unset or blank. A blank value is a broken binding, not a value. */
export function missingEnvVars(names: string[], env: NodeJS.ProcessEnv = process.env): string[] {
  return names.filter((name) => !env[name]?.trim());
}
