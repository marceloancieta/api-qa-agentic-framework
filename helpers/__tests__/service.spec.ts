import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { loadService } from '../service';

function packWith(manifest: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'pack-'));
  writeFileSync(join(dir, 'service.json'), JSON.stringify(manifest));
  return dir;
}

test('a valid manifest loads with its directory', () => {
  const dir = packWith({ name: 'shop', version: 'v1.2', title: 'Shop' });
  expect(loadService(dir)).toEqual({ name: 'shop', version: 'v1.2', title: 'Shop', dir });
});

test('every manifest problem is reported at once', () => {
  const dir = packWith({ name: 'Shop', version: '' });
  expect(() => loadService(dir)).toThrow(/name must match.*version must match.*title is required/);
});
