// Read-only, dependency-free access to qa-config for hooks.
//
// Hooks run before `npm ci` may have happened, so this never imports a package: it parses the JSON
// and fills defaults. Schema validation is `npm run config:check`'s job, not a hook's. qa-config.json
// is per-machine and git-ignored; when it is absent the tracked example is the effective config.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DEFAULT_POLICIES = {
  commit: {
    require_tracker_key: false,
    max_tracker_keys: 1,
    conventional_commits: false,
    protected_branches: [],
  },
  pull_request: { required_labels: [] },
};

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/** @returns {{ config: object, source: string | null }} source is the file read, null if none. */
export function loadConfig(root) {
  for (const name of ['qa-config.json', 'qa-config.example.json']) {
    const config = readJson(join(root, name));
    if (config && typeof config === 'object') return { config, source: name };
  }
  return { config: {}, source: null };
}

export function commitPolicy(config) {
  return { ...DEFAULT_POLICIES.commit, ...(config?.policies?.commit ?? {}) };
}

export function pullRequestPolicy(config) {
  return { ...DEFAULT_POLICIES.pull_request, ...(config?.policies?.pull_request ?? {}) };
}

/** The tracker-key regex, or null when unset or invalid (an invalid pattern disables the rule). */
export function trackerKeyRegex(config) {
  const pattern = config?.tracker?.key_pattern;
  if (typeof pattern !== 'string' || !pattern) return null;
  try {
    return new RegExp(pattern, 'g');
  } catch {
    return null;
  }
}

/**
 * The variable that overrides one of a pack's URLs: `QA_PETSTORE_BASE_URL` for `petstore`, hyphens
 * become underscores. The same rule as `packVariable` in helpers/config.ts, kept here because hooks
 * import nothing from the core.
 */
export function packVariable(pack, setting) {
  return `QA_${pack.toUpperCase().replace(/-/g, '_')}_${setting}`;
}

/**
 * The active environment (QA_ENV overrides api.default_environment) and the packs it configures,
 * each with its base URL after the QA_<PACK>_BASE_URL override.
 * @returns {{ name: string, packs: { name: string, baseUrl: string }[] }}
 */
export function activeEnvironment(config) {
  const api = config?.api ?? {};
  const name = process.env.QA_ENV || api.default_environment || '';
  const packs = api.environments?.[name]?.packs ?? {};
  return {
    name,
    packs: Object.entries(packs).map(([pack, settings]) => ({
      name: pack,
      baseUrl: process.env[packVariable(pack, 'BASE_URL')] || settings?.base_url || '',
    })),
  };
}
