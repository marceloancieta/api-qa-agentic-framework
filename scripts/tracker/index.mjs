// The configured tracker (qa-config tracker.provider), verified on every write. `none` returns null:
// callers treat a missing tracker as "tracker features off", never as an error.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../lib/cli.mjs';
import { verifiedTracker } from './tracker.mjs';

const MODULES = {
  local: () => import('./adapters/local.mjs'),
  github: () => import('./adapters/github.mjs'),
  jira: () => import('./adapters/jira.mjs'),
};

export function trackerConfig(root = REPO_ROOT) {
  const file = ['qa-config.json', 'qa-config.example.json'].find((name) =>
    existsSync(join(root, name)),
  );
  if (!file) throw new Error('No qa-config.json or qa-config.example.json found.');
  return JSON.parse(readFileSync(join(root, file), 'utf8')).tracker ?? {};
}

export async function loadTracker(config, context = {}) {
  const provider = config.provider ?? 'none';
  if (provider === 'none') return null;
  const load = MODULES[provider];
  if (!load)
    throw new Error(
      `Unknown tracker provider "${provider}". Known: none, ${Object.keys(MODULES).join(', ')}.`,
    );
  const adapter = (await load()).createTracker(config.options ?? {}, {
    ...context,
    baseUrl: config.base_url,
  });
  return verifiedTracker(adapter, context.log);
}
