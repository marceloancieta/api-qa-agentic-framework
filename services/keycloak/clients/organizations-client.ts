import type { APIResponse } from '@playwright/test';
import { BaseClient, type RequestOptions } from '../../../helpers/base-client';

/** `Organizations` operations. Methods return the raw response; the spec asserts. */
export class OrganizationsClient extends BaseClient {
  /** GET /admin/realms/{realm}/organizations: Returns a paginated list of organizations filtered according to the specified parameters */
  getAdminRealmsRealmOrganizations(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(this.route('admin/realms/{realm}/organizations', { realm }), options);
  }

  /** POST /admin/realms/{realm}/organizations: Creates a new organization */
  postAdminRealmsRealmOrganizations(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(this.route('admin/realms/{realm}/organizations', { realm }), options);
  }

  /** GET /admin/realms/{realm}/organizations/count: Returns the organizations counts. */
  getAdminRealmsRealmOrganizationsCount(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(this.route('admin/realms/{realm}/organizations/count', { realm }), options);
  }

  /** GET /admin/realms/{realm}/organizations/members/{member-id}/organizations: Returns the organizations associated with the user that has the specified id */
  getAdminRealmsRealmOrganizationsMembersMemberIdOrganizations(
    realm: number | string,
    memberId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/organizations/members/{member-id}/organizations', {
        realm,
        'member-id': memberId,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/organizations/{org-id}: Returns the organization representation */
  getAdminRealmsRealmOrganizationsOrgId(
    realm: number | string,
    orgId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/organizations/{org-id}', { realm, 'org-id': orgId }),
      options,
    );
  }

  /** PUT /admin/realms/{realm}/organizations/{org-id}: Updates the organization */
  putAdminRealmsRealmOrganizationsOrgId(
    realm: number | string,
    orgId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.put(
      this.route('admin/realms/{realm}/organizations/{org-id}', { realm, 'org-id': orgId }),
      options,
    );
  }

  /** DELETE /admin/realms/{realm}/organizations/{org-id}: Deletes the organization */
  deleteAdminRealmsRealmOrganizationsOrgId(
    realm: number | string,
    orgId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(
      this.route('admin/realms/{realm}/organizations/{org-id}', { realm, 'org-id': orgId }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/organizations/{org-id}/groups: Get organization groups */
  getAdminRealmsRealmOrganizationsOrgIdGroups(
    realm: number | string,
    orgId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/organizations/{org-id}/groups', { realm, 'org-id': orgId }),
      options,
    );
  }

  /** POST /admin/realms/{realm}/organizations/{org-id}/groups: Creates a new top-level group or moves an existing group to top-level */
  postAdminRealmsRealmOrganizationsOrgIdGroups(
    realm: number | string,
    orgId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route('admin/realms/{realm}/organizations/{org-id}/groups', { realm, 'org-id': orgId }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/organizations/{org-id}/groups/group-by-path/{path}: Get organization group by path */
  getAdminRealmsRealmOrganizationsOrgIdGroupsGroupByPathPath(
    realm: number | string,
    orgId: number | string,
    path: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/organizations/{org-id}/groups/group-by-path/{path}', {
        realm,
        'org-id': orgId,
        path,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/organizations/{org-id}/groups/{group-id}: Get organization group representation */
  getAdminRealmsRealmOrganizationsOrgIdGroupsGroupId(
    realm: number | string,
    orgId: number | string,
    groupId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/organizations/{org-id}/groups/{group-id}', {
        realm,
        'org-id': orgId,
        'group-id': groupId,
      }),
      options,
    );
  }

  /** PUT /admin/realms/{realm}/organizations/{org-id}/groups/{group-id}: Update organization group */
  putAdminRealmsRealmOrganizationsOrgIdGroupsGroupId(
    realm: number | string,
    orgId: number | string,
    groupId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.put(
      this.route('admin/realms/{realm}/organizations/{org-id}/groups/{group-id}', {
        realm,
        'org-id': orgId,
        'group-id': groupId,
      }),
      options,
    );
  }

  /** DELETE /admin/realms/{realm}/organizations/{org-id}/groups/{group-id}: Delete the organization group */
  deleteAdminRealmsRealmOrganizationsOrgIdGroupsGroupId(
    realm: number | string,
    orgId: number | string,
    groupId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(
      this.route('admin/realms/{realm}/organizations/{org-id}/groups/{group-id}', {
        realm,
        'org-id': orgId,
        'group-id': groupId,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/organizations/{org-id}/groups/{group-id}/children: Get subgroups of this organization group */
  getAdminRealmsRealmOrganizationsOrgIdGroupsGroupIdChildren(
    realm: number | string,
    orgId: number | string,
    groupId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/organizations/{org-id}/groups/{group-id}/children', {
        realm,
        'org-id': orgId,
        'group-id': groupId,
      }),
      options,
    );
  }

  /** POST /admin/realms/{realm}/organizations/{org-id}/groups/{group-id}/children: Create or move a subgroup */
  postAdminRealmsRealmOrganizationsOrgIdGroupsGroupIdChildren(
    realm: number | string,
    orgId: number | string,
    groupId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route('admin/realms/{realm}/organizations/{org-id}/groups/{group-id}/children', {
        realm,
        'org-id': orgId,
        'group-id': groupId,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/organizations/{org-id}/groups/{group-id}/members: Get members of this organization group */
  getAdminRealmsRealmOrganizationsOrgIdGroupsGroupIdMembers(
    realm: number | string,
    orgId: number | string,
    groupId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/organizations/{org-id}/groups/{group-id}/members', {
        realm,
        'org-id': orgId,
        'group-id': groupId,
      }),
      options,
    );
  }

  /** PUT /admin/realms/{realm}/organizations/{org-id}/groups/{group-id}/members/{userId}: Add a user to this organization group */
  putAdminRealmsRealmOrganizationsOrgIdGroupsGroupIdMembersUserId(
    realm: number | string,
    orgId: number | string,
    groupId: number | string,
    userId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.put(
      this.route('admin/realms/{realm}/organizations/{org-id}/groups/{group-id}/members/{userId}', {
        realm,
        'org-id': orgId,
        'group-id': groupId,
        userId,
      }),
      options,
    );
  }

  /** DELETE /admin/realms/{realm}/organizations/{org-id}/groups/{group-id}/members/{userId}: Remove a user from this organization group */
  deleteAdminRealmsRealmOrganizationsOrgIdGroupsGroupIdMembersUserId(
    realm: number | string,
    orgId: number | string,
    groupId: number | string,
    userId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(
      this.route('admin/realms/{realm}/organizations/{org-id}/groups/{group-id}/members/{userId}', {
        realm,
        'org-id': orgId,
        'group-id': groupId,
        userId,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/organizations/{org-id}/identity-providers: Returns all identity providers associated with the organization */
  getAdminRealmsRealmOrganizationsOrgIdIdentityProviders(
    realm: number | string,
    orgId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/organizations/{org-id}/identity-providers', {
        realm,
        'org-id': orgId,
      }),
      options,
    );
  }

  /** POST /admin/realms/{realm}/organizations/{org-id}/identity-providers: Adds the identity provider with the specified id to the organization */
  postAdminRealmsRealmOrganizationsOrgIdIdentityProviders(
    realm: number | string,
    orgId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route('admin/realms/{realm}/organizations/{org-id}/identity-providers', {
        realm,
        'org-id': orgId,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/organizations/{org-id}/identity-providers/{alias}: Returns the identity provider associated with the organization that has the specified alias */
  getAdminRealmsRealmOrganizationsOrgIdIdentityProvidersAlias(
    realm: number | string,
    orgId: number | string,
    alias: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/organizations/{org-id}/identity-providers/{alias}', {
        realm,
        'org-id': orgId,
        alias,
      }),
      options,
    );
  }

  /** DELETE /admin/realms/{realm}/organizations/{org-id}/identity-providers/{alias}: Removes the identity provider with the specified alias from the organization */
  deleteAdminRealmsRealmOrganizationsOrgIdIdentityProvidersAlias(
    realm: number | string,
    orgId: number | string,
    alias: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(
      this.route('admin/realms/{realm}/organizations/{org-id}/identity-providers/{alias}', {
        realm,
        'org-id': orgId,
        alias,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/organizations/{org-id}/identity-providers/{alias}/groups: Returns organization groups for the identity provider */
  getAdminRealmsRealmOrganizationsOrgIdIdentityProvidersAliasGroups(
    realm: number | string,
    orgId: number | string,
    alias: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/organizations/{org-id}/identity-providers/{alias}/groups', {
        realm,
        'org-id': orgId,
        alias,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/organizations/{org-id}/invitations: Get invitations for the organization */
  getAdminRealmsRealmOrganizationsOrgIdInvitations(
    realm: number | string,
    orgId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/organizations/{org-id}/invitations', {
        realm,
        'org-id': orgId,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/organizations/{org-id}/invitations/{id}: Get invitation by ID */
  getAdminRealmsRealmOrganizationsOrgIdInvitationsId(
    realm: number | string,
    orgId: number | string,
    id: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/organizations/{org-id}/invitations/{id}', {
        realm,
        'org-id': orgId,
        id,
      }),
      options,
    );
  }

  /** DELETE /admin/realms/{realm}/organizations/{org-id}/invitations/{id}: Delete an invitation */
  deleteAdminRealmsRealmOrganizationsOrgIdInvitationsId(
    realm: number | string,
    orgId: number | string,
    id: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(
      this.route('admin/realms/{realm}/organizations/{org-id}/invitations/{id}', {
        realm,
        'org-id': orgId,
        id,
      }),
      options,
    );
  }

  /** POST /admin/realms/{realm}/organizations/{org-id}/invitations/{id}/resend: Resend an invitation */
  postAdminRealmsRealmOrganizationsOrgIdInvitationsIdResend(
    realm: number | string,
    orgId: number | string,
    id: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route('admin/realms/{realm}/organizations/{org-id}/invitations/{id}/resend', {
        realm,
        'org-id': orgId,
        id,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/organizations/{org-id}/members: Returns a paginated list of organization members filtered according to the specified parameters */
  getAdminRealmsRealmOrganizationsOrgIdMembers(
    realm: number | string,
    orgId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/organizations/{org-id}/members', { realm, 'org-id': orgId }),
      options,
    );
  }

  /** POST /admin/realms/{realm}/organizations/{org-id}/members: Adds the user with the specified id as a member of the organization */
  postAdminRealmsRealmOrganizationsOrgIdMembers(
    realm: number | string,
    orgId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route('admin/realms/{realm}/organizations/{org-id}/members', { realm, 'org-id': orgId }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/organizations/{org-id}/members/count: Returns number of members in the organization. */
  getAdminRealmsRealmOrganizationsOrgIdMembersCount(
    realm: number | string,
    orgId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/organizations/{org-id}/members/count', {
        realm,
        'org-id': orgId,
      }),
      options,
    );
  }

  /** POST /admin/realms/{realm}/organizations/{org-id}/members/invite-existing-user: Invites an existing user to the organization, using the specified user id */
  postAdminRealmsRealmOrganizationsOrgIdMembersInviteExistingUser(
    realm: number | string,
    orgId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route('admin/realms/{realm}/organizations/{org-id}/members/invite-existing-user', {
        realm,
        'org-id': orgId,
      }),
      options,
    );
  }

  /** POST /admin/realms/{realm}/organizations/{org-id}/members/invite-user: Invites an existing user or sends a registration link to a new user, based on the provided e-mail address. */
  postAdminRealmsRealmOrganizationsOrgIdMembersInviteUser(
    realm: number | string,
    orgId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route('admin/realms/{realm}/organizations/{org-id}/members/invite-user', {
        realm,
        'org-id': orgId,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/organizations/{org-id}/members/{member-id}: Returns the member of the organization with the specified id */
  getAdminRealmsRealmOrganizationsOrgIdMembersMemberId(
    realm: number | string,
    orgId: number | string,
    memberId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/organizations/{org-id}/members/{member-id}', {
        realm,
        'org-id': orgId,
        'member-id': memberId,
      }),
      options,
    );
  }

  /** DELETE /admin/realms/{realm}/organizations/{org-id}/members/{member-id}: Removes the user with the specified id from the organization */
  deleteAdminRealmsRealmOrganizationsOrgIdMembersMemberId(
    realm: number | string,
    orgId: number | string,
    memberId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(
      this.route('admin/realms/{realm}/organizations/{org-id}/members/{member-id}', {
        realm,
        'org-id': orgId,
        'member-id': memberId,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/organizations/{org-id}/members/{member-id}/groups: Returns the organization group memberships for a member with the specified id */
  getAdminRealmsRealmOrganizationsOrgIdMembersMemberIdGroups(
    realm: number | string,
    orgId: number | string,
    memberId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/organizations/{org-id}/members/{member-id}/groups', {
        realm,
        'org-id': orgId,
        'member-id': memberId,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/organizations/{org-id}/members/{member-id}/organizations: Returns the organizations associated with the user that has the specified id */
  getAdminRealmsRealmOrganizationsOrgIdMembersMemberIdOrganizations(
    realm: number | string,
    orgId: number | string,
    memberId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/organizations/{org-id}/members/{member-id}/organizations', {
        realm,
        'org-id': orgId,
        'member-id': memberId,
      }),
      options,
    );
  }
}
