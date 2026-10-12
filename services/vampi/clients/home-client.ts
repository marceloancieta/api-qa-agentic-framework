import type { APIResponse } from '@playwright/test';
import { BaseClient, type RequestOptions } from '../../../helpers/base-client';

/** `home` operations. Methods return the raw response; the spec asserts. */
export class HomeClient extends BaseClient {
  /** GET /: VAmPI home */
  apiViewsMainBasic(options: RequestOptions = {}): Promise<APIResponse> {
    return this.get('', options);
  }
}
