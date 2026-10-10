// Credentials for tools that call services (test management, trackers). They come from environment
// variables named in qa-config, never from the command line (L-43). A local env file at the repo
// root fills in what the real environment does not set: CI secrets always win over a stray file.

import { join } from 'node:path';
import { REPO_ROOT } from './cli.mjs';

/** Load the repo's local env file into process.env, keeping variables already set. Missing is normal. */
export function loadLocalEnv(root = REPO_ROOT) {
  try {
    process.loadEnvFile(join(root, '.env'));
  } catch {
    // No local env file: everything comes from the real environment.
  }
}

/** The value of an environment variable a tool needs, or an error naming it (never its value). */
export function credential(env, name, why) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${why} needs the environment variable ${name}, which is not set.`);
  return value;
}
