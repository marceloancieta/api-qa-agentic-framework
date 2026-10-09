// Building blocks for flows: multi-step business sequences written as plain functions over an
// actor's clients. A flow step is a precondition, not the subject of the test, so an unexpected
// status stops the flow with a readable error instead of being returned for the spec to assert.

import { test, type APIResponse } from '@playwright/test';
import { redactionFor } from './evidence';
import { redact } from './redact';

const EXCERPT_LENGTH = 300;

/** Run `body` as a named step in the report. Outside a test it simply runs. */
export async function step<T>(title: string, body: () => Promise<T>): Promise<T> {
  try {
    test.info();
  } catch {
    return body();
  }
  return test.step(title, body);
}

async function excerpt(response: APIResponse): Promise<string> {
  const raw = await response.text();
  let shown = raw;
  try {
    shown = JSON.stringify(redact(JSON.parse(raw), redactionFor(response)));
  } catch {
    // Not JSON: show the text as received.
  }
  return shown.length > EXCERPT_LENGTH ? `${shown.slice(0, EXCERPT_LENGTH)}...` : shown;
}

/**
 * The parsed JSON body of `response` when its status is one of `expected`; otherwise an error that
 * names the step, the status and a redacted excerpt of the body.
 */
export async function expectStatus<T = unknown>(
  response: APIResponse,
  expected: number | readonly number[],
  what: string,
): Promise<T> {
  const allowed = typeof expected === 'number' ? [expected] : expected;
  if (!allowed.includes(response.status())) {
    throw new Error(
      `${what}: expected HTTP ${allowed.join(' or ')}, got ${response.status()}. ` +
        `Body: ${await excerpt(response)}`,
    );
  }
  const raw = await response.text();
  return (raw.length > 0 ? JSON.parse(raw) : undefined) as T;
}
