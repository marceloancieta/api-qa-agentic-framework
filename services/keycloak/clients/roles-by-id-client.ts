import type { APIResponse } from '@playwright/test';
import { BaseClient, type RequestOptions } from '../../../helpers/base-client';

/** `Roles (by ID)` operations. Methods return the raw response; the spec asserts. */
export class RolesByIdClient extends BaseClient {
  /** GET /admin/realms/{realm}/roles-by-id/{role-id}: Get a specific role's representation */
  getAdminRealmsRealmRolesByIdRoleId(
    realm: number | string,
    roleId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/roles-by-id/{role-id}', { realm, 'role-id': roleId }),
      options,
    );
  }

  /** PUT /admin/realms/{realm}/roles-by-id/{role-id}: Update the role */
  putAdminRealmsRealmRolesByIdRoleId(
    realm: number | string,
    roleId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.put(
      this.route('admin/realms/{realm}/roles-by-id/{role-id}', { realm, 'role-id': roleId }),
      options,
    );
  }

  /** DELETE /admin/realms/{realm}/roles-by-id/{role-id}: Delete the role */
  deleteAdminRealmsRealmRolesByIdRoleId(
    realm: number | string,
    roleId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(
      this.route('admin/realms/{realm}/roles-by-id/{role-id}', { realm, 'role-id': roleId }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/roles-by-id/{role-id}/composites: Get role's children Returns a set of role's children provided the role is a composite. */
  getAdminRealmsRealmRolesByIdRoleIdComposites(
    realm: number | string,
    roleId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/roles-by-id/{role-id}/composites', {
        realm,
        'role-id': roleId,
      }),
      options,
    );
  }

  /** POST /admin/realms/{realm}/roles-by-id/{role-id}/composites: Make the role a composite role by associating some child roles */
  postAdminRealmsRealmRolesByIdRoleIdComposites(
    realm: number | string,
    roleId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route('admin/realms/{realm}/roles-by-id/{role-id}/composites', {
        realm,
        'role-id': roleId,
      }),
      options,
    );
  }

  /** DELETE /admin/realms/{realm}/roles-by-id/{role-id}/composites: Remove a set of roles from the role's composite */
  deleteAdminRealmsRealmRolesByIdRoleIdComposites(
    realm: number | string,
    roleId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(
      this.route('admin/realms/{realm}/roles-by-id/{role-id}/composites', {
        realm,
        'role-id': roleId,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/roles-by-id/{role-id}/composites/clients/{clientUuid}: Get client-level roles for the client that are in the role's composite */
  getAdminRealmsRealmRolesByIdRoleIdCompositesClientsClientUuid(
    realm: number | string,
    roleId: number | string,
    clientUuid: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/roles-by-id/{role-id}/composites/clients/{clientUuid}', {
        realm,
        'role-id': roleId,
        clientUuid,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/roles-by-id/{role-id}/composites/realm: Get realm-level roles that are in the role's composite */
  getAdminRealmsRealmRolesByIdRoleIdCompositesRealm(
    realm: number | string,
    roleId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/roles-by-id/{role-id}/composites/realm', {
        realm,
        'role-id': roleId,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/roles-by-id/{role-id}/management/permissions: Return object stating whether role Authorization permissions have been initialized or not and a reference */
  getAdminRealmsRealmRolesByIdRoleIdManagementPermissions(
    realm: number | string,
    roleId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/roles-by-id/{role-id}/management/permissions', {
        realm,
        'role-id': roleId,
      }),
      options,
    );
  }

  /** PUT /admin/realms/{realm}/roles-by-id/{role-id}/management/permissions: Return object stating whether role Authorization permissions have been initialized or not and a reference */
  putAdminRealmsRealmRolesByIdRoleIdManagementPermissions(
    realm: number | string,
    roleId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.put(
      this.route('admin/realms/{realm}/roles-by-id/{role-id}/management/permissions', {
        realm,
        'role-id': roleId,
      }),
      options,
    );
  }
}
