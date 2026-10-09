// Fixture: work done while the spec is imported (module-scope-io).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { request } from '@playwright/test';
import { test, expect } from '../fixtures';
import { loadService } from '../../../helpers/service';

const manifest = JSON.parse(readFileSync(join(__dirname, 'service.json'), 'utf8')); // expect-finding: module-scope-io
const service = loadService(__dirname); // expect-finding: module-scope-io
const fromText = JSON.parse(process.argv[2] ?? '{}'); // expect-finding: module-scope-io
const context = await request.newContext(); // expect-finding: module-scope-io
const constant = JSON.parse('{"limit": 3}');
const fileName = join(__dirname, 'data.json');

process.loadEnvFile(); // expect-finding: module-scope-io

test.describe('collection time', () => {
  const rows = readFileSync(fileName, 'utf8').split('\n'); // expect-finding: module-scope-io

  test.beforeAll(async () => {
    readFileSync(fileName, 'utf8');
  });

  test('reads inside the body run with the case', async () => {
    const data = JSON.parse(readFileSync(fileName, 'utf8'));
    const response = await fetch('http://localhost:8080/api/v3/store/inventory');
    expect(data).toBeTruthy();
    expect(response.ok).toBe(true);
    expect(rows.length + constant.limit).toBeGreaterThan(0);
    expect([manifest, service, fromText, context]).toHaveLength(4);
  });
});

function later() {
  return readFileSync(fileName, 'utf8');
}

export { later };
