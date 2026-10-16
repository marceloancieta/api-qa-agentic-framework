import type { APIResponse } from '@playwright/test';
import { BaseClient, type RequestOptions } from '../../../helpers/base-client';

/** `Users` operations. Methods return the raw response; the spec asserts. */
export class UsersClient extends BaseClient {
  /** GET /admin/realms/{realm}/users: Get users Returns a stream of users, filtered according to query parameters. */
  getAdminRealmsRealmUsers(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(this.route('admin/realms/{realm}/users', { realm }), options);
  }

  /** POST /admin/realms/{realm}/users: Create a new user Username must be unique. */
  postAdminRealmsRealmUsers(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(this.route('admin/realms/{realm}/users', { realm }), options);
  }

  /** GET /admin/realms/{realm}/users/count: Returns the number of users that match the given criteria. */
  getAdminRealmsRealmUsersCount(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(this.route('admin/realms/{realm}/users/count', { realm }), options);
  }

  /** GET /admin/realms/{realm}/users/profile */
  getAdminRealmsRealmUsersProfile(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(this.route('admin/realms/{realm}/users/profile', { realm }), options);
  }

  /** PUT /admin/realms/{realm}/users/profile */
  putAdminRealmsRealmUsersProfile(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.put(this.route('admin/realms/{realm}/users/profile', { realm }), options);
  }

  /** GET /admin/realms/{realm}/users/profile/metadata */
  getAdminRealmsRealmUsersProfileMetadata(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(this.route('admin/realms/{realm}/users/profile/metadata', { realm }), options);
  }

  /** GET /admin/realms/{realm}/users/{user-id}: Get representation of the user */
  getAdminRealmsRealmUsersUserId(
    realm: number | string,
    userId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/users/{user-id}', { realm, 'user-id': userId }),
      options,
    );
  }

  /** PUT /admin/realms/{realm}/users/{user-id}: Update the user */
  putAdminRealmsRealmUsersUserId(
    realm: number | string,
    userId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.put(
      this.route('admin/realms/{realm}/users/{user-id}', { realm, 'user-id': userId }),
      options,
    );
  }

  /** DELETE /admin/realms/{realm}/users/{user-id}: Delete the user */
  deleteAdminRealmsRealmUsersUserId(
    realm: number | string,
    userId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(
      this.route('admin/realms/{realm}/users/{user-id}', { realm, 'user-id': userId }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/users/{user-id}/configured-user-storage-credential-types: Return credential types, which are provided by the user storage where user is stored. */
  getAdminRealmsRealmUsersUserIdConfiguredUserStorageCredentialTypes(
    realm: number | string,
    userId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/users/{user-id}/configured-user-storage-credential-types', {
        realm,
        'user-id': userId,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/users/{user-id}/consents: Get consents granted by the user */
  getAdminRealmsRealmUsersUserIdConsents(
    realm: number | string,
    userId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/users/{user-id}/consents', { realm, 'user-id': userId }),
      options,
    );
  }

  /** DELETE /admin/realms/{realm}/users/{user-id}/consents/{client}: Revoke consent and offline tokens for particular client from user */
  deleteAdminRealmsRealmUsersUserIdConsentsClient(
    realm: number | string,
    userId: number | string,
    client: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(
      this.route('admin/realms/{realm}/users/{user-id}/consents/{client}', {
        realm,
        'user-id': userId,
        client,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/users/{user-id}/credentials */
  getAdminRealmsRealmUsersUserIdCredentials(
    realm: number | string,
    userId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/users/{user-id}/credentials', { realm, 'user-id': userId }),
      options,
    );
  }

  /** DELETE /admin/realms/{realm}/users/{user-id}/credentials/{credentialId}: Remove a credential for a user */
  deleteAdminRealmsRealmUsersUserIdCredentialsCredentialId(
    realm: number | string,
    userId: number | string,
    credentialId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(
      this.route('admin/realms/{realm}/users/{user-id}/credentials/{credentialId}', {
        realm,
        'user-id': userId,
        credentialId,
      }),
      options,
    );
  }

  /** POST /admin/realms/{realm}/users/{user-id}/credentials/{credentialId}/moveAfter/{newPreviousCredentialId}: Move a credential to a position behind another credential */
  postAdminRealmsRealmUsersUserIdCredentialsCredentialIdMoveAfterNewPreviousCredentialId(
    realm: number | string,
    userId: number | string,
    credentialId: number | string,
    newPreviousCredentialId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route(
        'admin/realms/{realm}/users/{user-id}/credentials/{credentialId}/moveAfter/{newPreviousCredentialId}',
        { realm, 'user-id': userId, credentialId, newPreviousCredentialId },
      ),
      options,
    );
  }

  /** POST /admin/realms/{realm}/users/{user-id}/credentials/{credentialId}/moveToFirst: Move a credential to a first position in the credentials list of the user */
  postAdminRealmsRealmUsersUserIdCredentialsCredentialIdMoveToFirst(
    realm: number | string,
    userId: number | string,
    credentialId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route('admin/realms/{realm}/users/{user-id}/credentials/{credentialId}/moveToFirst', {
        realm,
        'user-id': userId,
        credentialId,
      }),
      options,
    );
  }

  /** PUT /admin/realms/{realm}/users/{user-id}/credentials/{credentialId}/userLabel: Update a credential label for a user */
  putAdminRealmsRealmUsersUserIdCredentialsCredentialIdUserLabel(
    realm: number | string,
    userId: number | string,
    credentialId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.put(
      this.route('admin/realms/{realm}/users/{user-id}/credentials/{credentialId}/userLabel', {
        realm,
        'user-id': userId,
        credentialId,
      }),
      options,
    );
  }

  /** PUT /admin/realms/{realm}/users/{user-id}/disable-credential-types: Disable all credentials for a user of a specific type */
  putAdminRealmsRealmUsersUserIdDisableCredentialTypes(
    realm: number | string,
    userId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.put(
      this.route('admin/realms/{realm}/users/{user-id}/disable-credential-types', {
        realm,
        'user-id': userId,
      }),
      options,
    );
  }

  /** PUT /admin/realms/{realm}/users/{user-id}/execute-actions-email: Send an email to the user with a link they can click to execute particular actions. */
  putAdminRealmsRealmUsersUserIdExecuteActionsEmail(
    realm: number | string,
    userId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.put(
      this.route('admin/realms/{realm}/users/{user-id}/execute-actions-email', {
        realm,
        'user-id': userId,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/users/{user-id}/federated-identity: Get social logins associated with the user */
  getAdminRealmsRealmUsersUserIdFederatedIdentity(
    realm: number | string,
    userId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/users/{user-id}/federated-identity', {
        realm,
        'user-id': userId,
      }),
      options,
    );
  }

  /** POST /admin/realms/{realm}/users/{user-id}/federated-identity/{provider}: Add a social login provider to the user */
  postAdminRealmsRealmUsersUserIdFederatedIdentityProvider(
    realm: number | string,
    userId: number | string,
    provider: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route('admin/realms/{realm}/users/{user-id}/federated-identity/{provider}', {
        realm,
        'user-id': userId,
        provider,
      }),
      options,
    );
  }

  /** DELETE /admin/realms/{realm}/users/{user-id}/federated-identity/{provider}: Remove a social login provider from user */
  deleteAdminRealmsRealmUsersUserIdFederatedIdentityProvider(
    realm: number | string,
    userId: number | string,
    provider: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(
      this.route('admin/realms/{realm}/users/{user-id}/federated-identity/{provider}', {
        realm,
        'user-id': userId,
        provider,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/users/{user-id}/groups */
  getAdminRealmsRealmUsersUserIdGroups(
    realm: number | string,
    userId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/users/{user-id}/groups', { realm, 'user-id': userId }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/users/{user-id}/groups/count */
  getAdminRealmsRealmUsersUserIdGroupsCount(
    realm: number | string,
    userId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/users/{user-id}/groups/count', { realm, 'user-id': userId }),
      options,
    );
  }

  /** PUT /admin/realms/{realm}/users/{user-id}/groups/{groupId} */
  putAdminRealmsRealmUsersUserIdGroupsGroupId(
    realm: number | string,
    userId: number | string,
    groupId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.put(
      this.route('admin/realms/{realm}/users/{user-id}/groups/{groupId}', {
        realm,
        'user-id': userId,
        groupId,
      }),
      options,
    );
  }

  /** DELETE /admin/realms/{realm}/users/{user-id}/groups/{groupId} */
  deleteAdminRealmsRealmUsersUserIdGroupsGroupId(
    realm: number | string,
    userId: number | string,
    groupId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(
      this.route('admin/realms/{realm}/users/{user-id}/groups/{groupId}', {
        realm,
        'user-id': userId,
        groupId,
      }),
      options,
    );
  }

  /** POST /admin/realms/{realm}/users/{user-id}/impersonation: Impersonate the user */
  postAdminRealmsRealmUsersUserIdImpersonation(
    realm: number | string,
    userId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route('admin/realms/{realm}/users/{user-id}/impersonation', {
        realm,
        'user-id': userId,
      }),
      options,
    );
  }

  /** POST /admin/realms/{realm}/users/{user-id}/logout: Remove all user sessions associated with the user Also send notification to all clients that have an admin URL to invalidate the sessions for the particular user. */
  postAdminRealmsRealmUsersUserIdLogout(
    realm: number | string,
    userId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route('admin/realms/{realm}/users/{user-id}/logout', { realm, 'user-id': userId }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/users/{user-id}/offline-sessions/{clientUuid}: Get offline sessions associated with the user and client */
  getAdminRealmsRealmUsersUserIdOfflineSessionsClientUuid(
    realm: number | string,
    userId: number | string,
    clientUuid: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/users/{user-id}/offline-sessions/{clientUuid}', {
        realm,
        'user-id': userId,
        clientUuid,
      }),
      options,
    );
  }

  /** PUT /admin/realms/{realm}/users/{user-id}/reset-password: Set up a new password for the user. */
  putAdminRealmsRealmUsersUserIdResetPassword(
    realm: number | string,
    userId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.put(
      this.route('admin/realms/{realm}/users/{user-id}/reset-password', {
        realm,
        'user-id': userId,
      }),
      options,
    );
  }

  /** PUT /admin/realms/{realm}/users/{user-id}/reset-password-email: Send an email to the user with a link they can click to reset their password. */
  putAdminRealmsRealmUsersUserIdResetPasswordEmail(
    realm: number | string,
    userId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.put(
      this.route('admin/realms/{realm}/users/{user-id}/reset-password-email', {
        realm,
        'user-id': userId,
      }),
      options,
    );
  }

  /** PUT /admin/realms/{realm}/users/{user-id}/send-verify-email: Send an email-verification email to the user An email contains a link the user can click to verify their email address. */
  putAdminRealmsRealmUsersUserIdSendVerifyEmail(
    realm: number | string,
    userId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.put(
      this.route('admin/realms/{realm}/users/{user-id}/send-verify-email', {
        realm,
        'user-id': userId,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/users/{user-id}/sessions: Get sessions associated with the user */
  getAdminRealmsRealmUsersUserIdSessions(
    realm: number | string,
    userId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/users/{user-id}/sessions', { realm, 'user-id': userId }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/users/{user-id}/unmanagedAttributes */
  getAdminRealmsRealmUsersUserIdUnmanagedAttributes(
    realm: number | string,
    userId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/users/{user-id}/unmanagedAttributes', {
        realm,
        'user-id': userId,
      }),
      options,
    );
  }
}
