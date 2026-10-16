import type { APIResponse } from '@playwright/test';
import { BaseClient, type RequestOptions } from '../../../helpers/base-client';

/** `Identity Providers` operations. Methods return the raw response; the spec asserts. */
export class IdentityProvidersClient extends BaseClient {
  /** POST /admin/realms/{realm}/identity-provider/import-config: Import identity provider from JSON body */
  postAdminRealmsRealmIdentityProviderImportConfig(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route('admin/realms/{realm}/identity-provider/import-config', { realm }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/identity-provider/instances: List identity providers */
  getAdminRealmsRealmIdentityProviderInstances(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/identity-provider/instances', { realm }),
      options,
    );
  }

  /** POST /admin/realms/{realm}/identity-provider/instances: Create a new identity provider */
  postAdminRealmsRealmIdentityProviderInstances(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route('admin/realms/{realm}/identity-provider/instances', { realm }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/identity-provider/instances/{alias}: Get the identity provider */
  getAdminRealmsRealmIdentityProviderInstancesAlias(
    realm: number | string,
    alias: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/identity-provider/instances/{alias}', { realm, alias }),
      options,
    );
  }

  /** PUT /admin/realms/{realm}/identity-provider/instances/{alias}: Update the identity provider */
  putAdminRealmsRealmIdentityProviderInstancesAlias(
    realm: number | string,
    alias: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.put(
      this.route('admin/realms/{realm}/identity-provider/instances/{alias}', { realm, alias }),
      options,
    );
  }

  /** DELETE /admin/realms/{realm}/identity-provider/instances/{alias}: Delete the identity provider */
  deleteAdminRealmsRealmIdentityProviderInstancesAlias(
    realm: number | string,
    alias: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(
      this.route('admin/realms/{realm}/identity-provider/instances/{alias}', { realm, alias }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/identity-provider/instances/{alias}/export: Export public broker configuration for identity provider */
  getAdminRealmsRealmIdentityProviderInstancesAliasExport(
    realm: number | string,
    alias: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/identity-provider/instances/{alias}/export', {
        realm,
        alias,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/identity-provider/instances/{alias}/management/permissions: Return object stating whether client Authorization permissions have been initialized or not and a reference */
  getAdminRealmsRealmIdentityProviderInstancesAliasManagementPermissions(
    realm: number | string,
    alias: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route(
        'admin/realms/{realm}/identity-provider/instances/{alias}/management/permissions',
        { realm, alias },
      ),
      options,
    );
  }

  /** PUT /admin/realms/{realm}/identity-provider/instances/{alias}/management/permissions: Return object stating whether client Authorization permissions have been initialized or not and a reference */
  putAdminRealmsRealmIdentityProviderInstancesAliasManagementPermissions(
    realm: number | string,
    alias: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.put(
      this.route(
        'admin/realms/{realm}/identity-provider/instances/{alias}/management/permissions',
        { realm, alias },
      ),
      options,
    );
  }

  /** GET /admin/realms/{realm}/identity-provider/instances/{alias}/mapper-types: Get mapper types for identity provider */
  getAdminRealmsRealmIdentityProviderInstancesAliasMapperTypes(
    realm: number | string,
    alias: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/identity-provider/instances/{alias}/mapper-types', {
        realm,
        alias,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/identity-provider/instances/{alias}/mappers: Get mappers for identity provider */
  getAdminRealmsRealmIdentityProviderInstancesAliasMappers(
    realm: number | string,
    alias: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/identity-provider/instances/{alias}/mappers', {
        realm,
        alias,
      }),
      options,
    );
  }

  /** POST /admin/realms/{realm}/identity-provider/instances/{alias}/mappers: Add a mapper to identity provider */
  postAdminRealmsRealmIdentityProviderInstancesAliasMappers(
    realm: number | string,
    alias: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route('admin/realms/{realm}/identity-provider/instances/{alias}/mappers', {
        realm,
        alias,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/identity-provider/instances/{alias}/mappers/{id}: Get mapper by id for the identity provider */
  getAdminRealmsRealmIdentityProviderInstancesAliasMappersId(
    realm: number | string,
    alias: number | string,
    id: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/identity-provider/instances/{alias}/mappers/{id}', {
        realm,
        alias,
        id,
      }),
      options,
    );
  }

  /** PUT /admin/realms/{realm}/identity-provider/instances/{alias}/mappers/{id}: Update a mapper for the identity provider */
  putAdminRealmsRealmIdentityProviderInstancesAliasMappersId(
    realm: number | string,
    alias: number | string,
    id: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.put(
      this.route('admin/realms/{realm}/identity-provider/instances/{alias}/mappers/{id}', {
        realm,
        alias,
        id,
      }),
      options,
    );
  }

  /** DELETE /admin/realms/{realm}/identity-provider/instances/{alias}/mappers/{id}: Delete a mapper for the identity provider */
  deleteAdminRealmsRealmIdentityProviderInstancesAliasMappersId(
    realm: number | string,
    alias: number | string,
    id: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(
      this.route('admin/realms/{realm}/identity-provider/instances/{alias}/mappers/{id}', {
        realm,
        alias,
        id,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/identity-provider/instances/{alias}/reload-keys: Reaload keys for the identity provider if the provider supports it, "true" is returned if reload was performed, "false" if not. */
  getAdminRealmsRealmIdentityProviderInstancesAliasReloadKeys(
    realm: number | string,
    alias: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/identity-provider/instances/{alias}/reload-keys', {
        realm,
        alias,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/identity-provider/providers/{provider_id}: Get the identity provider factory for that provider id */
  getAdminRealmsRealmIdentityProviderProvidersProviderId(
    realm: number | string,
    providerId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/identity-provider/providers/{provider_id}', {
        realm,
        provider_id: providerId,
      }),
      options,
    );
  }
}
