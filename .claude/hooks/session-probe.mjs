#!/usr/bin/env node
// SessionStart: gives Claude a short status report before the first prompt.
//
//   setup     whether qa-config.json exists (otherwise the example is used) and dependencies are
//             installed
//   api       whether the active environment's host accepts a TCP connection; a plain socket is
//             enough to tell "host down" from "service answered with an error", and it is immune to
//             TLS inspection proxies
//   coverage  the designed / automated / published totals, once scripts/coverage-status.mjs exists
//
// This event cannot block a session. Anything that cannot be determined is reported as unknown.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { connect } from 'node:net';
import { join } from 'node:path';
import { projectDir, readPayload, respond } from './lib/io.mjs';
import { activeEnvironment, loadConfig } from './lib/config.mjs';

const CONNECT_TIMEOUT_MS = 4000;
const COVERAGE_TIMEOUT_MS = 20000;
const LOCAL_HOST = /^https?:\/\/(?:localhost|127\.0\.0\.1)\b/;

/** 'UP', 'DOWN' or 'UNKNOWN (...)' for the host and port of `baseUrl`. */
function reachability(baseUrl) {
  if (!baseUrl) return Promise.resolve('UNKNOWN (no base_url configured)');
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    return Promise.resolve('UNKNOWN (base_url is not a valid URL)');
  }
  const port = Number(url.port) || (url.protocol === 'https:' ? 443 : 80);
  return new Promise((resolve) => {
    const socket = connect({ host: url.hostname, port, timeout: CONNECT_TIMEOUT_MS });
    const finish = (status) => {
      socket.destroy();
      resolve(status);
    };
    socket.once('connect', () => finish('UP'));
    socket.once('timeout', () => finish('DOWN'));
    socket.once('error', () => finish('DOWN'));
  });
}

/** The TOTAL row of coverage-status as a sentence, or '' when unavailable. */
function coverageTotals(root) {
  const script = join(root, 'scripts', 'coverage-status.mjs');
  if (!existsSync(script)) return '';
  try {
    const output = execFileSync(process.execPath, [script], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: COVERAGE_TIMEOUT_MS,
    });
    const [, designed, automated, published] =
      output
        .split('\n')
        .find((row) => row.trim().startsWith('TOTAL'))
        ?.trim()
        .split(/\s+/) ?? [];
    return published ? `${designed} designed, ${automated} automated, ${published} published` : '';
  } catch {
    return '';
  }
}

function setupNotes(root, configSource) {
  const notes = [];
  if (configSource === null)
    notes.push('Setup: no qa-config found. Create qa-config.json from qa-config.example.json.');
  else if (configSource !== 'qa-config.json') {
    notes.push('Setup: qa-config.json is missing, so qa-config.example.json is in effect.');
  }
  if (!existsSync(join(root, 'node_modules')))
    notes.push('Setup: dependencies missing; run `npm ci`.');
  return notes;
}

const root = projectDir(readPayload());
const { config, source } = loadConfig(root);
const env = activeEnvironment(config);
const report = setupNotes(root, source);

const status = await reachability(env.baseUrl);
report.push(`API [${env.name || 'no environment'}] ${env.baseUrl || '(no host)'}: ${status}`);
if (status === 'DOWN') {
  report.push(
    LOCAL_HOST.test(env.baseUrl)
      ? 'Hint: the local API is not running. Start it with `docker compose up -d petstore` before running suites or fetching the spec.'
      : 'Hint: the API host does not accept connections. Check the network or VPN first; a timeout here is not an application defect.',
  );
}

const totals = coverageTotals(root);
if (totals) report.push(`Coverage (scripts/coverage-status.mjs): ${totals}`);

respond('SessionStart', { additionalContext: report.join('\n') });
