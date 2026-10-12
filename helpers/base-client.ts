// Base for every resource client (Service Object, the API counterpart of a Page Object). It owns
// the mechanics - auth, path encoding, raw bodies, evidence - so a resource client only names paths
// and a spec only asserts. It knows nothing about any particular API.

import type { APIRequestContext, APIResponse } from '@playwright/test';
import { noAuth, type AuthStrategy, type QueryParams } from './auth';
import { attachExchange } from './evidence';
import { pseudonym, type RedactionPolicy } from './redact';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';

export interface RequestOptions {
  params?: QueryParams;
  /** Extra headers. One the auth strategy would set is kept as given, for negative cases. */
  headers?: Record<string, string>;
  /** A value is sent as JSON. A string is sent byte for byte, so malformed payloads stay malformed. */
  data?: unknown;
  /** `false` sends the request without credentials (unauthenticated cases). Default `true`. */
  auth?: boolean;
  /**
   * A bearer value of the caller's own, sent as `Authorization: Bearer <value>` instead of the auth
   * strategy's credential (negative cases: a malformed, expired or forged token). The strategy never
   * replaces or renews it.
   */
  bearer?: string;
  /** Per-request timeout in milliseconds. */
  timeout?: number;
}

export class BaseClient {
  constructor(
    protected readonly context: APIRequestContext,
    protected readonly auth: AuthStrategy = noAuth,
    /** The pack's identity fields and extra secret keys, applied to every recorded exchange. */
    protected readonly redaction: RedactionPolicy = {},
  ) {}

  /**
   * A path from an OpenAPI-style template: `this.route('user/{username}', { username })`. Values
   * are percent-encoded, so an id can never change the route, and parameters named like an identity
   * field are pseudonymized in the evidence, like the same field in a body.
   */
  protected route(template: string, params: PathParams = {}): Route {
    return { template, params };
  }

  protected get(target: Target, options?: RequestOptions): Promise<APIResponse> {
    return this.send('GET', target, options);
  }

  protected post(target: Target, options?: RequestOptions): Promise<APIResponse> {
    return this.send('POST', target, options);
  }

  protected put(target: Target, options?: RequestOptions): Promise<APIResponse> {
    return this.send('PUT', target, options);
  }

  protected patch(target: Target, options?: RequestOptions): Promise<APIResponse> {
    return this.send('PATCH', target, options);
  }

  protected delete(target: Target, options?: RequestOptions): Promise<APIResponse> {
    return this.send('DELETE', target, options);
  }

  /**
   * Send one request and record it. Any HTTP status resolves normally; deciding whether a 4xx is a
   * bug or the expected answer belongs to the spec. A 401 to a credential the auth strategy can
   * renew (an expired login token) is sent once more with the new one; both exchanges are recorded.
   */
  protected async send(
    method: HttpMethod,
    target: Target,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    const outgoing = { headers: { ...options.headers }, params: { ...options.params } };
    if (options.bearer !== undefined)
      outgoing.headers['Authorization'] = `Bearer ${options.bearer}`;
    const useAuth = options.auth ?? true;
    if (useAuth) await this.auth.apply(outgoing, this.context);

    const path = typeof target === 'string' ? target : expand(target, (value) => value);
    const data =
      typeof options.data === 'string' ? Buffer.from(options.data, 'utf8') : options.data;
    const exchange = async (): Promise<APIResponse> => {
      const response = await this.context.fetch(path, {
        method,
        headers: outgoing.headers,
        params: outgoing.params,
        data,
        timeout: options.timeout,
      });
      await attachExchange(
        {
          method,
          url: this.recordedUrl(response.url(), path, target),
          headers: outgoing.headers,
          body: data,
        },
        response,
        {
          secretKeys: [...this.auth.secretKeys, ...(this.redaction.secretKeys ?? [])],
          identityFields: this.redaction.identityFields,
        },
      );
      return response;
    };
    const response = await exchange();
    if (
      useAuth &&
      response.status() === 401 &&
      this.auth.refresh &&
      (await this.auth.refresh(outgoing, this.context))
    ) {
      return exchange();
    }
    return response;
  }

  // The URL as evidence: identity path parameters replaced by their pseudonyms.
  private recordedUrl(url: string, path: string, target: Target): string {
    if (typeof target === 'string') return url;
    const identity = new Set((this.redaction.identityFields ?? []).map((f) => f.toLowerCase()));
    const recorded = expand(target, (value, name) =>
      identity.has(name.toLowerCase()) ? pseudonym(value) : value,
    );
    const parsed = new URL(url);
    if (!parsed.pathname.endsWith(path)) return url;
    parsed.pathname = parsed.pathname.slice(0, -path.length) + recorded;
    return parsed.toString();
  }
}

export type PathParams = Record<string, string | number>;

export interface Route {
  template: string;
  params: PathParams;
}

type Target = string | Route;

function expand(route: Route, transform: (value: string, name: string) => string): string {
  return route.template.replace(/\{([^}]+)\}/g, (_match, name: string) => {
    const value = route.params[name];
    if (value === undefined) {
      throw new Error(`Path "${route.template}" needs parameter "${name}".`);
    }
    return encodeURIComponent(transform(String(value), name));
  });
}
