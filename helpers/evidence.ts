// Evidence for every API call: the request and the whole response, redacted, attached to the running
// test. Attachments go through Playwright's own test info, so every reporter (HTML, Allure, any
// test-management adapter) receives them without a reporter-specific call.

import { test, type APIResponse } from '@playwright/test';
import { redact, redactUrl } from './redact';

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

/** Attach one request/response pair. A call made outside a test (worker setup) records nothing. */
export async function attachExchange(
  request: Exchange,
  response: APIResponse,
  secretKeys: readonly string[] = [],
): Promise<void> {
  let info: ReturnType<typeof test.info>;
  try {
    info = test.info();
  } catch {
    return;
  }
  const record = {
    request: {
      method: request.method,
      url: redactUrl(request.url, secretKeys),
      headers: redact(request.headers, secretKeys),
      body: redact(requestBody(request.body), secretKeys),
    },
    response: {
      status: response.status(),
      headers: redact(response.headers(), secretKeys),
      body: redact(readableBody(await response.text()), secretKeys),
    },
  };
  const index = info.attachments.length + 1;
  const path = new URL(request.url).pathname;
  await info.attach(`${index} ${request.method} ${path} -> ${response.status()}`, {
    body: JSON.stringify(record, null, 2),
    contentType: 'application/json',
  });
}
