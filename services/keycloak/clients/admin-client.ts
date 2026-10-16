import type { APIResponse } from '@playwright/test';
import { BaseClient, type RequestOptions } from '../../../helpers/base-client';

/** `admin` operations. Methods return the raw response; the spec asserts. */
export class AdminClient extends BaseClient {
  /** GET /admin/realms/{realm}/clients/{client-uuid}/authz/resource-server */
  getAdminRealmsRealmClientsClientUuidAuthzResourceServer(
    realm: number | string,
    clientUuid: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/clients/{client-uuid}/authz/resource-server', {
        realm,
        'client-uuid': clientUuid,
      }),
      options,
    );
  }

  /** PUT /admin/realms/{realm}/clients/{client-uuid}/authz/resource-server */
  putAdminRealmsRealmClientsClientUuidAuthzResourceServer(
    realm: number | string,
    clientUuid: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.put(
      this.route('admin/realms/{realm}/clients/{client-uuid}/authz/resource-server', {
        realm,
        'client-uuid': clientUuid,
      }),
      options,
    );
  }

  /** POST /admin/realms/{realm}/clients/{client-uuid}/authz/resource-server/import */
  postAdminRealmsRealmClientsClientUuidAuthzResourceServerImport(
    realm: number | string,
    clientUuid: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route('admin/realms/{realm}/clients/{client-uuid}/authz/resource-server/import', {
        realm,
        'client-uuid': clientUuid,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/clients/{client-uuid}/authz/resource-server/permission */
  getAdminRealmsRealmClientsClientUuidAuthzResourceServerPermission(
    realm: number | string,
    clientUuid: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/clients/{client-uuid}/authz/resource-server/permission', {
        realm,
        'client-uuid': clientUuid,
      }),
      options,
    );
  }

  /** POST /admin/realms/{realm}/clients/{client-uuid}/authz/resource-server/permission */
  postAdminRealmsRealmClientsClientUuidAuthzResourceServerPermission(
    realm: number | string,
    clientUuid: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route('admin/realms/{realm}/clients/{client-uuid}/authz/resource-server/permission', {
        realm,
        'client-uuid': clientUuid,
      }),
      options,
    );
  }

  /** POST /admin/realms/{realm}/clients/{client-uuid}/authz/resource-server/permission/evaluate */
  postAdminRealmsRealmClientsClientUuidAuthzResourceServerPermissionEvaluate(
    realm: number | string,
    clientUuid: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route(
        'admin/realms/{realm}/clients/{client-uuid}/authz/resource-server/permission/evaluate',
        { realm, 'client-uuid': clientUuid },
      ),
      options,
    );
  }

  /** GET /admin/realms/{realm}/clients/{client-uuid}/authz/resource-server/permission/providers */
  getAdminRealmsRealmClientsClientUuidAuthzResourceServerPermissionProviders(
    realm: number | string,
    clientUuid: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route(
        'admin/realms/{realm}/clients/{client-uuid}/authz/resource-server/permission/providers',
        { realm, 'client-uuid': clientUuid },
      ),
      options,
    );
  }

  /** GET /admin/realms/{realm}/clients/{client-uuid}/authz/resource-server/permission/search */
  getAdminRealmsRealmClientsClientUuidAuthzResourceServerPermissionSearch(
    realm: number | string,
    clientUuid: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route(
        'admin/realms/{realm}/clients/{client-uuid}/authz/resource-server/permission/search',
        { realm, 'client-uuid': clientUuid },
      ),
      options,
    );
  }

  /** GET /admin/realms/{realm}/clients/{client-uuid}/authz/resource-server/policy */
  getAdminRealmsRealmClientsClientUuidAuthzResourceServerPolicy(
    realm: number | string,
    clientUuid: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/clients/{client-uuid}/authz/resource-server/policy', {
        realm,
        'client-uuid': clientUuid,
      }),
      options,
    );
  }

  /** POST /admin/realms/{realm}/clients/{client-uuid}/authz/resource-server/policy */
  postAdminRealmsRealmClientsClientUuidAuthzResourceServerPolicy(
    realm: number | string,
    clientUuid: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route('admin/realms/{realm}/clients/{client-uuid}/authz/resource-server/policy', {
        realm,
        'client-uuid': clientUuid,
      }),
      options,
    );
  }

  /** POST /admin/realms/{realm}/clients/{client-uuid}/authz/resource-server/policy/evaluate */
  postAdminRealmsRealmClientsClientUuidAuthzResourceServerPolicyEvaluate(
    realm: number | string,
    clientUuid: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route(
        'admin/realms/{realm}/clients/{client-uuid}/authz/resource-server/policy/evaluate',
        { realm, 'client-uuid': clientUuid },
      ),
      options,
    );
  }

  /** GET /admin/realms/{realm}/clients/{client-uuid}/authz/resource-server/policy/providers */
  getAdminRealmsRealmClientsClientUuidAuthzResourceServerPolicyProviders(
    realm: number | string,
    clientUuid: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route(
        'admin/realms/{realm}/clients/{client-uuid}/authz/resource-server/policy/providers',
        { realm, 'client-uuid': clientUuid },
      ),
      options,
    );
  }

  /** GET /admin/realms/{realm}/clients/{client-uuid}/authz/resource-server/policy/search */
  getAdminRealmsRealmClientsClientUuidAuthzResourceServerPolicySearch(
    realm: number | string,
    clientUuid: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/clients/{client-uuid}/authz/resource-server/policy/search', {
        realm,
        'client-uuid': clientUuid,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/clients/{client-uuid}/authz/resource-server/resource */
  getAdminRealmsRealmClientsClientUuidAuthzResourceServerResource(
    realm: number | string,
    clientUuid: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/clients/{client-uuid}/authz/resource-server/resource', {
        realm,
        'client-uuid': clientUuid,
      }),
      options,
    );
  }

  /** POST /admin/realms/{realm}/clients/{client-uuid}/authz/resource-server/resource */
  postAdminRealmsRealmClientsClientUuidAuthzResourceServerResource(
    realm: number | string,
    clientUuid: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route('admin/realms/{realm}/clients/{client-uuid}/authz/resource-server/resource', {
        realm,
        'client-uuid': clientUuid,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/clients/{client-uuid}/authz/resource-server/resource/search */
  getAdminRealmsRealmClientsClientUuidAuthzResourceServerResourceSearch(
    realm: number | string,
    clientUuid: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route(
        'admin/realms/{realm}/clients/{client-uuid}/authz/resource-server/resource/search',
        { realm, 'client-uuid': clientUuid },
      ),
      options,
    );
  }

  /** GET /admin/realms/{realm}/clients/{client-uuid}/authz/resource-server/resource/{resource-id} */
  getAdminRealmsRealmClientsClientUuidAuthzResourceServerResourceResourceId(
    realm: number | string,
    clientUuid: number | string,
    resourceId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route(
        'admin/realms/{realm}/clients/{client-uuid}/authz/resource-server/resource/{resource-id}',
        { realm, 'client-uuid': clientUuid, 'resource-id': resourceId },
      ),
      options,
    );
  }

  /** PUT /admin/realms/{realm}/clients/{client-uuid}/authz/resource-server/resource/{resource-id} */
  putAdminRealmsRealmClientsClientUuidAuthzResourceServerResourceResourceId(
    realm: number | string,
    clientUuid: number | string,
    resourceId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.put(
      this.route(
        'admin/realms/{realm}/clients/{client-uuid}/authz/resource-server/resource/{resource-id}',
        { realm, 'client-uuid': clientUuid, 'resource-id': resourceId },
      ),
      options,
    );
  }

  /** DELETE /admin/realms/{realm}/clients/{client-uuid}/authz/resource-server/resource/{resource-id} */
  deleteAdminRealmsRealmClientsClientUuidAuthzResourceServerResourceResourceId(
    realm: number | string,
    clientUuid: number | string,
    resourceId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(
      this.route(
        'admin/realms/{realm}/clients/{client-uuid}/authz/resource-server/resource/{resource-id}',
        { realm, 'client-uuid': clientUuid, 'resource-id': resourceId },
      ),
      options,
    );
  }

  /** GET /admin/realms/{realm}/clients/{client-uuid}/authz/resource-server/resource/{resource-id}/attributes */
  getAdminRealmsRealmClientsClientUuidAuthzResourceServerResourceResourceIdAttributes(
    realm: number | string,
    clientUuid: number | string,
    resourceId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route(
        'admin/realms/{realm}/clients/{client-uuid}/authz/resource-server/resource/{resource-id}/attributes',
        { realm, 'client-uuid': clientUuid, 'resource-id': resourceId },
      ),
      options,
    );
  }

  /** GET /admin/realms/{realm}/clients/{client-uuid}/authz/resource-server/resource/{resource-id}/permissions */
  getAdminRealmsRealmClientsClientUuidAuthzResourceServerResourceResourceIdPermissions(
    realm: number | string,
    clientUuid: number | string,
    resourceId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route(
        'admin/realms/{realm}/clients/{client-uuid}/authz/resource-server/resource/{resource-id}/permissions',
        { realm, 'client-uuid': clientUuid, 'resource-id': resourceId },
      ),
      options,
    );
  }

  /** GET /admin/realms/{realm}/clients/{client-uuid}/authz/resource-server/resource/{resource-id}/scopes */
  getAdminRealmsRealmClientsClientUuidAuthzResourceServerResourceResourceIdScopes(
    realm: number | string,
    clientUuid: number | string,
    resourceId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route(
        'admin/realms/{realm}/clients/{client-uuid}/authz/resource-server/resource/{resource-id}/scopes',
        { realm, 'client-uuid': clientUuid, 'resource-id': resourceId },
      ),
      options,
    );
  }

  /** GET /admin/realms/{realm}/clients/{client-uuid}/authz/resource-server/scope */
  getAdminRealmsRealmClientsClientUuidAuthzResourceServerScope(
    realm: number | string,
    clientUuid: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/clients/{client-uuid}/authz/resource-server/scope', {
        realm,
        'client-uuid': clientUuid,
      }),
      options,
    );
  }

  /** POST /admin/realms/{realm}/clients/{client-uuid}/authz/resource-server/scope */
  postAdminRealmsRealmClientsClientUuidAuthzResourceServerScope(
    realm: number | string,
    clientUuid: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route('admin/realms/{realm}/clients/{client-uuid}/authz/resource-server/scope', {
        realm,
        'client-uuid': clientUuid,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/clients/{client-uuid}/authz/resource-server/scope/search */
  getAdminRealmsRealmClientsClientUuidAuthzResourceServerScopeSearch(
    realm: number | string,
    clientUuid: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/clients/{client-uuid}/authz/resource-server/scope/search', {
        realm,
        'client-uuid': clientUuid,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/clients/{client-uuid}/authz/resource-server/scope/{scope-id} */
  getAdminRealmsRealmClientsClientUuidAuthzResourceServerScopeScopeId(
    realm: number | string,
    clientUuid: number | string,
    scopeId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route(
        'admin/realms/{realm}/clients/{client-uuid}/authz/resource-server/scope/{scope-id}',
        { realm, 'client-uuid': clientUuid, 'scope-id': scopeId },
      ),
      options,
    );
  }

  /** PUT /admin/realms/{realm}/clients/{client-uuid}/authz/resource-server/scope/{scope-id} */
  putAdminRealmsRealmClientsClientUuidAuthzResourceServerScopeScopeId(
    realm: number | string,
    clientUuid: number | string,
    scopeId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.put(
      this.route(
        'admin/realms/{realm}/clients/{client-uuid}/authz/resource-server/scope/{scope-id}',
        { realm, 'client-uuid': clientUuid, 'scope-id': scopeId },
      ),
      options,
    );
  }

  /** DELETE /admin/realms/{realm}/clients/{client-uuid}/authz/resource-server/scope/{scope-id} */
  deleteAdminRealmsRealmClientsClientUuidAuthzResourceServerScopeScopeId(
    realm: number | string,
    clientUuid: number | string,
    scopeId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(
      this.route(
        'admin/realms/{realm}/clients/{client-uuid}/authz/resource-server/scope/{scope-id}',
        { realm, 'client-uuid': clientUuid, 'scope-id': scopeId },
      ),
      options,
    );
  }

  /** GET /admin/realms/{realm}/clients/{client-uuid}/authz/resource-server/scope/{scope-id}/permissions */
  getAdminRealmsRealmClientsClientUuidAuthzResourceServerScopeScopeIdPermissions(
    realm: number | string,
    clientUuid: number | string,
    scopeId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route(
        'admin/realms/{realm}/clients/{client-uuid}/authz/resource-server/scope/{scope-id}/permissions',
        { realm, 'client-uuid': clientUuid, 'scope-id': scopeId },
      ),
      options,
    );
  }

  /** GET /admin/realms/{realm}/clients/{client-uuid}/authz/resource-server/scope/{scope-id}/resources */
  getAdminRealmsRealmClientsClientUuidAuthzResourceServerScopeScopeIdResources(
    realm: number | string,
    clientUuid: number | string,
    scopeId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route(
        'admin/realms/{realm}/clients/{client-uuid}/authz/resource-server/scope/{scope-id}/resources',
        { realm, 'client-uuid': clientUuid, 'scope-id': scopeId },
      ),
      options,
    );
  }

  /** GET /admin/realms/{realm}/clients/{client-uuid}/authz/resource-server/settings */
  getAdminRealmsRealmClientsClientUuidAuthzResourceServerSettings(
    realm: number | string,
    clientUuid: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/clients/{client-uuid}/authz/resource-server/settings', {
        realm,
        'client-uuid': clientUuid,
      }),
      options,
    );
  }
}
