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

  /** A body sent byte for byte with the given content type, for malformed or mislabelled orders. */
  placeOrderRaw(body: string, contentType = 'application/json'): Promise<APIResponse> {
    return this.post('store/order', { data: body, headers: { 'Content-Type': contentType } });
  }

  getOrder(id: number | string): Promise<APIResponse> {
    return this.get(this.route('store/order/{orderId}', { orderId: id }));
  }

  deleteOrder(id: number | string): Promise<APIResponse> {
    return this.delete(this.route('store/order/{orderId}', { orderId: id }));
  }
}
