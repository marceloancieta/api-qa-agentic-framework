// A tool that runs in a compose container (ZAP for the DAST lane, k6 for the performance lane)
// reaches a pack's API at a different address than the host does: inside the container,
// `localhost` is the container itself. A base on `localhost` or `127.0.0.1` becomes the compose
// service that publishes its port (`http://<service>:<target port><path>`), reached over the
// project network, which works on Linux CI too, where a port bound to 127.0.0.1 is out of reach of
// `host.docker.internal`. When no running compose service publishes the port, the base becomes
// `host.docker.internal` (docker-compose.yml maps it on Linux with extra_hosts); on Linux that
// needs the API to listen beyond 127.0.0.1. The lanes print the rewrite.
//
// A lane that works while its tool runs (the DAST lane renews a credential and watches the API)
// starts the container with `dockerRunnerAsync`, can publish a port of it on a free loopback port
// (`freeLoopbackPort`), and checks from the host that the API keeps answering (`watchLiveness`).

import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
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

/**
 * Run `command <args>` in `cwd` with its output streaming through, without blocking: a promise of
 * `{ status, signal, error }` shaped like a `spawnSync` result, so `exitCodeOf`, `spawnFailure`
 * and `describeExit` read it the same way. It never rejects; a command that cannot start resolves
 * with `error`.
 */
export function spawnAsync(command, args, { cwd }) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(command, args, { cwd, stdio: 'inherit' });
    } catch (error) {
      resolve({ status: null, signal: null, error });
      return;
    }
    child.once('error', (error) => resolve({ status: null, signal: null, error }));
    child.once('close', (status, signal) => resolve({ status, signal }));
  });
}

/** `dockerRunner` for a container the lane works beside: `docker <args>` without blocking. */
export function dockerRunnerAsync(args, { cwd }) {
  return spawnAsync('docker', args, { cwd });
}

/** A TCP port free on 127.0.0.1 right now, for publishing a container's port on loopback only. */
export function freeLoopbackPort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/**
 * A sleep that `cancel()` ends at once, so a loop waiting on it can stop without leaving a timer
 * behind. `timers` replaces `setTimeout` and `clearTimeout` in tests.
 */
export function stoppableSleep(timers = { setTimeout, clearTimeout }) {
  let timer = null;
  let wake = null;
  return {
    sleep: (ms) =>
      new Promise((resolve) => {
        wake = resolve;
        timer = timers.setTimeout(() => {
          timer = null;
          wake = null;
          resolve();
        }, ms);
      }),
    cancel: () => {
      if (timer !== null) timers.clearTimeout(timer);
      timer = null;
      wake?.();
      wake = null;
    },
  };
}

/** Why a request got no answer, in words for a log line. */
function noAnswer(error, timeoutMs) {
  if (error?.name === 'TimeoutError') return `no answer within ${timeoutMs / 1000} s`;
  return error?.cause?.code ?? error?.message ?? String(error);
}

/**
 * Check from the host that the API at `url` keeps answering while a tool runs against it: one
 * request every `intervalMs`, each given `timeoutMs`. Any HTTP answer counts, whatever its status.
 * After `misses` checks in a row without one, `state.down` is set, `onDown(state)` is called once
 * and the checks end. `stop()` ends them and resolves once nothing is left running.
 *
 *   state: { down, misses (in a row), checks, reason (of the last miss) }
 */
export function watchLiveness(
  url,
  {
    fetchImpl = fetch,
    intervalMs = 15_000,
    timeoutMs = 10_000,
    misses = 4,
    onDown = () => {},
    timers,
  } = {},
) {
  const state = { down: false, misses: 0, checks: 0, reason: null };
  const abort = new AbortController();
  const clock = stoppableSleep(timers);
  let stopped = false;
  const loop = (async () => {
    while (!stopped) {
      await clock.sleep(intervalMs);
      if (stopped) return;
      try {
        const response = await fetchImpl(url, {
          redirect: 'manual',
          signal: AbortSignal.any([abort.signal, AbortSignal.timeout(timeoutMs)]),
        });
        await response.body?.cancel().catch(() => {});
        state.misses = 0;
      } catch (error) {
        if (stopped) return;
        state.misses += 1;
        state.reason = noAnswer(error, timeoutMs);
      }
      state.checks += 1;
      if (state.misses >= misses) {
        state.down = true;
        try {
          onDown(state);
        } catch {
          // the caller reports its own failure; the watch has ended either way
        }
        return;
      }
    }
  })();
  return {
    state,
    stop: async () => {
      stopped = true;
      abort.abort();
      clock.cancel();
      await loop;
    },
  };
}
