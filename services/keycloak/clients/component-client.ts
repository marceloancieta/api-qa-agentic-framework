import type { APIResponse } from '@playwright/test';
import { BaseClient, type RequestOptions } from '../../../helpers/base-client';

/** `Component` operations. Methods return the raw response; the spec asserts. */
export class ComponentClient extends BaseClient {
  /** GET /admin/realms/{realm}/components */
  getAdminRealmsRealmComponents(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(this.route('admin/realms/{realm}/components', { realm }), options);
  }

  /** POST /admin/realms/{realm}/components */
  postAdminRealmsRealmComponents(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(this.route('admin/realms/{realm}/components', { realm }), options);
  }

  /** GET /admin/realms/{realm}/components/{id} */
  getAdminRealmsRealmComponentsId(
    realm: number | string,
    id: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(this.route('admin/realms/{realm}/components/{id}', { realm, id }), options);
  }

  /** PUT /admin/realms/{realm}/components/{id} */
  putAdminRealmsRealmComponentsId(
    realm: number | string,
    id: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.put(this.route('admin/realms/{realm}/components/{id}', { realm, id }), options);
  }

  /** DELETE /admin/realms/{realm}/components/{id} */
  deleteAdminRealmsRealmComponentsId(
    realm: number | string,
    id: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(this.route('admin/realms/{realm}/components/{id}', { realm, id }), options);
  }

  /** GET /admin/realms/{realm}/components/{id}/sub-component-types: List of subcomponent types that are available to configure for a particular parent component. */
  getAdminRealmsRealmComponentsIdSubComponentTypes(
    realm: number | string,
    id: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/components/{id}/sub-component-types', { realm, id }),
      options,
    );
  }
}
