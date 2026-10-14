import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../lib/cli.mjs';
import { issueLoginToken, laneCredential } from '../lib/auth-tokens.mjs';
import { credential } from '../lib/env.mjs';
import {
  ENV_VAR_NAME,
  NOT_A_NAME,
  missingVariableMessage,
  redactUnlessVariableName,
} from '../lib/env-names.mjs';

// A value that looks like a password, standing for a secret pasted into a `*_env` field.
const PASTED = 'hunter2-Pasted!';

test('the name pattern is the envVar pattern of the qa-config schema', () => {
  const schema = JSON.parse(readFileSync(join(REPO_ROOT, 'schemas/qa-config.schema.json'), 'utf8'));
  assert.equal(schema.$defs.envVar.pattern, ENV_VAR_NAME.source);
});

test('a variable name passes, anything else is redacted', () => {
  for (const name of ['K', 'API_KEY', 'VAMPI_USER_A_PASSWORD', 'X1']) {
    assert.equal(redactUnlessVariableName(name), name);
  }
  for (const value of [PASTED, 'api_key', '1KEY', '_KEY', 'API KEY', '', undefined, null, 42]) {
    assert.equal(redactUnlessVariableName(value), NOT_A_NAME);
  }
});

test('the missing-variable message names the variable, or redacts what is not one', () => {
  assert.equal(
    missingVariableMessage('The github tracker', 'GITHUB_TOKEN'),
    'The github tracker needs the environment variable GITHUB_TOKEN, which is not set.',
  );
  const message = missingVariableMessage('Auth "basic"', PASTED);
  assert.ok(message.includes(NOT_A_NAME));
  assert.ok(!message.includes(PASTED));
});

test('the messages built from qa-config fields never print a value that is not a name', async () => {
  assert.throws(
    () => credential({}, PASTED, 'A tool'),
    (error) => {
      assert.ok(!error.message.includes(PASTED));
      return true;
    },
  );
  await assert.rejects(
    laneCredential(
      { type: 'login', path: 'login', username_env: 'U', password_env: PASTED },
      { baseUrl: 'http://x.test', env: { U: 'u1' } },
    ),
    (error) => {
      assert.match(error.message, /Auth "login" needs the environment variable \[redacted/);
      assert.ok(!error.message.includes(PASTED));
      return true;
    },
  );
  await assert.rejects(
    issueLoginToken({
      config: { type: 'login', path: 'login', username_env: 'U', password_env: PASTED },
      url: 'http://x.test/login',
      username: 'u1',
      password: 'p1',
      post: async () => ({ ok: false, status: 401, body: null }),
    }),
    (error) => {
      assert.match(error.message, /check the credentials in U and \[redacted/);
      assert.ok(!error.message.includes(PASTED));
      return true;
    },
  );
});
