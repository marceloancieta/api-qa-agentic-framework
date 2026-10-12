// Fixture: core code that stays in the core. A pack path as data, a folder named services inside
// the core, a computed import and a package import are all allowed.
import { join } from 'node:path';
import { BaseClient } from './base-client';
import { readRegistry } from '../scripts/lib/services/registry.mjs';

export const PACK_DIR = join('services', 'demo');
export const EXAMPLE = "import { PetClient } from '../services/demo/clients/pet';";

export async function loadPackModule(file: string): Promise<unknown> {
  return import(file);
}

export const parts = [BaseClient, readRegistry];
