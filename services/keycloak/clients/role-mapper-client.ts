import type { APIResponse } from '@playwright/test';
import { BaseClient, type RequestOptions } from '../../../helpers/base-client';

/** `Role Mapper` operations. Methods return the raw response; the spec asserts. */
export class RoleMapperClient extends BaseClient {
  /** GET /admin/realms/{realm}/groups/{group-id}/role-mappings: Get role mappings */
  getAdminRealmsRealmGroupsGroupIdRoleMappings(
    realm: number | string,
    groupId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/groups/{group-id}/role-mappings', {
        realm,
        'group-id': groupId,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/groups/{group-id}/role-mappings/realm: Get realm-level role mappings */
  getAdminRealmsRealmGroupsGroupIdRoleMappingsRealm(
    realm: number | string,
    groupId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/groups/{group-id}/role-mappings/realm', {
        realm,
        'group-id': groupId,
      }),
      options,
    );
  }

  /** POST /admin/realms/{realm}/groups/{group-id}/role-mappings/realm: Add realm-level role mappings to the user */
  postAdminRealmsRealmGroupsGroupIdRoleMappingsRealm(
    realm: number | string,
    groupId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route('admin/realms/{realm}/groups/{group-id}/role-mappings/realm', {
        realm,
        'group-id': groupId,
      }),
      options,
    );
  }

  /** DELETE /admin/realms/{realm}/groups/{group-id}/role-mappings/realm: Delete realm-level role mappings */
  deleteAdminRealmsRealmGroupsGroupIdRoleMappingsRealm(
    realm: number | string,
    groupId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(
      this.route('admin/realms/{realm}/groups/{group-id}/role-mappings/realm', {
        realm,
        'group-id': groupId,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/groups/{group-id}/role-mappings/realm/available: Get realm-level roles that can be mapped */
  getAdminRealmsRealmGroupsGroupIdRoleMappingsRealmAvailable(
    realm: number | string,
    groupId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/groups/{group-id}/role-mappings/realm/available', {
        realm,
        'group-id': groupId,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/groups/{group-id}/role-mappings/realm/composite: Get effective realm-level role mappings This will recurse all composite roles to get the result. */
  getAdminRealmsRealmGroupsGroupIdRoleMappingsRealmComposite(
    realm: number | string,
    groupId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/groups/{group-id}/role-mappings/realm/composite', {
        realm,
        'group-id': groupId,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/organizations/{org-id}/groups/{group-id}/role-mappings: Get role mappings */
  getAdminRealmsRealmOrganizationsOrgIdGroupsGroupIdRoleMappings(
    realm: number | string,
    orgId: number | string,
    groupId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/organizations/{org-id}/groups/{group-id}/role-mappings', {
        realm,
        'org-id': orgId,
        'group-id': groupId,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/organizations/{org-id}/groups/{group-id}/role-mappings/realm: Get realm-level role mappings */
  getAdminRealmsRealmOrganizationsOrgIdGroupsGroupIdRoleMappingsRealm(
    realm: number | string,
    orgId: number | string,
    groupId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route(
        'admin/realms/{realm}/organizations/{org-id}/groups/{group-id}/role-mappings/realm',
        { realm, 'org-id': orgId, 'group-id': groupId },
      ),
      options,
    );
  }

  /** POST /admin/realms/{realm}/organizations/{org-id}/groups/{group-id}/role-mappings/realm: Add realm-level role mappings to the user */
  postAdminRealmsRealmOrganizationsOrgIdGroupsGroupIdRoleMappingsRealm(
    realm: number | string,
    orgId: number | string,
    groupId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route(
        'admin/realms/{realm}/organizations/{org-id}/groups/{group-id}/role-mappings/realm',
        { realm, 'org-id': orgId, 'group-id': groupId },
      ),
      options,
    );
  }

  /** DELETE /admin/realms/{realm}/organizations/{org-id}/groups/{group-id}/role-mappings/realm: Delete realm-level role mappings */
  deleteAdminRealmsRealmOrganizationsOrgIdGroupsGroupIdRoleMappingsRealm(
    realm: number | string,
    orgId: number | string,
    groupId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(
      this.route(
        'admin/realms/{realm}/organizations/{org-id}/groups/{group-id}/role-mappings/realm',
        { realm, 'org-id': orgId, 'group-id': groupId },
      ),
      options,
    );
  }

  /** GET /admin/realms/{realm}/organizations/{org-id}/groups/{group-id}/role-mappings/realm/available: Get realm-level roles that can be mapped */
  getAdminRealmsRealmOrganizationsOrgIdGroupsGroupIdRoleMappingsRealmAvailable(
    realm: number | string,
    orgId: number | string,
    groupId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route(
        'admin/realms/{realm}/organizations/{org-id}/groups/{group-id}/role-mappings/realm/available',
        { realm, 'org-id': orgId, 'group-id': groupId },
      ),
      options,
    );
  }

  /** GET /admin/realms/{realm}/organizations/{org-id}/groups/{group-id}/role-mappings/realm/composite: Get effective realm-level role mappings This will recurse all composite roles to get the result. */
  getAdminRealmsRealmOrganizationsOrgIdGroupsGroupIdRoleMappingsRealmComposite(
    realm: number | string,
    orgId: number | string,
    groupId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route(
        'admin/realms/{realm}/organizations/{org-id}/groups/{group-id}/role-mappings/realm/composite',
        { realm, 'org-id': orgId, 'group-id': groupId },
      ),
      options,
    );
  }

  /** GET /admin/realms/{realm}/users/{user-id}/role-mappings: Get role mappings */
  getAdminRealmsRealmUsersUserIdRoleMappings(
    realm: number | string,
    userId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/users/{user-id}/role-mappings', {
        realm,
        'user-id': userId,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/users/{user-id}/role-mappings/realm: Get realm-level role mappings */
  getAdminRealmsRealmUsersUserIdRoleMappingsRealm(
    realm: number | string,
    userId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/users/{user-id}/role-mappings/realm', {
        realm,
        'user-id': userId,
      }),
      options,
    );
  }

  /** POST /admin/realms/{realm}/users/{user-id}/role-mappings/realm: Add realm-level role mappings to the user */
  postAdminRealmsRealmUsersUserIdRoleMappingsRealm(
    realm: number | string,
    userId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route('admin/realms/{realm}/users/{user-id}/role-mappings/realm', {
        realm,
        'user-id': userId,
      }),
      options,
    );
  }

  /** DELETE /admin/realms/{realm}/users/{user-id}/role-mappings/realm: Delete realm-level role mappings */
  deleteAdminRealmsRealmUsersUserIdRoleMappingsRealm(
    realm: number | string,
    userId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(
      this.route('admin/realms/{realm}/users/{user-id}/role-mappings/realm', {
        realm,
        'user-id': userId,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/users/{user-id}/role-mappings/realm/available: Get realm-level roles that can be mapped */
  getAdminRealmsRealmUsersUserIdRoleMappingsRealmAvailable(
    realm: number | string,
    userId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/users/{user-id}/role-mappings/realm/available', {
        realm,
        'user-id': userId,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/users/{user-id}/role-mappings/realm/composite: Get effective realm-level role mappings This will recurse all composite roles to get the result. */
  getAdminRealmsRealmUsersUserIdRoleMappingsRealmComposite(
    realm: number | string,
    userId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/users/{user-id}/role-mappings/realm/composite', {
        realm,
        'user-id': userId,
      }),
      options,
    );
  }
}
