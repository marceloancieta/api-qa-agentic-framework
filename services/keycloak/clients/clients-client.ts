import type { APIResponse } from '@playwright/test';
import { BaseClient, type RequestOptions } from '../../../helpers/base-client';

/** `Clients` operations. Methods return the raw response; the spec asserts. */
export class ClientsClient extends BaseClient {
  /** GET /admin/realms/{realm}/clients: Get clients belonging to the realm. */
  getAdminRealmsRealmClients(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(this.route('admin/realms/{realm}/clients', { realm }), options);
  }

  /** POST /admin/realms/{realm}/clients: Create a new client Client’s client_id must be unique! */
  postAdminRealmsRealmClients(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(this.route('admin/realms/{realm}/clients', { realm }), options);
  }

  /** GET /admin/realms/{realm}/clients/{client-uuid}: Get representation of the client */
  getAdminRealmsRealmClientsClientUuid(
    realm: number | string,
    clientUuid: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/clients/{client-uuid}', {
        realm,
        'client-uuid': clientUuid,
      }),
      options,
    );
  }

  /** PUT /admin/realms/{realm}/clients/{client-uuid}: Update the client */
  putAdminRealmsRealmClientsClientUuid(
    realm: number | string,
    clientUuid: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.put(
      this.route('admin/realms/{realm}/clients/{client-uuid}', {
        realm,
        'client-uuid': clientUuid,
      }),
      options,
    );
  }

  /** DELETE /admin/realms/{realm}/clients/{client-uuid}: Delete the client */
  deleteAdminRealmsRealmClientsClientUuid(
    realm: number | string,
    clientUuid: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(
      this.route('admin/realms/{realm}/clients/{client-uuid}', {
        realm,
        'client-uuid': clientUuid,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/clients/{client-uuid}/client-secret: Get the client secret */
  getAdminRealmsRealmClientsClientUuidClientSecret(
    realm: number | string,
    clientUuid: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/clients/{client-uuid}/client-secret', {
        realm,
        'client-uuid': clientUuid,
      }),
      options,
    );
  }

  /** POST /admin/realms/{realm}/clients/{client-uuid}/client-secret: Generate a new secret for the client */
  postAdminRealmsRealmClientsClientUuidClientSecret(
    realm: number | string,
    clientUuid: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route('admin/realms/{realm}/clients/{client-uuid}/client-secret', {
        realm,
        'client-uuid': clientUuid,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/clients/{client-uuid}/client-secret/rotated: Get the rotated client secret */
  getAdminRealmsRealmClientsClientUuidClientSecretRotated(
    realm: number | string,
    clientUuid: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/clients/{client-uuid}/client-secret/rotated', {
        realm,
        'client-uuid': clientUuid,
      }),
      options,
    );
  }

  /** DELETE /admin/realms/{realm}/clients/{client-uuid}/client-secret/rotated: Invalidate the rotated secret for the client */
  deleteAdminRealmsRealmClientsClientUuidClientSecretRotated(
    realm: number | string,
    clientUuid: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(
      this.route('admin/realms/{realm}/clients/{client-uuid}/client-secret/rotated', {
        realm,
        'client-uuid': clientUuid,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/clients/{client-uuid}/default-client-scopes: Get default client scopes. Only name and ids are returned. */
  getAdminRealmsRealmClientsClientUuidDefaultClientScopes(
    realm: number | string,
    clientUuid: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/clients/{client-uuid}/default-client-scopes', {
        realm,
        'client-uuid': clientUuid,
      }),
      options,
    );
  }

  /** PUT /admin/realms/{realm}/clients/{client-uuid}/default-client-scopes/{clientScopeId} */
  putAdminRealmsRealmClientsClientUuidDefaultClientScopesClientScopeId(
    realm: number | string,
    clientUuid: number | string,
    clientScopeId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.put(
      this.route(
        'admin/realms/{realm}/clients/{client-uuid}/default-client-scopes/{clientScopeId}',
        { realm, 'client-uuid': clientUuid, clientScopeId },
      ),
      options,
    );
  }

  /** DELETE /admin/realms/{realm}/clients/{client-uuid}/default-client-scopes/{clientScopeId} */
  deleteAdminRealmsRealmClientsClientUuidDefaultClientScopesClientScopeId(
    realm: number | string,
    clientUuid: number | string,
    clientScopeId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(
      this.route(
        'admin/realms/{realm}/clients/{client-uuid}/default-client-scopes/{clientScopeId}',
        { realm, 'client-uuid': clientUuid, clientScopeId },
      ),
      options,
    );
  }

  /** GET /admin/realms/{realm}/clients/{client-uuid}/evaluate-scopes/generate-example-access-token: Create JSON with payload of example access token */
  getAdminRealmsRealmClientsClientUuidEvaluateScopesGenerateExampleAccessToken(
    realm: number | string,
    clientUuid: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route(
        'admin/realms/{realm}/clients/{client-uuid}/evaluate-scopes/generate-example-access-token',
        { realm, 'client-uuid': clientUuid },
      ),
      options,
    );
  }

  /** GET /admin/realms/{realm}/clients/{client-uuid}/evaluate-scopes/generate-example-id-token: Create JSON with payload of example id token */
  getAdminRealmsRealmClientsClientUuidEvaluateScopesGenerateExampleIdToken(
    realm: number | string,
    clientUuid: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route(
        'admin/realms/{realm}/clients/{client-uuid}/evaluate-scopes/generate-example-id-token',
        { realm, 'client-uuid': clientUuid },
      ),
      options,
    );
  }

  /** GET /admin/realms/{realm}/clients/{client-uuid}/evaluate-scopes/generate-example-saml-response: Create JSON with an example SAML response as payload */
  getAdminRealmsRealmClientsClientUuidEvaluateScopesGenerateExampleSamlResponse(
    realm: number | string,
    clientUuid: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route(
        'admin/realms/{realm}/clients/{client-uuid}/evaluate-scopes/generate-example-saml-response',
        { realm, 'client-uuid': clientUuid },
      ),
      options,
    );
  }

  /** GET /admin/realms/{realm}/clients/{client-uuid}/evaluate-scopes/generate-example-userinfo: Create JSON with payload of example user info */
  getAdminRealmsRealmClientsClientUuidEvaluateScopesGenerateExampleUserinfo(
    realm: number | string,
    clientUuid: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route(
        'admin/realms/{realm}/clients/{client-uuid}/evaluate-scopes/generate-example-userinfo',
        { realm, 'client-uuid': clientUuid },
      ),
      options,
    );
  }

  /** GET /admin/realms/{realm}/clients/{client-uuid}/evaluate-scopes/protocol-mappers: Return list of all protocol mappers, which will be used when generating tokens issued for particular client. */
  getAdminRealmsRealmClientsClientUuidEvaluateScopesProtocolMappers(
    realm: number | string,
    clientUuid: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/clients/{client-uuid}/evaluate-scopes/protocol-mappers', {
        realm,
        'client-uuid': clientUuid,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/clients/{client-uuid}/evaluate-scopes/scope-mappings/{roleContainerId}/granted: Get effective scope mapping of all roles of particular role container, which this client is defacto allowed to have in the accessToken issued for him. */
  getAdminRealmsRealmClientsClientUuidEvaluateScopesScopeMappingsRoleContainerIdGranted(
    realm: number | string,
    clientUuid: number | string,
    roleContainerId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route(
        'admin/realms/{realm}/clients/{client-uuid}/evaluate-scopes/scope-mappings/{roleContainerId}/granted',
        { realm, 'client-uuid': clientUuid, roleContainerId },
      ),
      options,
    );
  }

  /** GET /admin/realms/{realm}/clients/{client-uuid}/evaluate-scopes/scope-mappings/{roleContainerId}/not-granted: Get roles, which this client doesn't have scope for and can't have them in the accessToken issued for him. */
  getAdminRealmsRealmClientsClientUuidEvaluateScopesScopeMappingsRoleContainerIdNotGranted(
    realm: number | string,
    clientUuid: number | string,
    roleContainerId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route(
        'admin/realms/{realm}/clients/{client-uuid}/evaluate-scopes/scope-mappings/{roleContainerId}/not-granted',
        { realm, 'client-uuid': clientUuid, roleContainerId },
      ),
      options,
    );
  }

  /** GET /admin/realms/{realm}/clients/{client-uuid}/installation/providers/{providerId} */
  getAdminRealmsRealmClientsClientUuidInstallationProvidersProviderId(
    realm: number | string,
    clientUuid: number | string,
    providerId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/clients/{client-uuid}/installation/providers/{providerId}', {
        realm,
        'client-uuid': clientUuid,
        providerId,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/clients/{client-uuid}/management/permissions: Return object stating whether client Authorization permissions have been initialized or not and a reference */
  getAdminRealmsRealmClientsClientUuidManagementPermissions(
    realm: number | string,
    clientUuid: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/clients/{client-uuid}/management/permissions', {
        realm,
        'client-uuid': clientUuid,
      }),
      options,
    );
  }

  /** PUT /admin/realms/{realm}/clients/{client-uuid}/management/permissions: Return object stating whether client Authorization permissions have been initialized or not and a reference */
  putAdminRealmsRealmClientsClientUuidManagementPermissions(
    realm: number | string,
    clientUuid: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.put(
      this.route('admin/realms/{realm}/clients/{client-uuid}/management/permissions', {
        realm,
        'client-uuid': clientUuid,
      }),
      options,
    );
  }

  /** POST /admin/realms/{realm}/clients/{client-uuid}/nodes: Register a cluster node with the client Manually register cluster node to this client - usually it’s not needed to call this directly as adapter should handle by sending registration request to Keycloak */
  postAdminRealmsRealmClientsClientUuidNodes(
    realm: number | string,
    clientUuid: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route('admin/realms/{realm}/clients/{client-uuid}/nodes', {
        realm,
        'client-uuid': clientUuid,
      }),
      options,
    );
  }

  /** DELETE /admin/realms/{realm}/clients/{client-uuid}/nodes/{node}: Unregister a cluster node from the client */
  deleteAdminRealmsRealmClientsClientUuidNodesNode(
    realm: number | string,
    clientUuid: number | string,
    node: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(
      this.route('admin/realms/{realm}/clients/{client-uuid}/nodes/{node}', {
        realm,
        'client-uuid': clientUuid,
        node,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/clients/{client-uuid}/offline-session-count: Get application offline session count Returns a number of offline user sessions associated with this client { "count": number } */
  getAdminRealmsRealmClientsClientUuidOfflineSessionCount(
    realm: number | string,
    clientUuid: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/clients/{client-uuid}/offline-session-count', {
        realm,
        'client-uuid': clientUuid,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/clients/{client-uuid}/offline-sessions: Get offline sessions for client. Returns a list of offline user sessions associated with this client */
  getAdminRealmsRealmClientsClientUuidOfflineSessions(
    realm: number | string,
    clientUuid: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/clients/{client-uuid}/offline-sessions', {
        realm,
        'client-uuid': clientUuid,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/clients/{client-uuid}/optional-client-scopes: Get optional client scopes. Only name and ids are returned. */
  getAdminRealmsRealmClientsClientUuidOptionalClientScopes(
    realm: number | string,
    clientUuid: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/clients/{client-uuid}/optional-client-scopes', {
        realm,
        'client-uuid': clientUuid,
      }),
      options,
    );
  }

  /** PUT /admin/realms/{realm}/clients/{client-uuid}/optional-client-scopes/{clientScopeId} */
  putAdminRealmsRealmClientsClientUuidOptionalClientScopesClientScopeId(
    realm: number | string,
    clientUuid: number | string,
    clientScopeId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.put(
      this.route(
        'admin/realms/{realm}/clients/{client-uuid}/optional-client-scopes/{clientScopeId}',
        { realm, 'client-uuid': clientUuid, clientScopeId },
      ),
      options,
    );
  }

  /** DELETE /admin/realms/{realm}/clients/{client-uuid}/optional-client-scopes/{clientScopeId} */
  deleteAdminRealmsRealmClientsClientUuidOptionalClientScopesClientScopeId(
    realm: number | string,
    clientUuid: number | string,
    clientScopeId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(
      this.route(
        'admin/realms/{realm}/clients/{client-uuid}/optional-client-scopes/{clientScopeId}',
        { realm, 'client-uuid': clientUuid, clientScopeId },
      ),
      options,
    );
  }

  /** POST /admin/realms/{realm}/clients/{client-uuid}/push-revocation: Push the client's revocation policy to its admin URL If the client has an admin URL, push revocation policy to it. */
  postAdminRealmsRealmClientsClientUuidPushRevocation(
    realm: number | string,
    clientUuid: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route('admin/realms/{realm}/clients/{client-uuid}/push-revocation', {
        realm,
        'client-uuid': clientUuid,
      }),
      options,
    );
  }

  /** POST /admin/realms/{realm}/clients/{client-uuid}/registration-access-token: Generate a new registration access token for the client */
  postAdminRealmsRealmClientsClientUuidRegistrationAccessToken(
    realm: number | string,
    clientUuid: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route('admin/realms/{realm}/clients/{client-uuid}/registration-access-token', {
        realm,
        'client-uuid': clientUuid,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/clients/{client-uuid}/service-account-user: Get a user dedicated to the service account */
  getAdminRealmsRealmClientsClientUuidServiceAccountUser(
    realm: number | string,
    clientUuid: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/clients/{client-uuid}/service-account-user', {
        realm,
        'client-uuid': clientUuid,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/clients/{client-uuid}/session-count: Get application session count Returns a number of user sessions associated with this client { "count": number } */
  getAdminRealmsRealmClientsClientUuidSessionCount(
    realm: number | string,
    clientUuid: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/clients/{client-uuid}/session-count', {
        realm,
        'client-uuid': clientUuid,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/clients/{client-uuid}/test-nodes-available: Test if registered cluster nodes are available Tests availability by sending 'ping' request to all cluster nodes. */
  getAdminRealmsRealmClientsClientUuidTestNodesAvailable(
    realm: number | string,
    clientUuid: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/clients/{client-uuid}/test-nodes-available', {
        realm,
        'client-uuid': clientUuid,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/clients/{client-uuid}/user-sessions: Get user sessions for client. Returns a list of user sessions associated with this client. */
  getAdminRealmsRealmClientsClientUuidUserSessions(
    realm: number | string,
    clientUuid: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/clients/{client-uuid}/user-sessions', {
        realm,
        'client-uuid': clientUuid,
      }),
      options,
    );
  }
}
