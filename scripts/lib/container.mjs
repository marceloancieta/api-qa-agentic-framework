// A tool that runs in a compose container (ZAP for the DAST lane, k6 for the performance lane)
// reaches a pack's API at a different address than the host does: inside the container,
// `localhost` is the container itself. A base on `localhost` or `127.0.0.1` becomes the compose
// service that publishes its port (`http://<service>:<target port><path>`), reached over the
// project network, which works on Linux CI too, where a port bound to 127.0.0.1 is out of reach of
// `host.docker.internal`. When no running compose service publishes the port, the base becomes
// `host.docker.internal` (docker-compose.yml maps it on Linux with extra_hosts); on Linux that
// needs the API to listen beyond 127.0.0.1. The lanes print the rewrite.

import { spawnSync } from 'node:child_process';
import { describeExit, exitCodeOf, spawnFailure } from './spawn.mjs';

export const DOCKER_HOST = 'host.docker.internal';
const LOOPBACK = new Set(['localhost', '127.0.0.1']);

/** `docker` arguments that list the running services of the compose project. */
export const PS_ARGS = Object.freeze(['compose', 'ps', '--format', 'json']);

/** `raw` as a URL; throws unless it is http(s). `what` names it in the message. */
export function httpUrl(raw, what) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${what} must be an http(s) URL, got "${raw}"`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`${what} must be an http(s) URL, got "${raw}"`);
  }
  return url;
}

/** `docker compose ps --format json` output: one object per line (Compose v2.21+) or an array. */
export function parseComposePs(text) {
  const trimmed = (text ?? '').trim();
  if (trimmed === '') return [];
  if (trimmed.startsWith('[')) return JSON.parse(trimmed);
  return trimmed
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line));
}

const portOf = (url) => Number(url.port || (url.protocol === 'https:' ? 443 : 80));

/**
 * The base URL as the tool's container reaches it: `{ url, note }`, `note` null when it is
 * unchanged. A loopback base becomes the running compose service that publishes its port, else
 * `host.docker.internal`. `services` is the parsed `docker compose ps` output; `tool` names the
 * tool in the note (`name`) and its own compose service, which is never a target (`service`).
 */
export function containerBase(baseUrl, services, tool = { name: 'the tool', service: null }) {
  const url = new URL(baseUrl);
  if (!LOOPBACK.has(url.hostname)) return { url: baseUrl, note: null };
  const port = portOf(url);
  const path = url.pathname.replace(/\/+$/, '') + url.search;
  for (const service of services) {
    if (service.Service === tool.service || (service.State && service.State !== 'running')) {
      continue;
    }
    const publisher = (service.Publishers ?? []).find((p) => Number(p.PublishedPort) === port);
    if (publisher) {
      return {
        url: `${url.protocol}//${service.Service}:${publisher.TargetPort}${path}`,
        note: `compose service "${service.Service}" publishes port ${port}; ${tool.name} reaches it over the project network`,
      };
    }
  }
  url.hostname = DOCKER_HOST;
  return {
    url: url.href.replace(/\/+$/, ''),
    note:
      `no running compose service publishes port ${port}, so ${tool.name} goes through ${DOCKER_HOST}; ` +
      'on Linux that needs the API to listen beyond 127.0.0.1',
  };
}

/**
 * Run `docker <args>` in `cwd`; a `spawnSync` result. The tool's output streams through; with
 * `capture`, stdout comes back as text instead.
 */
export function dockerRunner(args, { cwd, capture = false }) {
  return spawnSync('docker', args, {
    cwd,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
}

/**
 * `{ url, note }` for the base as the tool's container reaches it, or `{ error }` when
 * `docker compose ps` cannot tell. A remote base is returned as it is, without asking compose.
 * `run` replaces `dockerRunner` in tests.
 */
export function reachableBase(baseUrl, { root, run = dockerRunner, tool }) {
  if (!LOOPBACK.has(new URL(baseUrl).hostname)) return { url: baseUrl, note: null };
  const ps = run([...PS_ARGS], { cwd: root, capture: true });
  const failure = spawnFailure(ps);
  if (failure || exitCodeOf(ps) !== 0) {
    const why = failure ?? `${describeExit(ps)}: ${(ps.stderr ?? '').trim().split('\n').at(-1)}`;
    return { error: `docker compose ps ${why}; cannot tell which service publishes the port` };
  }
  let services;
  try {
    services = parseComposePs(ps.stdout);
  } catch (error) {
    return { error: `docker compose ps printed no JSON (${error.message})` };
  }
  return containerBase(baseUrl, services, tool);
}
