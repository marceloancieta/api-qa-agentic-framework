import type { APIResponse } from '@playwright/test';
import { BaseClient, type RequestOptions } from '../../../helpers/base-client';

/** `Client Initial Access` operations. Methods return the raw response; the spec asserts. */
export class ClientInitialAccessClient extends BaseClient {
  /** GET /admin/realms/{realm}/clients-initial-access */
  getAdminRealmsRealmClientsInitialAccess(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(this.route('admin/realms/{realm}/clients-initial-access', { realm }), options);
  }

  /** POST /admin/realms/{realm}/clients-initial-access: Create a new initial access token. */
  postAdminRealmsRealmClientsInitialAccess(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(this.route('admin/realms/{realm}/clients-initial-access', { realm }), options);
  }

  /** DELETE /admin/realms/{realm}/clients-initial-access/{id} */
  deleteAdminRealmsRealmClientsInitialAccessId(
    realm: number | string,
    id: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(
      this.route('admin/realms/{realm}/clients-initial-access/{id}', { realm, id }),
      options,
    );
  }
}
