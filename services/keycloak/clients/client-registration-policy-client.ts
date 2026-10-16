import type { APIResponse } from '@playwright/test';
import { BaseClient, type RequestOptions } from '../../../helpers/base-client';

/** `Client Registration Policy` operations. Methods return the raw response; the spec asserts. */
export class ClientRegistrationPolicyClient extends BaseClient {
  /** GET /admin/realms/{realm}/client-registration-policy/providers: Base path for retrieve providers with the configProperties properly filled */
  getAdminRealmsRealmClientRegistrationPolicyProviders(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/client-registration-policy/providers', { realm }),
      options,
    );
  }
}
