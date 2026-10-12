// Shared command-line conventions for the contract tools:
//   --service <name>   a service pack; its service.json names the API description (default when the
//                      repository has exactly one pack)
//   --spec <file|url>  an explicit API description instead
//   --live             the pack's spec_url in the active qa-config environment (QA_ENV selects the
//                      environment; QA_<PACK>_SPEC_URL overrides it)
// Every tool resolves its input through `resolveSpecSource`, so the flags mean the same everywhere.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

/**
 * A text file's content, or null when it does not exist. Reading and treating a missing file as a
 * normal outcome in one step leaves no gap between a check and the use that follows it.
 */
export function readTextIfExists(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export const REPO_ROOT = resolve(import.meta.dirname, '..', '..');

const SPEC_OPTIONS = {
  service: { type: 'string' },
  spec: { type: 'string' },
  live: { type: 'boolean', default: false },
};

/** Parse argv with the shared spec options plus the tool's own. Unknown flags fail. */
export function parseCli(options = {}, argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: { ...SPEC_OPTIONS, ...options },
    allowPositionals: false,
  });
  return { ...values }; // a plain object: parseArgs returns one without a prototype
}

/** Names of the service packs (directories under services/ with a service.json). */
export function servicePacks(root = REPO_ROOT) {
  const dir = join(root, 'services');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(dir, entry.name, 'service.json')))
    .map((entry) => entry.name)
    .sort();
}

export function readService(name, root = REPO_ROOT) {
  const dir = join(root, 'services', name);
  const file = join(dir, 'service.json');
  if (!existsSync(file)) throw new Error(`No service pack "${name}" (missing ${file}).`);
  return { ...JSON.parse(readFileSync(file, 'utf8')), dir };
}

/**
 * The variable that overrides one of a pack's URLs for a one-off run:
 * `packVariable('petstore', 'BASE_URL')` is `QA_PETSTORE_BASE_URL`. helpers/config.ts applies the
 * same rule for the test runner; a unit test keeps the two equal.
 */
export function packVariable(pack, setting) {
  return `QA_${pack.toUpperCase().replace(/-/g, '_')}_${setting}`;
}

/**
 * The active qa-config environment (qa-config.json, else the example; QA_ENV selects it):
 * `{ source, name, packs }` where `packs` maps each configured pack to its entry as written.
 */
export function activeEnvironment(root = REPO_ROOT, env = process.env) {
  const source = ['qa-config.json', 'qa-config.example.json'].find((file) =>
    existsSync(join(root, file)),
  );
  if (!source) throw new Error('No qa-config.json or qa-config.example.json found.');
  const api = JSON.parse(readFileSync(join(root, source), 'utf8')).api ?? {};
  const name = env.QA_ENV || api.default_environment;
  const config = api.environments?.[name];
  if (!config) throw new Error(`${source}: environment "${name}" is not defined.`);
  return { source, name, packs: config.packs ?? {} };
}

/**
 * One pack in the active environment: `{ source, name, pack, config, baseUrl, specUrl }`, where
 * `config` is the pack's entry as written and the URLs carry the QA_<PACK>_* overrides. A pack the
 * environment does not configure is an error; there is no global fallback.
 */
export function packEnvironment(pack, root = REPO_ROOT, env = process.env) {
  const { source, name, packs } = activeEnvironment(root, env);
  const config = packs[pack];
  if (!config) {
    throw new Error(
      `${source}: environment "${name}" has no entry for pack "${pack}" ` +
        `(api.environments.${name}.packs.${pack}). Configured packs: ${Object.keys(packs).join(', ') || '(none)'}.`,
    );
  }
  return {
    source,
    name,
    pack,
    config,
    baseUrl: (env[packVariable(pack, 'BASE_URL')] || config.base_url).replace(/\/+$/, ''),
    specUrl: env[packVariable(pack, 'SPEC_URL')] || config.spec_url || null,
  };
}

/** The pack's spec_url in the active qa-config environment; QA_<PACK>_SPEC_URL overrides it. */
export function liveSpecUrl(pack, root = REPO_ROOT, env = process.env) {
  const { source, name, specUrl } = packEnvironment(pack, root, env);
  if (!specUrl)
    throw new Error(`${source}: pack "${pack}" in environment "${name}" has no spec_url.`);
  return specUrl;
}

/**
 * Where the API description comes from, and which pack it belongs to:
 * `{ source, service }` where `source` is a file path or URL and `service` may be null.
 */
export function resolveSpecSource(values, root = REPO_ROOT, env = process.env) {
  const chosen = ['spec', 'live'].filter((flag) => values[flag]);
  if (chosen.length > 1) throw new Error('Use only one of --spec and --live.');
  const packs = servicePacks(root);
  const serviceName = values.service ?? (packs.length === 1 ? packs[0] : null);
  const service = serviceName ? readService(serviceName, root) : null;
  if (values.spec) return { source: values.spec, service };
  if (values.live) {
    if (!serviceName) {
      throw new Error(`--live needs --service <name> (packs: ${packs.join(', ') || 'none'}).`);
    }
    return { source: liveSpecUrl(serviceName, root, env), service };
  }
  if (!service) {
    throw new Error(
      `Name the API with --service <name> (packs: ${packs.join(', ') || 'none'}) or --spec <file|url>.`,
    );
  }
  return { source: join(service.dir, service.spec ?? 'openapi.json'), service };
}
