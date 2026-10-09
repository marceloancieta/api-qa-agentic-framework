// Runtime view of qa-config for the test runner: which environment is active, where it lives and
// how to authenticate. qa-config.json is per-machine and git-ignored; without it the tracked example
// is the effective config, which is what makes a fresh clone run against the local Petstore.
// Schema validation is `npm run config:check`'s job; this module only reads.

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const REPO_ROOT = resolve(__dirname, '..');

export type AuthConfig =
  | { type: 'none' }
  | { type: 'api_key'; in: 'header' | 'query'; name: string; env: string }
  | { type: 'bearer'; env: string };

interface EnvironmentConfig {
  base_url: string;
  spec_url?: string;
  allow_writes?: boolean;
}

interface QaConfigFile {
  project?: { name?: string };
  api?: {
    default_environment?: string;
    environments?: Record<string, EnvironmentConfig>;
    auth?: AuthConfig;
  };
  test_management?: { provider?: string };
}

export interface QaRuntime {
  /** The file the values came from, so a report can say which config a run used. */
  source: string;
  environment: string;
  baseUrl: string;
  specUrl: string | null;
  allowWrites: boolean;
  auth: AuthConfig;
  testManagement: string;
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

/** QA_ENV picks the environment and API_BASE_URL overrides its base URL for a one-off run. */
export function loadRuntime(env: NodeJS.ProcessEnv = process.env, root = REPO_ROOT): QaRuntime {
  const { file, source } = readConfigFile(root);
  const api = file.api ?? {};
  const environment = env.QA_ENV || api.default_environment || '';
  const selected = api.environments?.[environment];
  if (!selected) {
    const known = Object.keys(api.environments ?? {}).join(', ') || '(none)';
    throw new Error(`${source}: environment "${environment}" is not defined. Known: ${known}.`);
  }
  return {
    source,
    environment,
    baseUrl: (env.API_BASE_URL || selected.base_url).replace(/\/+$/, ''),
    specUrl: selected.spec_url ?? null,
    allowWrites: selected.allow_writes ?? false,
    auth: api.auth ?? { type: 'none' },
    testManagement: file.test_management?.provider ?? 'allure-report',
  };
}

/** Environment variable names the active auth needs. Names only: values never leave the process. */
export function requiredEnvVars(auth: AuthConfig): string[] {
  return auth.type === 'none' ? [] : [auth.env];
}

/** Names from `names` that are unset or blank. A blank value is a broken binding, not a value. */
export function missingEnvVars(names: string[], env: NodeJS.ProcessEnv = process.env): string[] {
  return names.filter((name) => !env[name]?.trim());
}
