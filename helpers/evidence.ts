// Evidence for every API call: the request and the whole response, redacted, attached to the running
// test. Attachments go through Playwright's own test info, so every reporter (HTML, Allure, any
// test-management adapter) receives them without a reporter-specific call.

import { test, type APIResponse } from '@playwright/test';
import { redact, redactUrl, type RedactionPolicy } from './redact';

export interface Exchange {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: unknown;
}

/** Parsed JSON when possible, otherwise the text as received (an HTML error page is worth keeping). */
function readableBody(raw: string): unknown {
  if (raw.length === 0) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function requestBody(data: unknown): unknown {
  if (data === undefined) return undefined;
  if (Buffer.isBuffer(data)) return readableBody(data.toString('utf8'));
  return data;
}

// The policy each response was recorded with, so later excerpts of it (flow errors) redact the same way.
const policies = new WeakMap<APIResponse, RedactionPolicy>();

export function redactionFor(response: APIResponse): RedactionPolicy {
  return policies.get(response) ?? {};
}

/** Attach one request/response pair. A call made outside a test (worker setup) records nothing. */
export async function attachExchange(
  request: Exchange,
  response: APIResponse,
  policy: RedactionPolicy = {},
): Promise<void> {
  policies.set(response, policy);
  let info: ReturnType<typeof test.info>;
  try {
    info = test.info();
  } catch {
    return;
  }
  const record = {
    request: {
      method: request.method,
      url: redactUrl(request.url, policy),
      headers: redact(request.headers, policy),
      body: redact(requestBody(request.body), policy),
    },
    response: {
      status: response.status(),
      headers: redact(response.headers(), policy),
      body: redact(readableBody(await response.text()), policy),
    },
  };
  const index = info.attachments.length + 1;
  const path = new URL(record.request.url).pathname;
  await info.attach(`${index} ${request.method} ${path} -> ${response.status()}`, {
    body: JSON.stringify(record, null, 2),
    contentType: 'application/json',
  });
}
