#!/usr/bin/env node
// SessionStart: gives Claude a short status report before the first prompt.
//
//   setup     whether qa-config.json exists (otherwise the example is used) and dependencies are
//             installed
//   api       for each pack of the active environment, whether its host accepts a TCP connection; a
//             plain socket is enough to tell "host down" from "service answered with an error", and
//             it is immune to TLS inspection proxies
//   coverage  the designed / automated / published totals and the number of findings, once
//             scripts/coverage-status.mjs exists; "unknown" with the reason when it cannot say
//
// This event cannot block a session. Anything that cannot be determined is reported as unknown.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
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

/**
 * The registries' totals from `coverage-status --json --report-only` as a sentence, 'unknown
 * (<reason>)' when they cannot be read, or '' before the script exists. `--report-only` keeps the
 * exit code 0 when there are findings, which are counted rather than hidden.
 */
function coverageTotals(root) {
  const script = join(root, 'scripts', 'coverage-status.mjs');
  if (!existsSync(script)) return '';
  let status;
  try {
    const output = execFileSync(process.execPath, [script, '--json', '--report-only'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: COVERAGE_TIMEOUT_MS,
    });
    status = JSON.parse(output);
  } catch (error) {
    if (error.code === 'ETIMEDOUT') return 'unknown (coverage-status timed out)';
    return error instanceof SyntaxError
      ? 'unknown (coverage-status did not print JSON)'
      : 'unknown (coverage-status failed)';
  }
  const registries = (status.packs ?? []).flatMap((pack) => pack.registries ?? []);
  const sum = (pick) => registries.reduce((total, registry) => total + (pick(registry) ?? 0), 0);
  const findings = status.findings?.length ?? 0;
  return (
    `${sum((r) => r.cases)} designed, ${sum((r) => r.automated)} automated, ` +
    `${sum((r) => r.byStatus?.published)} published in ${registries.length} registries; ` +
    `${findings} finding(s)`
  );
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

/** `npm run <pack>:up` when package.json has that script, so a hint names the real command. */
function startCommand(root, pack) {
  try {
    const scripts = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts ?? {};
    return scripts[`${pack}:up`] ? `npm run ${pack}:up` : 'docker compose up -d <service>';
  } catch {
    return 'docker compose up -d <service>';
  }
}

const root = projectDir(readPayload());
const { config, source } = loadConfig(root);
const env = activeEnvironment(config);
const report = setupNotes(root, source);

const envLabel = env.name || 'no environment';
if (env.packs.length === 0) {
  report.push(`API [${envLabel}]: UNKNOWN (no packs configured for this environment)`);
}
// Probed in parallel, so the whole check stays within one connect timeout.
const statuses = await Promise.all(env.packs.map((pack) => reachability(pack.baseUrl)));
env.packs.forEach((pack, i) => {
  report.push(`API [${envLabel}] ${pack.name} ${pack.baseUrl || '(no host)'}: ${statuses[i]}`);
  if (statuses[i] !== 'DOWN') return;
  report.push(
    LOCAL_HOST.test(pack.baseUrl)
      ? `Hint: the local API of ${pack.name} is not running. Start it (\`${startCommand(root, pack.name)}\`) before running its suite or fetching its spec.`
      : `Hint: the host of ${pack.name} does not accept connections. Check the network or VPN first; a timeout here is not an application defect.`,
  );
});

const totals = coverageTotals(root);
if (totals) report.push(`Coverage (scripts/coverage-status.mjs): ${totals}`);

respond('SessionStart', { additionalContext: report.join('\n') });
