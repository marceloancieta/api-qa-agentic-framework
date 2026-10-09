// Base for every resource client (Service Object, the API counterpart of a Page Object). It owns
// the mechanics - auth, path encoding, raw bodies, evidence - so a resource client only names paths
// and a spec only asserts. It knows nothing about any particular API.

import type { APIRequestContext, APIResponse } from '@playwright/test';
import { noAuth, type AuthStrategy, type QueryParams } from './auth';
import { attachExchange } from './evidence';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';

export interface RequestOptions {
  params?: QueryParams;
  /** Extra headers. One the auth strategy would set is kept as given, for negative cases. */
  headers?: Record<string, string>;
  /** A value is sent as JSON. A string is sent byte for byte, so malformed payloads stay malformed. */
  data?: unknown;
  /** `false` sends the request without credentials (unauthenticated cases). Default `true`. */
  auth?: boolean;
  /** Per-request timeout in milliseconds. */
  timeout?: number;
}

export class BaseClient {
  constructor(
    protected readonly context: APIRequestContext,
    protected readonly auth: AuthStrategy = noAuth,
  ) {}

  /** Percent-encode one path segment, so an id can never change the route. */
  protected segment(value: string | number): string {
    return encodeURIComponent(String(value));
  }

  protected get(path: string, options?: RequestOptions): Promise<APIResponse> {
    return this.send('GET', path, options);
  }

  protected post(path: string, options?: RequestOptions): Promise<APIResponse> {
    return this.send('POST', path, options);
  }

  protected put(path: string, options?: RequestOptions): Promise<APIResponse> {
    return this.send('PUT', path, options);
  }

  protected patch(path: string, options?: RequestOptions): Promise<APIResponse> {
    return this.send('PATCH', path, options);
  }

  protected delete(path: string, options?: RequestOptions): Promise<APIResponse> {
    return this.send('DELETE', path, options);
  }

  /**
   * Send one request and record it. Any HTTP status resolves normally; deciding whether a 4xx is a
   * bug or the expected answer belongs to the spec.
   */
  protected async send(
    method: HttpMethod,
    path: string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    const outgoing = { headers: { ...options.headers }, params: { ...options.params } };
    const useAuth = options.auth ?? true;
    if (useAuth) this.auth.apply(outgoing);

    const data =
      typeof options.data === 'string' ? Buffer.from(options.data, 'utf8') : options.data;
    const response = await this.context.fetch(path, {
      method,
      headers: outgoing.headers,
      params: outgoing.params,
      data,
      timeout: options.timeout,
    });
    await attachExchange(
      { method, url: response.url(), headers: outgoing.headers, body: data },
      response,
      this.auth.secretKeys,
    );
    return response;
  }
}
