// Shared command-line conventions for the contract tools:
//   --service <name>   a service pack; its service.json names the API description (default when the
//                      repository has exactly one pack)
//   --spec <file|url>  an explicit API description instead
//   --live             the active qa-config environment's spec_url (QA_ENV selects the environment)
// Every tool resolves its input through `resolveSpecSource`, so the flags mean the same everywhere.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

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

/** The spec_url of the active qa-config environment (qa-config.json, else the example). */
export function liveSpecUrl(root = REPO_ROOT, env = process.env) {
  const name = ['qa-config.json', 'qa-config.example.json'].find((file) =>
    existsSync(join(root, file)),
  );
  if (!name) throw new Error('No qa-config.json or qa-config.example.json found.');
  const api = JSON.parse(readFileSync(join(root, name), 'utf8')).api ?? {};
  const environment = env.QA_ENV || api.default_environment;
  const url = api.environments?.[environment]?.spec_url;
  if (!url) throw new Error(`${name}: environment "${environment}" has no spec_url.`);
  return url;
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
  if (values.live) return { source: liveSpecUrl(root, env), service };
  if (!service) {
    throw new Error(
      `Name the API with --service <name> (packs: ${packs.join(', ') || 'none'}) or --spec <file|url>.`,
    );
  }
  return { source: join(service.dir, service.spec ?? 'openapi.json'), service };
}
