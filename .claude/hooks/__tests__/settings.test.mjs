// The permission deny list of .claude/settings.json, the layer in front of secret-guard: a secret
// file Claude Code may not read must not be writable either, so every `Read(<pattern>)` has its
// `Edit(<pattern>)`, and environment dumps stay denied.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SETTINGS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'settings.json');
const deny = JSON.parse(readFileSync(SETTINGS, 'utf8')).permissions.deny;
const patterns = (tool) =>
  deny.filter((rule) => rule.startsWith(`${tool}(`)).map((rule) => rule.slice(tool.length + 1, -1));

test('every file denied to Read is denied to Edit, and the other way round', () => {
  assert.ok(patterns('Read').length > 0);
  assert.deepEqual(patterns('Edit').sort(), patterns('Read').sort());
});

test('the secret files and the environment dumps stay denied', () => {
  for (const pattern of ['**/.env', '**/.env.local', '**/.env.*.local', '**/*.key', '**/*.pem']) {
    assert.ok(patterns('Read').includes(pattern), pattern);
  }
  for (const command of ['printenv', 'env', 'set']) assert.ok(patterns('Bash').includes(command));
});
