// The test-management adapter interface (ADR 0004) and what every adapter shares (TM-04).
//
// An adapter is a plain object:
//   name                       provider name, as in qa-config test_management.provider
//   capabilities               { definitions: boolean, runs: boolean }
//                              definitions: the tool holds case definitions before any run
//                              runs: the tool records runs and their results
//   publishDefinitions(cases)  create or update the given cases only; returns
//                              { published: [{ identity, tmId, url }], unchanged: [identity] }
//   startRun({ name, runId })  returns a run handle { id, url }
//   reportResults(run, results)  returns { reported: [identity], skipped: [{ identity, reason }] }
//   closeRun(run)              idempotent: closing a closed run is not an error
//   readDefinitions(identities), readRun(run)   read-back, used to verify every write (L-04)
// Operations are scoped: an adapter touches only the cases or the run it is given, never "all".

export const ADAPTER_METHODS = ['publishDefinitions', 'startRun', 'reportResults', 'closeRun'];

/** Problems with an adapter's shape; empty when it can be used. */
export function adapterProblems(adapter) {
  const problems = [];
  if (!adapter || typeof adapter !== 'object') return ['an adapter must be an object'];
  if (typeof adapter.name !== 'string' || !adapter.name) problems.push('name is missing');
  const caps = adapter.capabilities;
  if (!caps || typeof caps.definitions !== 'boolean' || typeof caps.runs !== 'boolean') {
    problems.push('capabilities must be { definitions: boolean, runs: boolean }');
  }
  for (const method of ADAPTER_METHODS) {
    if (typeof adapter[method] !== 'function') problems.push(`${method}() is missing`);
  }
  if (caps?.definitions && typeof adapter.readDefinitions !== 'function') {
    problems.push('an adapter with definitions needs readDefinitions() to verify its writes');
  }
  if (caps?.runs && typeof adapter.readRun !== 'function') {
    problems.push('an adapter with runs needs readRun() to verify its writes');
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------
// Read-back (L-04): a write counts only when reading it back shows what was sent.

/**
 * Compare what was written with what reading it back returned, field by field.
 * @returns {string[]} one line per difference; empty when equal.
 */
export function readBackDifferences(expected, actual, fields) {
  const differences = [];
  for (const field of fields) {
    const want = JSON.stringify(expected?.[field] ?? null);
    const got = JSON.stringify(actual?.[field] ?? null);
    if (want !== got) differences.push(`${field}: wrote ${want}, read back ${got}`);
  }
  return differences;
}

export function assertReadBack(what, expected, actual, fields) {
  const differences = readBackDifferences(expected, actual, fields);
  if (differences.length > 0) {
    throw new Error(
      `Read-back of ${what} does not match what was written:\n  ${differences.join('\n  ')}`,
    );
  }
}

// ---------------------------------------------------------------------------------------------
// HTTP with retries (L-46)

const RETRYABLE = (status) => status === 429 || status >= 500;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Delay before retry `attempt` (1-based): Retry-After when the server sent one, else backoff. */
export function retryDelay(attempt, retryAfter, baseMs) {
  const seconds = Number(retryAfter);
  if (retryAfter !== null && retryAfter !== undefined && Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }
  return baseMs * 2 ** (attempt - 1);
}

/**
 * A small JSON HTTP client: retries 429, 5xx and network errors with backoff, never retries other
 * 4xx (they will not change), and logs every attempt without headers (tokens stay out of logs).
 * Tokens come from the caller's headers, which read them from the environment: never from argv.
 */
export function httpClient({
  baseUrl,
  headers = {},
  retries = 4,
  backoffMs = 500,
  fetchImpl = fetch,
  log = null,
  wait = sleep,
}) {
  const root = baseUrl.replace(/\/+$/, '');
  return async function request(method, path, body) {
    const url = `${root}/${path.replace(/^\/+/, '')}`;
    for (let attempt = 1; ; attempt += 1) {
      let response;
      try {
        response = await fetchImpl(url, {
          method,
          headers: {
            accept: 'application/json',
            ...(body === undefined ? {} : { 'content-type': 'application/json' }),
            ...headers,
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch (error) {
        if (attempt > retries)
          throw new Error(`${method} ${url} failed after ${attempt} attempts: ${error.message}`, {
            cause: error,
          });
        log?.warn('request failed, retrying', { method, path, attempt, error: error.message });
        await wait(retryDelay(attempt, null, backoffMs));
        continue;
      }
      if (RETRYABLE(response.status) && attempt <= retries) {
        log?.warn('retryable status, retrying', { method, path, attempt, status: response.status });
        await wait(retryDelay(attempt, response.headers.get('retry-after'), backoffMs));
        continue;
      }
      const text = await response.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        // Not JSON: the caller gets the text.
      }
      return { status: response.status, ok: response.ok, json, text };
    }
  };
}

/** Wrap closeRun so a second close of the same run is a no-op that says so. */
export function idempotentClose(closeRun) {
  const closed = new Set();
  return async (run) => {
    if (closed.has(run.id)) return { closed: true, alreadyClosed: true };
    const outcome = await closeRun(run);
    closed.add(run.id);
    return outcome;
  };
}
