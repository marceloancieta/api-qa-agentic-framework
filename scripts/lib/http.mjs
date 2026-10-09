// A small JSON HTTP client for tools that call services (test management, trackers). It retries
// what can succeed on a second try (429, 5xx, network errors) with Retry-After or exponential
// backoff, never retries other 4xx, and never logs headers, so tokens stay out of the output (L-46).

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
