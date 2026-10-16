import type { APIResponse } from '@playwright/test';
import { BaseClient, type RequestOptions } from '../../../helpers/base-client';

/** `Key` operations. Methods return the raw response; the spec asserts. */
export class KeyClient extends BaseClient {
  /** GET /admin/realms/{realm}/keys */
  getAdminRealmsRealmKeys(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(this.route('admin/realms/{realm}/keys', { realm }), options);
  }
}
