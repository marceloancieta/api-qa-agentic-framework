import type { APIResponse } from '@playwright/test';
import { BaseClient } from '../../../helpers/base-client';
import type { Order } from '../types';

/** `/store` resource. */
export class StoreClient extends BaseClient {
  inventory(): Promise<APIResponse> {
    return this.get('store/inventory');
  }

  placeOrder(order: Order): Promise<APIResponse> {
    return this.post('store/order', { data: order });
  }

  getOrder(id: number | string): Promise<APIResponse> {
    return this.get(`store/order/${this.segment(id)}`);
  }

  deleteOrder(id: number | string): Promise<APIResponse> {
    return this.delete(`store/order/${this.segment(id)}`);
  }
}
