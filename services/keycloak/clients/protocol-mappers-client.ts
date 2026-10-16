import type { APIResponse } from '@playwright/test';
import { BaseClient, type RequestOptions } from '../../../helpers/base-client';

/** `Protocol Mappers` operations. Methods return the raw response; the spec asserts. */
export class ProtocolMappersClient extends BaseClient {
  /** POST /admin/realms/{realm}/client-scopes/{client-scope-id}/protocol-mappers/add-models: Create multiple mappers */
  postAdminRealmsRealmClientScopesClientScopeIdProtocolMappersAddModels(
    realm: number | string,
    clientScopeId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route(
        'admin/realms/{realm}/client-scopes/{client-scope-id}/protocol-mappers/add-models',
        { realm, 'client-scope-id': clientScopeId },
      ),
      options,
    );
  }

  /** GET /admin/realms/{realm}/client-scopes/{client-scope-id}/protocol-mappers/models: Get mappers */
  getAdminRealmsRealmClientScopesClientScopeIdProtocolMappersModels(
    realm: number | string,
    clientScopeId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/client-scopes/{client-scope-id}/protocol-mappers/models', {
        realm,
        'client-scope-id': clientScopeId,
      }),
      options,
    );
  }

  /** POST /admin/realms/{realm}/client-scopes/{client-scope-id}/protocol-mappers/models: Create a mapper */
  postAdminRealmsRealmClientScopesClientScopeIdProtocolMappersModels(
    realm: number | string,
    clientScopeId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route('admin/realms/{realm}/client-scopes/{client-scope-id}/protocol-mappers/models', {
        realm,
        'client-scope-id': clientScopeId,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/client-scopes/{client-scope-id}/protocol-mappers/models/{id}: Get mapper by id */
  getAdminRealmsRealmClientScopesClientScopeIdProtocolMappersModelsId(
    realm: number | string,
    clientScopeId: number | string,
    id: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route(
        'admin/realms/{realm}/client-scopes/{client-scope-id}/protocol-mappers/models/{id}',
        { realm, 'client-scope-id': clientScopeId, id },
      ),
      options,
    );
  }

  /** PUT /admin/realms/{realm}/client-scopes/{client-scope-id}/protocol-mappers/models/{id}: Update the mapper */
  putAdminRealmsRealmClientScopesClientScopeIdProtocolMappersModelsId(
    realm: number | string,
    clientScopeId: number | string,
    id: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.put(
      this.route(
        'admin/realms/{realm}/client-scopes/{client-scope-id}/protocol-mappers/models/{id}',
        { realm, 'client-scope-id': clientScopeId, id },
      ),
      options,
    );
  }

  /** DELETE /admin/realms/{realm}/client-scopes/{client-scope-id}/protocol-mappers/models/{id}: Delete the mapper */
  deleteAdminRealmsRealmClientScopesClientScopeIdProtocolMappersModelsId(
    realm: number | string,
    clientScopeId: number | string,
    id: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(
      this.route(
        'admin/realms/{realm}/client-scopes/{client-scope-id}/protocol-mappers/models/{id}',
        { realm, 'client-scope-id': clientScopeId, id },
      ),
      options,
    );
  }

  /** GET /admin/realms/{realm}/client-scopes/{client-scope-id}/protocol-mappers/protocol/{protocol}: Get mappers by name for a specific protocol */
  getAdminRealmsRealmClientScopesClientScopeIdProtocolMappersProtocolProtocol(
    realm: number | string,
    clientScopeId: number | string,
    protocol: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route(
        'admin/realms/{realm}/client-scopes/{client-scope-id}/protocol-mappers/protocol/{protocol}',
        { realm, 'client-scope-id': clientScopeId, protocol },
      ),
      options,
    );
  }

  /** POST /admin/realms/{realm}/client-templates/{client-scope-id}/protocol-mappers/add-models: Create multiple mappers */
  postAdminRealmsRealmClientTemplatesClientScopeIdProtocolMappersAddModels(
    realm: number | string,
    clientScopeId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route(
        'admin/realms/{realm}/client-templates/{client-scope-id}/protocol-mappers/add-models',
        { realm, 'client-scope-id': clientScopeId },
      ),
      options,
    );
  }

  /** GET /admin/realms/{realm}/client-templates/{client-scope-id}/protocol-mappers/models: Get mappers */
  getAdminRealmsRealmClientTemplatesClientScopeIdProtocolMappersModels(
    realm: number | string,
    clientScopeId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route(
        'admin/realms/{realm}/client-templates/{client-scope-id}/protocol-mappers/models',
        { realm, 'client-scope-id': clientScopeId },
      ),
      options,
    );
  }

  /** POST /admin/realms/{realm}/client-templates/{client-scope-id}/protocol-mappers/models: Create a mapper */
  postAdminRealmsRealmClientTemplatesClientScopeIdProtocolMappersModels(
    realm: number | string,
    clientScopeId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route(
        'admin/realms/{realm}/client-templates/{client-scope-id}/protocol-mappers/models',
        { realm, 'client-scope-id': clientScopeId },
      ),
      options,
    );
  }

  /** GET /admin/realms/{realm}/client-templates/{client-scope-id}/protocol-mappers/models/{id}: Get mapper by id */
  getAdminRealmsRealmClientTemplatesClientScopeIdProtocolMappersModelsId(
    realm: number | string,
    clientScopeId: number | string,
    id: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route(
        'admin/realms/{realm}/client-templates/{client-scope-id}/protocol-mappers/models/{id}',
        { realm, 'client-scope-id': clientScopeId, id },
      ),
      options,
    );
  }

  /** PUT /admin/realms/{realm}/client-templates/{client-scope-id}/protocol-mappers/models/{id}: Update the mapper */
  putAdminRealmsRealmClientTemplatesClientScopeIdProtocolMappersModelsId(
    realm: number | string,
    clientScopeId: number | string,
    id: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.put(
      this.route(
        'admin/realms/{realm}/client-templates/{client-scope-id}/protocol-mappers/models/{id}',
        { realm, 'client-scope-id': clientScopeId, id },
      ),
      options,
    );
  }

  /** DELETE /admin/realms/{realm}/client-templates/{client-scope-id}/protocol-mappers/models/{id}: Delete the mapper */
  deleteAdminRealmsRealmClientTemplatesClientScopeIdProtocolMappersModelsId(
    realm: number | string,
    clientScopeId: number | string,
    id: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(
      this.route(
        'admin/realms/{realm}/client-templates/{client-scope-id}/protocol-mappers/models/{id}',
        { realm, 'client-scope-id': clientScopeId, id },
      ),
      options,
    );
  }

  /** GET /admin/realms/{realm}/client-templates/{client-scope-id}/protocol-mappers/protocol/{protocol}: Get mappers by name for a specific protocol */
  getAdminRealmsRealmClientTemplatesClientScopeIdProtocolMappersProtocolProtocol(
    realm: number | string,
    clientScopeId: number | string,
    protocol: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route(
        'admin/realms/{realm}/client-templates/{client-scope-id}/protocol-mappers/protocol/{protocol}',
        { realm, 'client-scope-id': clientScopeId, protocol },
      ),
      options,
    );
  }

  /** POST /admin/realms/{realm}/clients/{client-uuid}/protocol-mappers/add-models: Create multiple mappers */
  postAdminRealmsRealmClientsClientUuidProtocolMappersAddModels(
    realm: number | string,
    clientUuid: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route('admin/realms/{realm}/clients/{client-uuid}/protocol-mappers/add-models', {
        realm,
        'client-uuid': clientUuid,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/clients/{client-uuid}/protocol-mappers/models: Get mappers */
  getAdminRealmsRealmClientsClientUuidProtocolMappersModels(
    realm: number | string,
    clientUuid: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/clients/{client-uuid}/protocol-mappers/models', {
        realm,
        'client-uuid': clientUuid,
      }),
      options,
    );
  }

  /** POST /admin/realms/{realm}/clients/{client-uuid}/protocol-mappers/models: Create a mapper */
  postAdminRealmsRealmClientsClientUuidProtocolMappersModels(
    realm: number | string,
    clientUuid: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route('admin/realms/{realm}/clients/{client-uuid}/protocol-mappers/models', {
        realm,
        'client-uuid': clientUuid,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/clients/{client-uuid}/protocol-mappers/models/{id}: Get mapper by id */
  getAdminRealmsRealmClientsClientUuidProtocolMappersModelsId(
    realm: number | string,
    clientUuid: number | string,
    id: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/clients/{client-uuid}/protocol-mappers/models/{id}', {
        realm,
        'client-uuid': clientUuid,
        id,
      }),
      options,
    );
  }

  /** PUT /admin/realms/{realm}/clients/{client-uuid}/protocol-mappers/models/{id}: Update the mapper */
  putAdminRealmsRealmClientsClientUuidProtocolMappersModelsId(
    realm: number | string,
    clientUuid: number | string,
    id: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.put(
      this.route('admin/realms/{realm}/clients/{client-uuid}/protocol-mappers/models/{id}', {
        realm,
        'client-uuid': clientUuid,
        id,
      }),
      options,
    );
  }

  /** DELETE /admin/realms/{realm}/clients/{client-uuid}/protocol-mappers/models/{id}: Delete the mapper */
  deleteAdminRealmsRealmClientsClientUuidProtocolMappersModelsId(
    realm: number | string,
    clientUuid: number | string,
    id: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(
      this.route('admin/realms/{realm}/clients/{client-uuid}/protocol-mappers/models/{id}', {
        realm,
        'client-uuid': clientUuid,
        id,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/clients/{client-uuid}/protocol-mappers/protocol/{protocol}: Get mappers by name for a specific protocol */
  getAdminRealmsRealmClientsClientUuidProtocolMappersProtocolProtocol(
    realm: number | string,
    clientUuid: number | string,
    protocol: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route(
        'admin/realms/{realm}/clients/{client-uuid}/protocol-mappers/protocol/{protocol}',
        { realm, 'client-uuid': clientUuid, protocol },
      ),
      options,
    );
  }
}
