import type { APIResponse } from '@playwright/test';
import { BaseClient, type RequestOptions } from '../../../helpers/base-client';

/** `Authentication Management` operations. Methods return the raw response; the spec asserts. */
export class AuthenticationManagementClient extends BaseClient {
  /** GET /admin/realms/{realm}/authentication/authenticator-providers: Get authenticator providers Returns a stream of authenticator providers. */
  getAdminRealmsRealmAuthenticationAuthenticatorProviders(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/authentication/authenticator-providers', { realm }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/authentication/client-authenticator-providers: Get client authenticator providers Returns a stream of client authenticator providers. */
  getAdminRealmsRealmAuthenticationClientAuthenticatorProviders(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/authentication/client-authenticator-providers', { realm }),
      options,
    );
  }

  /** POST /admin/realms/{realm}/authentication/config: Create new authenticator configuration */
  postAdminRealmsRealmAuthenticationConfig(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(this.route('admin/realms/{realm}/authentication/config', { realm }), options);
  }

  /** GET /admin/realms/{realm}/authentication/config-description/{providerId}: Get authenticator provider's configuration description */
  getAdminRealmsRealmAuthenticationConfigDescriptionProviderId(
    realm: number | string,
    providerId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/authentication/config-description/{providerId}', {
        realm,
        providerId,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/authentication/config/{id}: Get authenticator configuration */
  getAdminRealmsRealmAuthenticationConfigId(
    realm: number | string,
    id: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/authentication/config/{id}', { realm, id }),
      options,
    );
  }

  /** PUT /admin/realms/{realm}/authentication/config/{id}: Update authenticator configuration */
  putAdminRealmsRealmAuthenticationConfigId(
    realm: number | string,
    id: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.put(
      this.route('admin/realms/{realm}/authentication/config/{id}', { realm, id }),
      options,
    );
  }

  /** DELETE /admin/realms/{realm}/authentication/config/{id}: Delete authenticator configuration */
  deleteAdminRealmsRealmAuthenticationConfigId(
    realm: number | string,
    id: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(
      this.route('admin/realms/{realm}/authentication/config/{id}', { realm, id }),
      options,
    );
  }

  /** POST /admin/realms/{realm}/authentication/executions: Add new authentication execution */
  postAdminRealmsRealmAuthenticationExecutions(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route('admin/realms/{realm}/authentication/executions', { realm }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/authentication/executions/{executionId}: Get Single Execution */
  getAdminRealmsRealmAuthenticationExecutionsExecutionId(
    realm: number | string,
    executionId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/authentication/executions/{executionId}', {
        realm,
        executionId,
      }),
      options,
    );
  }

  /** DELETE /admin/realms/{realm}/authentication/executions/{executionId}: Delete execution */
  deleteAdminRealmsRealmAuthenticationExecutionsExecutionId(
    realm: number | string,
    executionId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(
      this.route('admin/realms/{realm}/authentication/executions/{executionId}', {
        realm,
        executionId,
      }),
      options,
    );
  }

  /** POST /admin/realms/{realm}/authentication/executions/{executionId}/config: Update execution with new configuration */
  postAdminRealmsRealmAuthenticationExecutionsExecutionIdConfig(
    realm: number | string,
    executionId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route('admin/realms/{realm}/authentication/executions/{executionId}/config', {
        realm,
        executionId,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/authentication/executions/{executionId}/config/{id}: Get execution's configuration */
  getAdminRealmsRealmAuthenticationExecutionsExecutionIdConfigId(
    realm: number | string,
    executionId: number | string,
    id: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/authentication/executions/{executionId}/config/{id}', {
        realm,
        executionId,
        id,
      }),
      options,
    );
  }

  /** POST /admin/realms/{realm}/authentication/executions/{executionId}/lower-priority: Lower execution's priority */
  postAdminRealmsRealmAuthenticationExecutionsExecutionIdLowerPriority(
    realm: number | string,
    executionId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route('admin/realms/{realm}/authentication/executions/{executionId}/lower-priority', {
        realm,
        executionId,
      }),
      options,
    );
  }

  /** POST /admin/realms/{realm}/authentication/executions/{executionId}/raise-priority: Raise execution's priority */
  postAdminRealmsRealmAuthenticationExecutionsExecutionIdRaisePriority(
    realm: number | string,
    executionId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route('admin/realms/{realm}/authentication/executions/{executionId}/raise-priority', {
        realm,
        executionId,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/authentication/flows: Get authentication flows Returns a stream of authentication flows. */
  getAdminRealmsRealmAuthenticationFlows(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(this.route('admin/realms/{realm}/authentication/flows', { realm }), options);
  }

  /** POST /admin/realms/{realm}/authentication/flows: Create a new authentication flow */
  postAdminRealmsRealmAuthenticationFlows(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(this.route('admin/realms/{realm}/authentication/flows', { realm }), options);
  }

  /** POST /admin/realms/{realm}/authentication/flows/{flowAlias}/copy: Copy existing authentication flow under a new name The new name is given as 'newName' attribute of the passed JSON object */
  postAdminRealmsRealmAuthenticationFlowsFlowAliasCopy(
    realm: number | string,
    flowAlias: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route('admin/realms/{realm}/authentication/flows/{flowAlias}/copy', {
        realm,
        flowAlias,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/authentication/flows/{flowAlias}/executions: Get authentication executions for a flow */
  getAdminRealmsRealmAuthenticationFlowsFlowAliasExecutions(
    realm: number | string,
    flowAlias: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/authentication/flows/{flowAlias}/executions', {
        realm,
        flowAlias,
      }),
      options,
    );
  }

  /** PUT /admin/realms/{realm}/authentication/flows/{flowAlias}/executions: Update authentication executions of a Flow */
  putAdminRealmsRealmAuthenticationFlowsFlowAliasExecutions(
    realm: number | string,
    flowAlias: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.put(
      this.route('admin/realms/{realm}/authentication/flows/{flowAlias}/executions', {
        realm,
        flowAlias,
      }),
      options,
    );
  }

  /** POST /admin/realms/{realm}/authentication/flows/{flowAlias}/executions/execution: Add new authentication execution to a flow */
  postAdminRealmsRealmAuthenticationFlowsFlowAliasExecutionsExecution(
    realm: number | string,
    flowAlias: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route('admin/realms/{realm}/authentication/flows/{flowAlias}/executions/execution', {
        realm,
        flowAlias,
      }),
      options,
    );
  }

  /** POST /admin/realms/{realm}/authentication/flows/{flowAlias}/executions/flow: Add new flow with new execution to existing flow */
  postAdminRealmsRealmAuthenticationFlowsFlowAliasExecutionsFlow(
    realm: number | string,
    flowAlias: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route('admin/realms/{realm}/authentication/flows/{flowAlias}/executions/flow', {
        realm,
        flowAlias,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/authentication/flows/{id}: Get authentication flow for id */
  getAdminRealmsRealmAuthenticationFlowsId(
    realm: number | string,
    id: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/authentication/flows/{id}', { realm, id }),
      options,
    );
  }

  /** PUT /admin/realms/{realm}/authentication/flows/{id}: Update an authentication flow */
  putAdminRealmsRealmAuthenticationFlowsId(
    realm: number | string,
    id: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.put(
      this.route('admin/realms/{realm}/authentication/flows/{id}', { realm, id }),
      options,
    );
  }

  /** DELETE /admin/realms/{realm}/authentication/flows/{id}: Delete an authentication flow */
  deleteAdminRealmsRealmAuthenticationFlowsId(
    realm: number | string,
    id: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(
      this.route('admin/realms/{realm}/authentication/flows/{id}', { realm, id }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/authentication/form-action-providers: Get form action providers Returns a stream of form action providers. */
  getAdminRealmsRealmAuthenticationFormActionProviders(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/authentication/form-action-providers', { realm }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/authentication/form-providers: Get form providers Returns a stream of form providers. */
  getAdminRealmsRealmAuthenticationFormProviders(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/authentication/form-providers', { realm }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/authentication/per-client-config-description: Get configuration descriptions for all clients */
  getAdminRealmsRealmAuthenticationPerClientConfigDescription(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/authentication/per-client-config-description', { realm }),
      options,
    );
  }

  /** POST /admin/realms/{realm}/authentication/register-required-action: Register a new required actions */
  postAdminRealmsRealmAuthenticationRegisterRequiredAction(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route('admin/realms/{realm}/authentication/register-required-action', { realm }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/authentication/required-actions: Get required actions Returns a stream of required actions. */
  getAdminRealmsRealmAuthenticationRequiredActions(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/authentication/required-actions', { realm }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/authentication/required-actions/{alias}: Get required action for alias */
  getAdminRealmsRealmAuthenticationRequiredActionsAlias(
    realm: number | string,
    alias: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/authentication/required-actions/{alias}', { realm, alias }),
      options,
    );
  }

  /** PUT /admin/realms/{realm}/authentication/required-actions/{alias}: Update required action */
  putAdminRealmsRealmAuthenticationRequiredActionsAlias(
    realm: number | string,
    alias: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.put(
      this.route('admin/realms/{realm}/authentication/required-actions/{alias}', { realm, alias }),
      options,
    );
  }

  /** DELETE /admin/realms/{realm}/authentication/required-actions/{alias}: Delete required action */
  deleteAdminRealmsRealmAuthenticationRequiredActionsAlias(
    realm: number | string,
    alias: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(
      this.route('admin/realms/{realm}/authentication/required-actions/{alias}', { realm, alias }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/authentication/required-actions/{alias}/config: Get RequiredAction configuration */
  getAdminRealmsRealmAuthenticationRequiredActionsAliasConfig(
    realm: number | string,
    alias: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/authentication/required-actions/{alias}/config', {
        realm,
        alias,
      }),
      options,
    );
  }

  /** PUT /admin/realms/{realm}/authentication/required-actions/{alias}/config: Update RequiredAction configuration */
  putAdminRealmsRealmAuthenticationRequiredActionsAliasConfig(
    realm: number | string,
    alias: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.put(
      this.route('admin/realms/{realm}/authentication/required-actions/{alias}/config', {
        realm,
        alias,
      }),
      options,
    );
  }

  /** DELETE /admin/realms/{realm}/authentication/required-actions/{alias}/config: Delete RequiredAction configuration */
  deleteAdminRealmsRealmAuthenticationRequiredActionsAliasConfig(
    realm: number | string,
    alias: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(
      this.route('admin/realms/{realm}/authentication/required-actions/{alias}/config', {
        realm,
        alias,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/authentication/required-actions/{alias}/config-description: Get RequiredAction provider configuration description */
  getAdminRealmsRealmAuthenticationRequiredActionsAliasConfigDescription(
    realm: number | string,
    alias: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route(
        'admin/realms/{realm}/authentication/required-actions/{alias}/config-description',
        { realm, alias },
      ),
      options,
    );
  }

  /** POST /admin/realms/{realm}/authentication/required-actions/{alias}/lower-priority: Lower required action's priority */
  postAdminRealmsRealmAuthenticationRequiredActionsAliasLowerPriority(
    realm: number | string,
    alias: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route('admin/realms/{realm}/authentication/required-actions/{alias}/lower-priority', {
        realm,
        alias,
      }),
      options,
    );
  }

  /** POST /admin/realms/{realm}/authentication/required-actions/{alias}/raise-priority: Raise required action's priority */
  postAdminRealmsRealmAuthenticationRequiredActionsAliasRaisePriority(
    realm: number | string,
    alias: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route('admin/realms/{realm}/authentication/required-actions/{alias}/raise-priority', {
        realm,
        alias,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/authentication/unregistered-required-actions: Get unregistered required actions Returns a stream of unregistered required actions. */
  getAdminRealmsRealmAuthenticationUnregisteredRequiredActions(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/authentication/unregistered-required-actions', { realm }),
      options,
    );
  }
}
