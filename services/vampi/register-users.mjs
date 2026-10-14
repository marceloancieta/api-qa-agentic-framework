#!/usr/bin/env node
// Registers the users behind the pack's `login` credentials (the entry's `auth` and its actors) in
// the VAmPI of the active environment: `npm run vampi:users`, after `npm run vampi:up`. The pack
// fixtures do the same before the first case of a Playwright run; the DAST and performance lanes
// log in without Playwright, so CI runs this first. A duplicate registration answers 200 with
// `status: fail` (VN-07), so a user counts as registered when its credentials log in.

import { packEnvironment } from '../../scripts/lib/cli.mjs';
import { loadLocalEnv } from '../../scripts/lib/env.mjs';
import { redactUnlessVariableName } from '../../scripts/lib/env-names.mjs';

loadLocalEnv();
const environment = packEnvironment('vampi');
const { config, baseUrl } = environment;
const logins = [config.auth, ...Object.values(config.actors ?? {})].filter(
  (auth) => auth.type === 'login',
);

async function post(path, body) {
  const response = await fetch(`${baseUrl}/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

let failed = false;
const done = new Set();
for (const auth of logins) {
  const username = process.env[auth.username_env]?.trim();
  const password = process.env[auth.password_env];
  const user = redactUnlessVariableName(auth.username_env);
  if (!username || !password) {
    if (done.has(auth.username_env)) continue;
    done.add(auth.username_env);
    console.error(
      `vampi users: ${user} and ${redactUnlessVariableName(auth.password_env)} must be set`,
    );
    failed = true;
    continue;
  }
  if (done.has(`user:${username}`)) continue;
  done.add(`user:${username}`);
  const registered = await post('users/v1/register', {
    username,
    password,
    email: `${username}@example.invalid`,
  });
  const login = await post(auth.path, { username, password });
  const ok = typeof login.body?.auth_token === 'string';
  console.log(
    `vampi users: the user in ${user}: register ${registered.status} ` +
      `(${registered.body?.status ?? 'no status'}), login ${ok ? 'works' : `failed (${login.status})`}`,
  );
  if (!ok) failed = true;
}
const users = [...done].filter((key) => key.startsWith('user:')).length;
console.log(`vampi users: ${users} user(s) in environment "${environment.name}" at ${baseUrl}`);
process.exit(failed ? 1 : 0);
