// A service pack's manifest (services/<name>/service.json): who the API is, its version, which
// fields identify people in its data, and where its contract lives.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface ServiceManifest {
  name: string;
  version: string;
  title: string;
  description?: string;
  /** Keys whose values identify a party; pseudonymized in evidence (see helpers/redact.ts). */
  identity_fields?: string[];
  /** Extra secret keys beyond the built-in baseline and the auth header. */
  secret_keys?: string[];
  /** The OpenAPI document, relative to the pack directory. */
  spec?: string;
}

export interface ServicePack extends ServiceManifest {
  /** Absolute path of the pack directory. */
  dir: string;
}

const NAME = /^[a-z][a-z0-9-]*$/;
const VERSION = /^[a-z0-9][a-z0-9.-]*$/;

export function loadService(dir: string): ServicePack {
  const file = join(dir, 'service.json');
  const manifest = JSON.parse(readFileSync(file, 'utf8')) as Partial<ServiceManifest>;
  const problems: string[] = [];
  if (!manifest.name || !NAME.test(manifest.name))
    problems.push('name must match ^[a-z][a-z0-9-]*$');
  if (!manifest.version || !VERSION.test(manifest.version)) {
    problems.push('version must match ^[a-z0-9][a-z0-9.-]*$ (it is part of every case identity)');
  }
  if (!manifest.title) problems.push('title is required');
  if (problems.length > 0) throw new Error(`${file}: ${problems.join('; ')}.`);
  return { ...(manifest as ServiceManifest), dir };
}
