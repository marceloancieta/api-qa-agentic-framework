import type { APIResponse } from '@playwright/test';
import { BaseClient, type RequestOptions } from '../../../helpers/base-client';

/** `Realms Admin` operations. Methods return the raw response; the spec asserts. */
export class RealmsAdminClient extends BaseClient {
  /** GET /admin/realms: Get accessible realms Returns a list of accessible realms. The list is filtered based on what realms the caller is allowed to view. */
  getAdminRealms(options: RequestOptions = {}): Promise<APIResponse> {
    return this.get('admin/realms', options);
  }

  /** POST /admin/realms: Import a realm. Imports a realm from a full representation of that realm. */
  postAdminRealms(options: RequestOptions = {}): Promise<APIResponse> {
    return this.post('admin/realms', options);
  }

  /** GET /admin/realms/{realm}: Get the top-level representation of the realm It will not include nested information like User and Client representations. */
  getAdminRealmsRealm(realm: number | string, options: RequestOptions = {}): Promise<APIResponse> {
    return this.get(this.route('admin/realms/{realm}', { realm }), options);
  }

  /** PUT /admin/realms/{realm}: Update the top-level information of the realm Any user, roles or client information in the representation will be ignored. */
  putAdminRealmsRealm(realm: number | string, options: RequestOptions = {}): Promise<APIResponse> {
    return this.put(this.route('admin/realms/{realm}', { realm }), options);
  }

  /** DELETE /admin/realms/{realm}: Delete the realm */
  deleteAdminRealmsRealm(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(this.route('admin/realms/{realm}', { realm }), options);
  }

  /** GET /admin/realms/{realm}/admin-events: Get admin events Returns all admin events, or filters events based on URL query parameters listed here */
  getAdminRealmsRealmAdminEvents(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(this.route('admin/realms/{realm}/admin-events', { realm }), options);
  }

  /** DELETE /admin/realms/{realm}/admin-events: Delete all admin events */
  deleteAdminRealmsRealmAdminEvents(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(this.route('admin/realms/{realm}/admin-events', { realm }), options);
  }

  /** POST /admin/realms/{realm}/client-description-converter: Base path for importing clients under this realm. */
  postAdminRealmsRealmClientDescriptionConverter(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route('admin/realms/{realm}/client-description-converter', { realm }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/client-policies/policies */
  getAdminRealmsRealmClientPoliciesPolicies(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/client-policies/policies', { realm }),
      options,
    );
  }

  /** PUT /admin/realms/{realm}/client-policies/policies */
  putAdminRealmsRealmClientPoliciesPolicies(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.put(
      this.route('admin/realms/{realm}/client-policies/policies', { realm }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/client-policies/profiles */
  getAdminRealmsRealmClientPoliciesProfiles(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/client-policies/profiles', { realm }),
      options,
    );
  }

  /** PUT /admin/realms/{realm}/client-policies/profiles */
  putAdminRealmsRealmClientPoliciesProfiles(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.put(
      this.route('admin/realms/{realm}/client-policies/profiles', { realm }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/client-session-stats: Get client session stats Returns a JSON map. */
  getAdminRealmsRealmClientSessionStats(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(this.route('admin/realms/{realm}/client-session-stats', { realm }), options);
  }

  /** GET /admin/realms/{realm}/client-types: List all client types available in the current realm */
  getAdminRealmsRealmClientTypes(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(this.route('admin/realms/{realm}/client-types', { realm }), options);
  }

  /** PUT /admin/realms/{realm}/client-types: Update a client type */
  putAdminRealmsRealmClientTypes(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.put(this.route('admin/realms/{realm}/client-types', { realm }), options);
  }

  /** GET /admin/realms/{realm}/credential-registrators */
  getAdminRealmsRealmCredentialRegistrators(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(this.route('admin/realms/{realm}/credential-registrators', { realm }), options);
  }

  /** GET /admin/realms/{realm}/default-default-client-scopes: Get realm default client scopes. Only name and ids are returned. */
  getAdminRealmsRealmDefaultDefaultClientScopes(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/default-default-client-scopes', { realm }),
      options,
    );
  }

  /** PUT /admin/realms/{realm}/default-default-client-scopes/{clientScopeId} */
  putAdminRealmsRealmDefaultDefaultClientScopesClientScopeId(
    realm: number | string,
    clientScopeId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.put(
      this.route('admin/realms/{realm}/default-default-client-scopes/{clientScopeId}', {
        realm,
        clientScopeId,
      }),
      options,
    );
  }

  /** DELETE /admin/realms/{realm}/default-default-client-scopes/{clientScopeId} */
  deleteAdminRealmsRealmDefaultDefaultClientScopesClientScopeId(
    realm: number | string,
    clientScopeId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(
      this.route('admin/realms/{realm}/default-default-client-scopes/{clientScopeId}', {
        realm,
        clientScopeId,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/default-groups: Get group hierarchy. Only name and ids are returned. */
  getAdminRealmsRealmDefaultGroups(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(this.route('admin/realms/{realm}/default-groups', { realm }), options);
  }

  /** PUT /admin/realms/{realm}/default-groups/{groupId} */
  putAdminRealmsRealmDefaultGroupsGroupId(
    realm: number | string,
    groupId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.put(
      this.route('admin/realms/{realm}/default-groups/{groupId}', { realm, groupId }),
      options,
    );
  }

  /** DELETE /admin/realms/{realm}/default-groups/{groupId} */
  deleteAdminRealmsRealmDefaultGroupsGroupId(
    realm: number | string,
    groupId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(
      this.route('admin/realms/{realm}/default-groups/{groupId}', { realm, groupId }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/default-optional-client-scopes: Get realm optional client scopes. Only name and ids are returned. */
  getAdminRealmsRealmDefaultOptionalClientScopes(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/default-optional-client-scopes', { realm }),
      options,
    );
  }

  /** PUT /admin/realms/{realm}/default-optional-client-scopes/{clientScopeId} */
  putAdminRealmsRealmDefaultOptionalClientScopesClientScopeId(
    realm: number | string,
    clientScopeId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.put(
      this.route('admin/realms/{realm}/default-optional-client-scopes/{clientScopeId}', {
        realm,
        clientScopeId,
      }),
      options,
    );
  }

  /** DELETE /admin/realms/{realm}/default-optional-client-scopes/{clientScopeId} */
  deleteAdminRealmsRealmDefaultOptionalClientScopesClientScopeId(
    realm: number | string,
    clientScopeId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(
      this.route('admin/realms/{realm}/default-optional-client-scopes/{clientScopeId}', {
        realm,
        clientScopeId,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/events: Get events Returns all events, or filters them based on URL query parameters listed here */
  getAdminRealmsRealmEvents(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(this.route('admin/realms/{realm}/events', { realm }), options);
  }

  /** DELETE /admin/realms/{realm}/events: Delete all events */
  deleteAdminRealmsRealmEvents(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(this.route('admin/realms/{realm}/events', { realm }), options);
  }

  /** GET /admin/realms/{realm}/events/config: Get the events provider configuration Returns JSON object with events provider configuration */
  getAdminRealmsRealmEventsConfig(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(this.route('admin/realms/{realm}/events/config', { realm }), options);
  }

  /** PUT /admin/realms/{realm}/events/config */
  putAdminRealmsRealmEventsConfig(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.put(this.route('admin/realms/{realm}/events/config', { realm }), options);
  }

  /** GET /admin/realms/{realm}/group-by-path/{path} */
  getAdminRealmsRealmGroupByPathPath(
    realm: number | string,
    path: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/group-by-path/{path}', { realm, path }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/localization */
  getAdminRealmsRealmLocalization(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(this.route('admin/realms/{realm}/localization', { realm }), options);
  }

  /** GET /admin/realms/{realm}/localization/{locale} */
  getAdminRealmsRealmLocalizationLocale(
    realm: number | string,
    locale: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/localization/{locale}', { realm, locale }),
      options,
    );
  }

  /** POST /admin/realms/{realm}/localization/{locale}: Import localization from uploaded JSON file */
  postAdminRealmsRealmLocalizationLocale(
    realm: number | string,
    locale: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route('admin/realms/{realm}/localization/{locale}', { realm, locale }),
      options,
    );
  }

  /** DELETE /admin/realms/{realm}/localization/{locale} */
  deleteAdminRealmsRealmLocalizationLocale(
    realm: number | string,
    locale: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(
      this.route('admin/realms/{realm}/localization/{locale}', { realm, locale }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/localization/{locale}/{key} */
  getAdminRealmsRealmLocalizationLocaleKey(
    realm: number | string,
    locale: number | string,
    key: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/localization/{locale}/{key}', { realm, locale, key }),
      options,
    );
  }

  /** PUT /admin/realms/{realm}/localization/{locale}/{key} */
  putAdminRealmsRealmLocalizationLocaleKey(
    realm: number | string,
    locale: number | string,
    key: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.put(
      this.route('admin/realms/{realm}/localization/{locale}/{key}', { realm, locale, key }),
      options,
    );
  }

  /** DELETE /admin/realms/{realm}/localization/{locale}/{key} */
  deleteAdminRealmsRealmLocalizationLocaleKey(
    realm: number | string,
    locale: number | string,
    key: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(
      this.route('admin/realms/{realm}/localization/{locale}/{key}', { realm, locale, key }),
      options,
    );
  }

  /** POST /admin/realms/{realm}/logout-all: Removes all user sessions. */
  postAdminRealmsRealmLogoutAll(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(this.route('admin/realms/{realm}/logout-all', { realm }), options);
  }

  /** POST /admin/realms/{realm}/partial-export: Partial export of existing realm into a JSON file. */
  postAdminRealmsRealmPartialExport(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(this.route('admin/realms/{realm}/partial-export', { realm }), options);
  }

  /** POST /admin/realms/{realm}/partialImport: Partial import from a JSON file to an existing realm. */
  postAdminRealmsRealmPartialImport(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(this.route('admin/realms/{realm}/partialImport', { realm }), options);
  }

  /** POST /admin/realms/{realm}/push-revocation: Push the realm's revocation policy to any client that has an admin url associated with it. */
  postAdminRealmsRealmPushRevocation(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(this.route('admin/realms/{realm}/push-revocation', { realm }), options);
  }

  /** DELETE /admin/realms/{realm}/sessions/{session}: Remove a specific user session. */
  deleteAdminRealmsRealmSessionsSession(
    realm: number | string,
    session: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(
      this.route('admin/realms/{realm}/sessions/{session}', { realm, session }),
      options,
    );
  }

  /** POST /admin/realms/{realm}/testSMTPConnection: Test SMTP connection with current logged in user */
  postAdminRealmsRealmTestSmtpconnection(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(this.route('admin/realms/{realm}/testSMTPConnection', { realm }), options);
  }

  /** GET /admin/realms/{realm}/users-management-permissions */
  getAdminRealmsRealmUsersManagementPermissions(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/users-management-permissions', { realm }),
      options,
    );
  }

  /** PUT /admin/realms/{realm}/users-management-permissions */
  putAdminRealmsRealmUsersManagementPermissions(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.put(
      this.route('admin/realms/{realm}/users-management-permissions', { realm }),
      options,
    );
  }
}
