import type { APIResponse } from '@playwright/test';
import { BaseClient, type RequestOptions } from '../../../helpers/base-client';

/** `Roles` operations. Methods return the raw response; the spec asserts. */
export class RolesClient extends BaseClient {
  /** GET /admin/realms/{realm}/clients/{client-uuid}/roles: Get all roles for the realm or client */
  getAdminRealmsRealmClientsClientUuidRoles(
    realm: number | string,
    clientUuid: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/clients/{client-uuid}/roles', {
        realm,
        'client-uuid': clientUuid,
      }),
      options,
    );
  }

  /** POST /admin/realms/{realm}/clients/{client-uuid}/roles: Create a new role for the realm or client */
  postAdminRealmsRealmClientsClientUuidRoles(
    realm: number | string,
    clientUuid: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route('admin/realms/{realm}/clients/{client-uuid}/roles', {
        realm,
        'client-uuid': clientUuid,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/clients/{client-uuid}/roles/{role-name}: Get a role by name */
  getAdminRealmsRealmClientsClientUuidRolesRoleName(
    realm: number | string,
    clientUuid: number | string,
    roleName: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/clients/{client-uuid}/roles/{role-name}', {
        realm,
        'client-uuid': clientUuid,
        'role-name': roleName,
      }),
      options,
    );
  }

  /** PUT /admin/realms/{realm}/clients/{client-uuid}/roles/{role-name}: Update a role by name */
  putAdminRealmsRealmClientsClientUuidRolesRoleName(
    realm: number | string,
    clientUuid: number | string,
    roleName: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.put(
      this.route('admin/realms/{realm}/clients/{client-uuid}/roles/{role-name}', {
        realm,
        'client-uuid': clientUuid,
        'role-name': roleName,
      }),
      options,
    );
  }

  /** DELETE /admin/realms/{realm}/clients/{client-uuid}/roles/{role-name}: Delete a role by name */
  deleteAdminRealmsRealmClientsClientUuidRolesRoleName(
    realm: number | string,
    clientUuid: number | string,
    roleName: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(
      this.route('admin/realms/{realm}/clients/{client-uuid}/roles/{role-name}', {
        realm,
        'client-uuid': clientUuid,
        'role-name': roleName,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/clients/{client-uuid}/roles/{role-name}/composites: Get composites of the role */
  getAdminRealmsRealmClientsClientUuidRolesRoleNameComposites(
    realm: number | string,
    clientUuid: number | string,
    roleName: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/clients/{client-uuid}/roles/{role-name}/composites', {
        realm,
        'client-uuid': clientUuid,
        'role-name': roleName,
      }),
      options,
    );
  }

  /** POST /admin/realms/{realm}/clients/{client-uuid}/roles/{role-name}/composites: Add a composite to the role */
  postAdminRealmsRealmClientsClientUuidRolesRoleNameComposites(
    realm: number | string,
    clientUuid: number | string,
    roleName: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route('admin/realms/{realm}/clients/{client-uuid}/roles/{role-name}/composites', {
        realm,
        'client-uuid': clientUuid,
        'role-name': roleName,
      }),
      options,
    );
  }

  /** DELETE /admin/realms/{realm}/clients/{client-uuid}/roles/{role-name}/composites: Remove roles from the role's composite */
  deleteAdminRealmsRealmClientsClientUuidRolesRoleNameComposites(
    realm: number | string,
    clientUuid: number | string,
    roleName: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(
      this.route('admin/realms/{realm}/clients/{client-uuid}/roles/{role-name}/composites', {
        realm,
        'client-uuid': clientUuid,
        'role-name': roleName,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/clients/{client-uuid}/roles/{role-name}/composites/clients/{targetClientUuid}: Get client-level roles for the client that are in the role's composite */
  getAdminRealmsRealmClientsClientUuidRolesRoleNameCompositesClientsTargetClientUuid(
    realm: number | string,
    clientUuid: number | string,
    roleName: number | string,
    targetClientUuid: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route(
        'admin/realms/{realm}/clients/{client-uuid}/roles/{role-name}/composites/clients/{targetClientUuid}',
        { realm, 'client-uuid': clientUuid, 'role-name': roleName, targetClientUuid },
      ),
      options,
    );
  }

  /** GET /admin/realms/{realm}/clients/{client-uuid}/roles/{role-name}/composites/realm: Get realm-level roles of the role's composite */
  getAdminRealmsRealmClientsClientUuidRolesRoleNameCompositesRealm(
    realm: number | string,
    clientUuid: number | string,
    roleName: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/clients/{client-uuid}/roles/{role-name}/composites/realm', {
        realm,
        'client-uuid': clientUuid,
        'role-name': roleName,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/clients/{client-uuid}/roles/{role-name}/groups: Returns a stream of groups that have the specified role name */
  getAdminRealmsRealmClientsClientUuidRolesRoleNameGroups(
    realm: number | string,
    clientUuid: number | string,
    roleName: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/clients/{client-uuid}/roles/{role-name}/groups', {
        realm,
        'client-uuid': clientUuid,
        'role-name': roleName,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/clients/{client-uuid}/roles/{role-name}/management/permissions: Return object stating whether role Authorization permissions have been initialized or not and a reference */
  getAdminRealmsRealmClientsClientUuidRolesRoleNameManagementPermissions(
    realm: number | string,
    clientUuid: number | string,
    roleName: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route(
        'admin/realms/{realm}/clients/{client-uuid}/roles/{role-name}/management/permissions',
        { realm, 'client-uuid': clientUuid, 'role-name': roleName },
      ),
      options,
    );
  }

  /** PUT /admin/realms/{realm}/clients/{client-uuid}/roles/{role-name}/management/permissions: Return object stating whether role Authorization permissions have been initialized or not and a reference */
  putAdminRealmsRealmClientsClientUuidRolesRoleNameManagementPermissions(
    realm: number | string,
    clientUuid: number | string,
    roleName: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.put(
      this.route(
        'admin/realms/{realm}/clients/{client-uuid}/roles/{role-name}/management/permissions',
        { realm, 'client-uuid': clientUuid, 'role-name': roleName },
      ),
      options,
    );
  }

  /** GET /admin/realms/{realm}/clients/{client-uuid}/roles/{role-name}/users: Returns a stream of users that have the specified role name. */
  getAdminRealmsRealmClientsClientUuidRolesRoleNameUsers(
    realm: number | string,
    clientUuid: number | string,
    roleName: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/clients/{client-uuid}/roles/{role-name}/users', {
        realm,
        'client-uuid': clientUuid,
        'role-name': roleName,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/roles: Get all roles for the realm or client */
  getAdminRealmsRealmRoles(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(this.route('admin/realms/{realm}/roles', { realm }), options);
  }

  /** POST /admin/realms/{realm}/roles: Create a new role for the realm or client */
  postAdminRealmsRealmRoles(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(this.route('admin/realms/{realm}/roles', { realm }), options);
  }

  /** GET /admin/realms/{realm}/roles/{role-name}: Get a role by name */
  getAdminRealmsRealmRolesRoleName(
    realm: number | string,
    roleName: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/roles/{role-name}', { realm, 'role-name': roleName }),
      options,
    );
  }

  /** PUT /admin/realms/{realm}/roles/{role-name}: Update a role by name */
  putAdminRealmsRealmRolesRoleName(
    realm: number | string,
    roleName: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.put(
      this.route('admin/realms/{realm}/roles/{role-name}', { realm, 'role-name': roleName }),
      options,
    );
  }

  /** DELETE /admin/realms/{realm}/roles/{role-name}: Delete a role by name */
  deleteAdminRealmsRealmRolesRoleName(
    realm: number | string,
    roleName: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(
      this.route('admin/realms/{realm}/roles/{role-name}', { realm, 'role-name': roleName }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/roles/{role-name}/composites: Get composites of the role */
  getAdminRealmsRealmRolesRoleNameComposites(
    realm: number | string,
    roleName: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/roles/{role-name}/composites', {
        realm,
        'role-name': roleName,
      }),
      options,
    );
  }

  /** POST /admin/realms/{realm}/roles/{role-name}/composites: Add a composite to the role */
  postAdminRealmsRealmRolesRoleNameComposites(
    realm: number | string,
    roleName: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route('admin/realms/{realm}/roles/{role-name}/composites', {
        realm,
        'role-name': roleName,
      }),
      options,
    );
  }

  /** DELETE /admin/realms/{realm}/roles/{role-name}/composites: Remove roles from the role's composite */
  deleteAdminRealmsRealmRolesRoleNameComposites(
    realm: number | string,
    roleName: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(
      this.route('admin/realms/{realm}/roles/{role-name}/composites', {
        realm,
        'role-name': roleName,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/roles/{role-name}/composites/clients/{targetClientUuid}: Get client-level roles for the client that are in the role's composite */
  getAdminRealmsRealmRolesRoleNameCompositesClientsTargetClientUuid(
    realm: number | string,
    roleName: number | string,
    targetClientUuid: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/roles/{role-name}/composites/clients/{targetClientUuid}', {
        realm,
        'role-name': roleName,
        targetClientUuid,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/roles/{role-name}/composites/realm: Get realm-level roles of the role's composite */
  getAdminRealmsRealmRolesRoleNameCompositesRealm(
    realm: number | string,
    roleName: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/roles/{role-name}/composites/realm', {
        realm,
        'role-name': roleName,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/roles/{role-name}/groups: Returns a stream of groups that have the specified role name */
  getAdminRealmsRealmRolesRoleNameGroups(
    realm: number | string,
    roleName: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/roles/{role-name}/groups', { realm, 'role-name': roleName }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/roles/{role-name}/management/permissions: Return object stating whether role Authorization permissions have been initialized or not and a reference */
  getAdminRealmsRealmRolesRoleNameManagementPermissions(
    realm: number | string,
    roleName: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/roles/{role-name}/management/permissions', {
        realm,
        'role-name': roleName,
      }),
      options,
    );
  }

  /** PUT /admin/realms/{realm}/roles/{role-name}/management/permissions: Return object stating whether role Authorization permissions have been initialized or not and a reference */
  putAdminRealmsRealmRolesRoleNameManagementPermissions(
    realm: number | string,
    roleName: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.put(
      this.route('admin/realms/{realm}/roles/{role-name}/management/permissions', {
        realm,
        'role-name': roleName,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/roles/{role-name}/users: Returns a stream of users that have the specified role name. */
  getAdminRealmsRealmRolesRoleNameUsers(
    realm: number | string,
    roleName: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/roles/{role-name}/users', { realm, 'role-name': roleName }),
      options,
    );
  }
}
