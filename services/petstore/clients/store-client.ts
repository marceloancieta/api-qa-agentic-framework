import type { APIResponse } from '@playwright/test';
import { BaseClient } from '../../../helpers/base-client';

/** `/store` resource. */
export class StoreClient extends BaseClient {
  inventory(): Promise<APIResponse> {
    return this.get('store/inventory');
  }
}
