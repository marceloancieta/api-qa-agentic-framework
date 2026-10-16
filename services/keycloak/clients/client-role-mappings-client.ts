import type { APIResponse } from '@playwright/test';
import { BaseClient, type RequestOptions } from '../../../helpers/base-client';

/** `Client Role Mappings` operations. Methods return the raw response; the spec asserts. */
export class ClientRoleMappingsClient extends BaseClient {
  /** GET /admin/realms/{realm}/groups/{group-id}/role-mappings/clients/{client-id}: Get client-level role mappings for the user or group, and the app */
  getAdminRealmsRealmGroupsGroupIdRoleMappingsClientsClientId(
    realm: number | string,
    groupId: number | string,
    clientId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/groups/{group-id}/role-mappings/clients/{client-id}', {
        realm,
        'group-id': groupId,
        'client-id': clientId,
      }),
      options,
    );
  }

  /** POST /admin/realms/{realm}/groups/{group-id}/role-mappings/clients/{client-id}: Add client-level roles to the user or group role mapping */
  postAdminRealmsRealmGroupsGroupIdRoleMappingsClientsClientId(
    realm: number | string,
    groupId: number | string,
    clientId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route('admin/realms/{realm}/groups/{group-id}/role-mappings/clients/{client-id}', {
        realm,
        'group-id': groupId,
        'client-id': clientId,
      }),
      options,
    );
  }

  /** DELETE /admin/realms/{realm}/groups/{group-id}/role-mappings/clients/{client-id}: Delete client-level roles from user or group role mapping */
  deleteAdminRealmsRealmGroupsGroupIdRoleMappingsClientsClientId(
    realm: number | string,
    groupId: number | string,
    clientId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(
      this.route('admin/realms/{realm}/groups/{group-id}/role-mappings/clients/{client-id}', {
        realm,
        'group-id': groupId,
        'client-id': clientId,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/groups/{group-id}/role-mappings/clients/{client-id}/available: Get available client-level roles that can be mapped to the user or group */
  getAdminRealmsRealmGroupsGroupIdRoleMappingsClientsClientIdAvailable(
    realm: number | string,
    groupId: number | string,
    clientId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route(
        'admin/realms/{realm}/groups/{group-id}/role-mappings/clients/{client-id}/available',
        { realm, 'group-id': groupId, 'client-id': clientId },
      ),
      options,
    );
  }

  /** GET /admin/realms/{realm}/groups/{group-id}/role-mappings/clients/{client-id}/composite: Get effective client-level role mappings This recurses any composite roles */
  getAdminRealmsRealmGroupsGroupIdRoleMappingsClientsClientIdComposite(
    realm: number | string,
    groupId: number | string,
    clientId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route(
        'admin/realms/{realm}/groups/{group-id}/role-mappings/clients/{client-id}/composite',
        { realm, 'group-id': groupId, 'client-id': clientId },
      ),
      options,
    );
  }

  /** GET /admin/realms/{realm}/organizations/{org-id}/groups/{group-id}/role-mappings/clients/{client-id}: Get client-level role mappings for the user or group, and the app */
  getAdminRealmsRealmOrganizationsOrgIdGroupsGroupIdRoleMappingsClientsClientId(
    realm: number | string,
    orgId: number | string,
    groupId: number | string,
    clientId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route(
        'admin/realms/{realm}/organizations/{org-id}/groups/{group-id}/role-mappings/clients/{client-id}',
        { realm, 'org-id': orgId, 'group-id': groupId, 'client-id': clientId },
      ),
      options,
    );
  }

  /** POST /admin/realms/{realm}/organizations/{org-id}/groups/{group-id}/role-mappings/clients/{client-id}: Add client-level roles to the user or group role mapping */
  postAdminRealmsRealmOrganizationsOrgIdGroupsGroupIdRoleMappingsClientsClientId(
    realm: number | string,
    orgId: number | string,
    groupId: number | string,
    clientId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route(
        'admin/realms/{realm}/organizations/{org-id}/groups/{group-id}/role-mappings/clients/{client-id}',
        { realm, 'org-id': orgId, 'group-id': groupId, 'client-id': clientId },
      ),
      options,
    );
  }

  /** DELETE /admin/realms/{realm}/organizations/{org-id}/groups/{group-id}/role-mappings/clients/{client-id}: Delete client-level roles from user or group role mapping */
  deleteAdminRealmsRealmOrganizationsOrgIdGroupsGroupIdRoleMappingsClientsClientId(
    realm: number | string,
    orgId: number | string,
    groupId: number | string,
    clientId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(
      this.route(
        'admin/realms/{realm}/organizations/{org-id}/groups/{group-id}/role-mappings/clients/{client-id}',
        { realm, 'org-id': orgId, 'group-id': groupId, 'client-id': clientId },
      ),
      options,
    );
  }

  /** GET /admin/realms/{realm}/organizations/{org-id}/groups/{group-id}/role-mappings/clients/{client-id}/available: Get available client-level roles that can be mapped to the user or group */
  getAdminRealmsRealmOrganizationsOrgIdGroupsGroupIdRoleMappingsClientsClientIdAvailable(
    realm: number | string,
    orgId: number | string,
    groupId: number | string,
    clientId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route(
        'admin/realms/{realm}/organizations/{org-id}/groups/{group-id}/role-mappings/clients/{client-id}/available',
        { realm, 'org-id': orgId, 'group-id': groupId, 'client-id': clientId },
      ),
      options,
    );
  }

  /** GET /admin/realms/{realm}/organizations/{org-id}/groups/{group-id}/role-mappings/clients/{client-id}/composite: Get effective client-level role mappings This recurses any composite roles */
  getAdminRealmsRealmOrganizationsOrgIdGroupsGroupIdRoleMappingsClientsClientIdComposite(
    realm: number | string,
    orgId: number | string,
    groupId: number | string,
    clientId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route(
        'admin/realms/{realm}/organizations/{org-id}/groups/{group-id}/role-mappings/clients/{client-id}/composite',
        { realm, 'org-id': orgId, 'group-id': groupId, 'client-id': clientId },
      ),
      options,
    );
  }

  /** GET /admin/realms/{realm}/users/{user-id}/role-mappings/clients/{client-id}: Get client-level role mappings for the user or group, and the app */
  getAdminRealmsRealmUsersUserIdRoleMappingsClientsClientId(
    realm: number | string,
    userId: number | string,
    clientId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/users/{user-id}/role-mappings/clients/{client-id}', {
        realm,
        'user-id': userId,
        'client-id': clientId,
      }),
      options,
    );
  }

  /** POST /admin/realms/{realm}/users/{user-id}/role-mappings/clients/{client-id}: Add client-level roles to the user or group role mapping */
  postAdminRealmsRealmUsersUserIdRoleMappingsClientsClientId(
    realm: number | string,
    userId: number | string,
    clientId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route('admin/realms/{realm}/users/{user-id}/role-mappings/clients/{client-id}', {
        realm,
        'user-id': userId,
        'client-id': clientId,
      }),
      options,
    );
  }

  /** DELETE /admin/realms/{realm}/users/{user-id}/role-mappings/clients/{client-id}: Delete client-level roles from user or group role mapping */
  deleteAdminRealmsRealmUsersUserIdRoleMappingsClientsClientId(
    realm: number | string,
    userId: number | string,
    clientId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(
      this.route('admin/realms/{realm}/users/{user-id}/role-mappings/clients/{client-id}', {
        realm,
        'user-id': userId,
        'client-id': clientId,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/users/{user-id}/role-mappings/clients/{client-id}/available: Get available client-level roles that can be mapped to the user or group */
  getAdminRealmsRealmUsersUserIdRoleMappingsClientsClientIdAvailable(
    realm: number | string,
    userId: number | string,
    clientId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route(
        'admin/realms/{realm}/users/{user-id}/role-mappings/clients/{client-id}/available',
        { realm, 'user-id': userId, 'client-id': clientId },
      ),
      options,
    );
  }

  /** GET /admin/realms/{realm}/users/{user-id}/role-mappings/clients/{client-id}/composite: Get effective client-level role mappings This recurses any composite roles */
  getAdminRealmsRealmUsersUserIdRoleMappingsClientsClientIdComposite(
    realm: number | string,
    userId: number | string,
    clientId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route(
        'admin/realms/{realm}/users/{user-id}/role-mappings/clients/{client-id}/composite',
        { realm, 'user-id': userId, 'client-id': clientId },
      ),
      options,
    );
  }
}
