import type { APIResponse } from '@playwright/test';
import { BaseClient, type RequestOptions } from '../../../helpers/base-client';

/** `Scope Mappings` operations. Methods return the raw response; the spec asserts. */
export class ScopeMappingsClient extends BaseClient {
  /** GET /admin/realms/{realm}/client-scopes/{client-scope-id}/scope-mappings: Get all scope mappings for the client */
  getAdminRealmsRealmClientScopesClientScopeIdScopeMappings(
    realm: number | string,
    clientScopeId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/client-scopes/{client-scope-id}/scope-mappings', {
        realm,
        'client-scope-id': clientScopeId,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/client-scopes/{client-scope-id}/scope-mappings/clients/{client}: Get the roles associated with a client's scope Returns roles for the client. */
  getAdminRealmsRealmClientScopesClientScopeIdScopeMappingsClientsClient(
    realm: number | string,
    clientScopeId: number | string,
    client: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route(
        'admin/realms/{realm}/client-scopes/{client-scope-id}/scope-mappings/clients/{client}',
        { realm, 'client-scope-id': clientScopeId, client },
      ),
      options,
    );
  }

  /** POST /admin/realms/{realm}/client-scopes/{client-scope-id}/scope-mappings/clients/{client}: Add client-level roles to the client's scope */
  postAdminRealmsRealmClientScopesClientScopeIdScopeMappingsClientsClient(
    realm: number | string,
    clientScopeId: number | string,
    client: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route(
        'admin/realms/{realm}/client-scopes/{client-scope-id}/scope-mappings/clients/{client}',
        { realm, 'client-scope-id': clientScopeId, client },
      ),
      options,
    );
  }

  /** DELETE /admin/realms/{realm}/client-scopes/{client-scope-id}/scope-mappings/clients/{client}: Remove client-level roles from the client's scope. */
  deleteAdminRealmsRealmClientScopesClientScopeIdScopeMappingsClientsClient(
    realm: number | string,
    clientScopeId: number | string,
    client: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(
      this.route(
        'admin/realms/{realm}/client-scopes/{client-scope-id}/scope-mappings/clients/{client}',
        { realm, 'client-scope-id': clientScopeId, client },
      ),
      options,
    );
  }

  /** GET /admin/realms/{realm}/client-scopes/{client-scope-id}/scope-mappings/clients/{client}/available: The available client-level roles Returns the roles for the client that can be associated with the client's scope */
  getAdminRealmsRealmClientScopesClientScopeIdScopeMappingsClientsClientAvailable(
    realm: number | string,
    clientScopeId: number | string,
    client: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route(
        'admin/realms/{realm}/client-scopes/{client-scope-id}/scope-mappings/clients/{client}/available',
        { realm, 'client-scope-id': clientScopeId, client },
      ),
      options,
    );
  }

  /** GET /admin/realms/{realm}/client-scopes/{client-scope-id}/scope-mappings/clients/{client}/composite: Get effective client roles Returns the roles for the client that are associated with the client's scope. */
  getAdminRealmsRealmClientScopesClientScopeIdScopeMappingsClientsClientComposite(
    realm: number | string,
    clientScopeId: number | string,
    client: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route(
        'admin/realms/{realm}/client-scopes/{client-scope-id}/scope-mappings/clients/{client}/composite',
        { realm, 'client-scope-id': clientScopeId, client },
      ),
      options,
    );
  }

  /** GET /admin/realms/{realm}/client-scopes/{client-scope-id}/scope-mappings/realm: Get realm-level roles associated with the client's scope */
  getAdminRealmsRealmClientScopesClientScopeIdScopeMappingsRealm(
    realm: number | string,
    clientScopeId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/client-scopes/{client-scope-id}/scope-mappings/realm', {
        realm,
        'client-scope-id': clientScopeId,
      }),
      options,
    );
  }

  /** POST /admin/realms/{realm}/client-scopes/{client-scope-id}/scope-mappings/realm: Add a set of realm-level roles to the client's scope */
  postAdminRealmsRealmClientScopesClientScopeIdScopeMappingsRealm(
    realm: number | string,
    clientScopeId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route('admin/realms/{realm}/client-scopes/{client-scope-id}/scope-mappings/realm', {
        realm,
        'client-scope-id': clientScopeId,
      }),
      options,
    );
  }

  /** DELETE /admin/realms/{realm}/client-scopes/{client-scope-id}/scope-mappings/realm: Remove a set of realm-level roles from the client's scope */
  deleteAdminRealmsRealmClientScopesClientScopeIdScopeMappingsRealm(
    realm: number | string,
    clientScopeId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(
      this.route('admin/realms/{realm}/client-scopes/{client-scope-id}/scope-mappings/realm', {
        realm,
        'client-scope-id': clientScopeId,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/client-scopes/{client-scope-id}/scope-mappings/realm/available: Get realm-level roles that are available to attach to this client's scope */
  getAdminRealmsRealmClientScopesClientScopeIdScopeMappingsRealmAvailable(
    realm: number | string,
    clientScopeId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route(
        'admin/realms/{realm}/client-scopes/{client-scope-id}/scope-mappings/realm/available',
        { realm, 'client-scope-id': clientScopeId },
      ),
      options,
    );
  }

  /** GET /admin/realms/{realm}/client-scopes/{client-scope-id}/scope-mappings/realm/composite: Get effective realm-level roles associated with the client’s scope What this does is recurse any composite roles associated with the client’s scope and adds the roles to this lists. */
  getAdminRealmsRealmClientScopesClientScopeIdScopeMappingsRealmComposite(
    realm: number | string,
    clientScopeId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route(
        'admin/realms/{realm}/client-scopes/{client-scope-id}/scope-mappings/realm/composite',
        { realm, 'client-scope-id': clientScopeId },
      ),
      options,
    );
  }

  /** GET /admin/realms/{realm}/client-templates/{client-scope-id}/scope-mappings: Get all scope mappings for the client */
  getAdminRealmsRealmClientTemplatesClientScopeIdScopeMappings(
    realm: number | string,
    clientScopeId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/client-templates/{client-scope-id}/scope-mappings', {
        realm,
        'client-scope-id': clientScopeId,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/client-templates/{client-scope-id}/scope-mappings/clients/{client}: Get the roles associated with a client's scope Returns roles for the client. */
  getAdminRealmsRealmClientTemplatesClientScopeIdScopeMappingsClientsClient(
    realm: number | string,
    clientScopeId: number | string,
    client: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route(
        'admin/realms/{realm}/client-templates/{client-scope-id}/scope-mappings/clients/{client}',
        { realm, 'client-scope-id': clientScopeId, client },
      ),
      options,
    );
  }

  /** POST /admin/realms/{realm}/client-templates/{client-scope-id}/scope-mappings/clients/{client}: Add client-level roles to the client's scope */
  postAdminRealmsRealmClientTemplatesClientScopeIdScopeMappingsClientsClient(
    realm: number | string,
    clientScopeId: number | string,
    client: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route(
        'admin/realms/{realm}/client-templates/{client-scope-id}/scope-mappings/clients/{client}',
        { realm, 'client-scope-id': clientScopeId, client },
      ),
      options,
    );
  }

  /** DELETE /admin/realms/{realm}/client-templates/{client-scope-id}/scope-mappings/clients/{client}: Remove client-level roles from the client's scope. */
  deleteAdminRealmsRealmClientTemplatesClientScopeIdScopeMappingsClientsClient(
    realm: number | string,
    clientScopeId: number | string,
    client: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(
      this.route(
        'admin/realms/{realm}/client-templates/{client-scope-id}/scope-mappings/clients/{client}',
        { realm, 'client-scope-id': clientScopeId, client },
      ),
      options,
    );
  }

  /** GET /admin/realms/{realm}/client-templates/{client-scope-id}/scope-mappings/clients/{client}/available: The available client-level roles Returns the roles for the client that can be associated with the client's scope */
  getAdminRealmsRealmClientTemplatesClientScopeIdScopeMappingsClientsClientAvailable(
    realm: number | string,
    clientScopeId: number | string,
    client: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route(
        'admin/realms/{realm}/client-templates/{client-scope-id}/scope-mappings/clients/{client}/available',
        { realm, 'client-scope-id': clientScopeId, client },
      ),
      options,
    );
  }

  /** GET /admin/realms/{realm}/client-templates/{client-scope-id}/scope-mappings/clients/{client}/composite: Get effective client roles Returns the roles for the client that are associated with the client's scope. */
  getAdminRealmsRealmClientTemplatesClientScopeIdScopeMappingsClientsClientComposite(
    realm: number | string,
    clientScopeId: number | string,
    client: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route(
        'admin/realms/{realm}/client-templates/{client-scope-id}/scope-mappings/clients/{client}/composite',
        { realm, 'client-scope-id': clientScopeId, client },
      ),
      options,
    );
  }

  /** GET /admin/realms/{realm}/client-templates/{client-scope-id}/scope-mappings/realm: Get realm-level roles associated with the client's scope */
  getAdminRealmsRealmClientTemplatesClientScopeIdScopeMappingsRealm(
    realm: number | string,
    clientScopeId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/client-templates/{client-scope-id}/scope-mappings/realm', {
        realm,
        'client-scope-id': clientScopeId,
      }),
      options,
    );
  }

  /** POST /admin/realms/{realm}/client-templates/{client-scope-id}/scope-mappings/realm: Add a set of realm-level roles to the client's scope */
  postAdminRealmsRealmClientTemplatesClientScopeIdScopeMappingsRealm(
    realm: number | string,
    clientScopeId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route('admin/realms/{realm}/client-templates/{client-scope-id}/scope-mappings/realm', {
        realm,
        'client-scope-id': clientScopeId,
      }),
      options,
    );
  }

  /** DELETE /admin/realms/{realm}/client-templates/{client-scope-id}/scope-mappings/realm: Remove a set of realm-level roles from the client's scope */
  deleteAdminRealmsRealmClientTemplatesClientScopeIdScopeMappingsRealm(
    realm: number | string,
    clientScopeId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(
      this.route('admin/realms/{realm}/client-templates/{client-scope-id}/scope-mappings/realm', {
        realm,
        'client-scope-id': clientScopeId,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/client-templates/{client-scope-id}/scope-mappings/realm/available: Get realm-level roles that are available to attach to this client's scope */
  getAdminRealmsRealmClientTemplatesClientScopeIdScopeMappingsRealmAvailable(
    realm: number | string,
    clientScopeId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route(
        'admin/realms/{realm}/client-templates/{client-scope-id}/scope-mappings/realm/available',
        { realm, 'client-scope-id': clientScopeId },
      ),
      options,
    );
  }

  /** GET /admin/realms/{realm}/client-templates/{client-scope-id}/scope-mappings/realm/composite: Get effective realm-level roles associated with the client’s scope What this does is recurse any composite roles associated with the client’s scope and adds the roles to this lists. */
  getAdminRealmsRealmClientTemplatesClientScopeIdScopeMappingsRealmComposite(
    realm: number | string,
    clientScopeId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route(
        'admin/realms/{realm}/client-templates/{client-scope-id}/scope-mappings/realm/composite',
        { realm, 'client-scope-id': clientScopeId },
      ),
      options,
    );
  }

  /** GET /admin/realms/{realm}/clients/{client-uuid}/scope-mappings: Get all scope mappings for the client */
  getAdminRealmsRealmClientsClientUuidScopeMappings(
    realm: number | string,
    clientUuid: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/clients/{client-uuid}/scope-mappings', {
        realm,
        'client-uuid': clientUuid,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/clients/{client-uuid}/scope-mappings/clients/{client}: Get the roles associated with a client's scope Returns roles for the client. */
  getAdminRealmsRealmClientsClientUuidScopeMappingsClientsClient(
    realm: number | string,
    clientUuid: number | string,
    client: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/clients/{client-uuid}/scope-mappings/clients/{client}', {
        realm,
        'client-uuid': clientUuid,
        client,
      }),
      options,
    );
  }

  /** POST /admin/realms/{realm}/clients/{client-uuid}/scope-mappings/clients/{client}: Add client-level roles to the client's scope */
  postAdminRealmsRealmClientsClientUuidScopeMappingsClientsClient(
    realm: number | string,
    clientUuid: number | string,
    client: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route('admin/realms/{realm}/clients/{client-uuid}/scope-mappings/clients/{client}', {
        realm,
        'client-uuid': clientUuid,
        client,
      }),
      options,
    );
  }

  /** DELETE /admin/realms/{realm}/clients/{client-uuid}/scope-mappings/clients/{client}: Remove client-level roles from the client's scope. */
  deleteAdminRealmsRealmClientsClientUuidScopeMappingsClientsClient(
    realm: number | string,
    clientUuid: number | string,
    client: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(
      this.route('admin/realms/{realm}/clients/{client-uuid}/scope-mappings/clients/{client}', {
        realm,
        'client-uuid': clientUuid,
        client,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/clients/{client-uuid}/scope-mappings/clients/{client}/available: The available client-level roles Returns the roles for the client that can be associated with the client's scope */
  getAdminRealmsRealmClientsClientUuidScopeMappingsClientsClientAvailable(
    realm: number | string,
    clientUuid: number | string,
    client: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route(
        'admin/realms/{realm}/clients/{client-uuid}/scope-mappings/clients/{client}/available',
        { realm, 'client-uuid': clientUuid, client },
      ),
      options,
    );
  }

  /** GET /admin/realms/{realm}/clients/{client-uuid}/scope-mappings/clients/{client}/composite: Get effective client roles Returns the roles for the client that are associated with the client's scope. */
  getAdminRealmsRealmClientsClientUuidScopeMappingsClientsClientComposite(
    realm: number | string,
    clientUuid: number | string,
    client: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route(
        'admin/realms/{realm}/clients/{client-uuid}/scope-mappings/clients/{client}/composite',
        { realm, 'client-uuid': clientUuid, client },
      ),
      options,
    );
  }

  /** GET /admin/realms/{realm}/clients/{client-uuid}/scope-mappings/realm: Get realm-level roles associated with the client's scope */
  getAdminRealmsRealmClientsClientUuidScopeMappingsRealm(
    realm: number | string,
    clientUuid: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/clients/{client-uuid}/scope-mappings/realm', {
        realm,
        'client-uuid': clientUuid,
      }),
      options,
    );
  }

  /** POST /admin/realms/{realm}/clients/{client-uuid}/scope-mappings/realm: Add a set of realm-level roles to the client's scope */
  postAdminRealmsRealmClientsClientUuidScopeMappingsRealm(
    realm: number | string,
    clientUuid: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route('admin/realms/{realm}/clients/{client-uuid}/scope-mappings/realm', {
        realm,
        'client-uuid': clientUuid,
      }),
      options,
    );
  }

  /** DELETE /admin/realms/{realm}/clients/{client-uuid}/scope-mappings/realm: Remove a set of realm-level roles from the client's scope */
  deleteAdminRealmsRealmClientsClientUuidScopeMappingsRealm(
    realm: number | string,
    clientUuid: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(
      this.route('admin/realms/{realm}/clients/{client-uuid}/scope-mappings/realm', {
        realm,
        'client-uuid': clientUuid,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/clients/{client-uuid}/scope-mappings/realm/available: Get realm-level roles that are available to attach to this client's scope */
  getAdminRealmsRealmClientsClientUuidScopeMappingsRealmAvailable(
    realm: number | string,
    clientUuid: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/clients/{client-uuid}/scope-mappings/realm/available', {
        realm,
        'client-uuid': clientUuid,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/clients/{client-uuid}/scope-mappings/realm/composite: Get effective realm-level roles associated with the client’s scope What this does is recurse any composite roles associated with the client’s scope and adds the roles to this lists. */
  getAdminRealmsRealmClientsClientUuidScopeMappingsRealmComposite(
    realm: number | string,
    clientUuid: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/clients/{client-uuid}/scope-mappings/realm/composite', {
        realm,
        'client-uuid': clientUuid,
      }),
      options,
    );
  }
}
