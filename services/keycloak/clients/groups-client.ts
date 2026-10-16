import type { APIResponse } from '@playwright/test';
import { BaseClient, type RequestOptions } from '../../../helpers/base-client';

/** `Groups` operations. Methods return the raw response; the spec asserts. */
export class GroupsClient extends BaseClient {
  /** GET /admin/realms/{realm}/groups: Get group hierarchy. Only `name` and `id` are returned. `subGroups` are only returned when using the `search` or `q` parameter. If none of these parameters is provided, the top-level groups are returned without `subGroups` being filled. */
  getAdminRealmsRealmGroups(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(this.route('admin/realms/{realm}/groups', { realm }), options);
  }

  /** POST /admin/realms/{realm}/groups: create or add a top level realm groupSet or create child. */
  postAdminRealmsRealmGroups(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(this.route('admin/realms/{realm}/groups', { realm }), options);
  }

  /** GET /admin/realms/{realm}/groups/count: Returns the groups counts. */
  getAdminRealmsRealmGroupsCount(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(this.route('admin/realms/{realm}/groups/count', { realm }), options);
  }

  /** GET /admin/realms/{realm}/groups/{group-id} */
  getAdminRealmsRealmGroupsGroupId(
    realm: number | string,
    groupId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/groups/{group-id}', { realm, 'group-id': groupId }),
      options,
    );
  }

  /** PUT /admin/realms/{realm}/groups/{group-id}: Update group, ignores subgroups. */
  putAdminRealmsRealmGroupsGroupId(
    realm: number | string,
    groupId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.put(
      this.route('admin/realms/{realm}/groups/{group-id}', { realm, 'group-id': groupId }),
      options,
    );
  }

  /** DELETE /admin/realms/{realm}/groups/{group-id} */
  deleteAdminRealmsRealmGroupsGroupId(
    realm: number | string,
    groupId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(
      this.route('admin/realms/{realm}/groups/{group-id}', { realm, 'group-id': groupId }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/groups/{group-id}/children: Return a paginated list of subgroups that have a parent group corresponding to the group on the URL */
  getAdminRealmsRealmGroupsGroupIdChildren(
    realm: number | string,
    groupId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/groups/{group-id}/children', { realm, 'group-id': groupId }),
      options,
    );
  }

  /** POST /admin/realms/{realm}/groups/{group-id}/children: Set or create child. */
  postAdminRealmsRealmGroupsGroupIdChildren(
    realm: number | string,
    groupId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route('admin/realms/{realm}/groups/{group-id}/children', { realm, 'group-id': groupId }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/groups/{group-id}/management/permissions: Return object stating whether client Authorization permissions have been initialized or not and a reference */
  getAdminRealmsRealmGroupsGroupIdManagementPermissions(
    realm: number | string,
    groupId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/groups/{group-id}/management/permissions', {
        realm,
        'group-id': groupId,
      }),
      options,
    );
  }

  /** PUT /admin/realms/{realm}/groups/{group-id}/management/permissions: Return object stating whether client Authorization permissions have been initialized or not and a reference */
  putAdminRealmsRealmGroupsGroupIdManagementPermissions(
    realm: number | string,
    groupId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.put(
      this.route('admin/realms/{realm}/groups/{group-id}/management/permissions', {
        realm,
        'group-id': groupId,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/groups/{group-id}/members: Get users Returns a stream of users, filtered according to query parameters */
  getAdminRealmsRealmGroupsGroupIdMembers(
    realm: number | string,
    groupId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/groups/{group-id}/members', { realm, 'group-id': groupId }),
      options,
    );
  }
}
