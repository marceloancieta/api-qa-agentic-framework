// Fixture: a core script. It reads pack files by path (allowed) and once requires one (reported).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const enums = require('../services/demo/generated/enums.json'); // expect-finding: core-imports-pack

const ADAPTERS = { local: () => import('./adapters/local.mjs') };

export function readService(root, pack) {
  return JSON.parse(readFileSync(join(root, 'services', pack, 'service.json'), 'utf8'));
}

export { ADAPTERS, enums };
