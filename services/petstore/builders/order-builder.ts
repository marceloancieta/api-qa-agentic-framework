// Test Data Builder for Order. The ship date comes from the injected clock, never from Date.now().

import type { Faker } from '@faker-js/faker';
import type { Clock } from '../../../helpers/clock';
import type { Order, OrderStatus } from '../types';
import { GENERATED_ID_MAX, GENERATED_ID_MIN } from './pet-builder';

export class OrderBuilder {
  private readonly order: Order;

  constructor(faker: Faker, clock: Clock) {
    this.order = {
      id: faker.number.int({ min: GENERATED_ID_MIN, max: GENERATED_ID_MAX }),
      quantity: faker.number.int({ min: 1, max: 5 }),
      shipDate: clock.now().toISOString(),
      status: 'placed',
      complete: false,
    };
  }

  forPet(petId: number): this {
    this.order.petId = petId;
    return this;
  }

  withQuantity(quantity: number): this {
    this.order.quantity = quantity;
    return this;
  }

  withStatus(status: OrderStatus): this {
    this.order.status = status;
    return this;
  }

  build(): Order {
    return structuredClone(this.order);
  }
}

export const anOrder = (faker: Faker, clock: Clock): OrderBuilder => new OrderBuilder(faker, clock);
