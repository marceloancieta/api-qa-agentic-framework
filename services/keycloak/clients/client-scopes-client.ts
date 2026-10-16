import type { APIResponse } from '@playwright/test';
import { BaseClient, type RequestOptions } from '../../../helpers/base-client';

/** `Client Scopes` operations. Methods return the raw response; the spec asserts. */
export class ClientScopesClient extends BaseClient {
  /** GET /admin/realms/{realm}/client-scopes: Get client scopes belonging to the realm Returns a list of client scopes belonging to the realm */
  getAdminRealmsRealmClientScopes(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(this.route('admin/realms/{realm}/client-scopes', { realm }), options);
  }

  /** POST /admin/realms/{realm}/client-scopes: Create a new client scope Client Scope’s name must be unique! */
  postAdminRealmsRealmClientScopes(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(this.route('admin/realms/{realm}/client-scopes', { realm }), options);
  }

  /** GET /admin/realms/{realm}/client-scopes/{client-scope-id}: Get representation of the client scope */
  getAdminRealmsRealmClientScopesClientScopeId(
    realm: number | string,
    clientScopeId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/client-scopes/{client-scope-id}', {
        realm,
        'client-scope-id': clientScopeId,
      }),
      options,
    );
  }

  /** PUT /admin/realms/{realm}/client-scopes/{client-scope-id}: Update the client scope */
  putAdminRealmsRealmClientScopesClientScopeId(
    realm: number | string,
    clientScopeId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.put(
      this.route('admin/realms/{realm}/client-scopes/{client-scope-id}', {
        realm,
        'client-scope-id': clientScopeId,
      }),
      options,
    );
  }

  /** DELETE /admin/realms/{realm}/client-scopes/{client-scope-id}: Delete the client scope */
  deleteAdminRealmsRealmClientScopesClientScopeId(
    realm: number | string,
    clientScopeId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(
      this.route('admin/realms/{realm}/client-scopes/{client-scope-id}', {
        realm,
        'client-scope-id': clientScopeId,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/client-templates: Get client scopes belonging to the realm Returns a list of client scopes belonging to the realm */
  getAdminRealmsRealmClientTemplates(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(this.route('admin/realms/{realm}/client-templates', { realm }), options);
  }

  /** POST /admin/realms/{realm}/client-templates: Create a new client scope Client Scope’s name must be unique! */
  postAdminRealmsRealmClientTemplates(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(this.route('admin/realms/{realm}/client-templates', { realm }), options);
  }

  /** GET /admin/realms/{realm}/client-templates/{client-scope-id}: Get representation of the client scope */
  getAdminRealmsRealmClientTemplatesClientScopeId(
    realm: number | string,
    clientScopeId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/client-templates/{client-scope-id}', {
        realm,
        'client-scope-id': clientScopeId,
      }),
      options,
    );
  }

  /** PUT /admin/realms/{realm}/client-templates/{client-scope-id}: Update the client scope */
  putAdminRealmsRealmClientTemplatesClientScopeId(
    realm: number | string,
    clientScopeId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.put(
      this.route('admin/realms/{realm}/client-templates/{client-scope-id}', {
        realm,
        'client-scope-id': clientScopeId,
      }),
      options,
    );
  }

  /** DELETE /admin/realms/{realm}/client-templates/{client-scope-id}: Delete the client scope */
  deleteAdminRealmsRealmClientTemplatesClientScopeId(
    realm: number | string,
    clientScopeId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(
      this.route('admin/realms/{realm}/client-templates/{client-scope-id}', {
        realm,
        'client-scope-id': clientScopeId,
      }),
      options,
    );
  }
}
