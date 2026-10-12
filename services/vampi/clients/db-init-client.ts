import type { APIResponse } from '@playwright/test';
import { BaseClient, type RequestOptions } from '../../../helpers/base-client';

/** `db-init` operations. Methods return the raw response; the spec asserts. */
export class DbInitClient extends BaseClient {
  /** GET /createdb: Creates and populates the database with dummy data */
  apiViewsMainPopulateDb(options: RequestOptions = {}): Promise<APIResponse> {
    return this.get('createdb', options);
  }
}
