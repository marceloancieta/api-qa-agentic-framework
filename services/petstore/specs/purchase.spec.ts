// Example of the opt-in layers: an actor, a flow and builders. The subject is the order read-back;
// listing the pet and placing the order are the flow's preconditions.

import { test, expect } from '../fixtures';
import { aPet } from '../builders/pet-builder';
import { anOrder } from '../builders/order-builder';
import { cancelPurchase, purchasePet, type Purchase } from '../flows/purchase';

test.describe('Petstore purchase', () => {
  test('a placed order can be read back with its pet and quantity', async ({
    actor,
    qa,
    faker,
    clock,
    contract,
  }) => {
    test.skip(!qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const buyer = await actor('default');
    const pet = aPet(faker).withStatus('available').build();
    const order = anOrder(faker, clock).withQuantity(2).build();
    let purchase: Partial<Purchase> = { pet, order };
    try {
      purchase = await purchasePet(buyer, pet, order);

      const read = await buyer.store.getOrder(purchase.order?.id as number);
      expect(read.status()).toBe(200);
      const body: unknown = await read.json();
      expect(body).toMatchSchema(contract, 'Order');
      expect(body).toMatchObject({
        id: order.id,
        petId: pet.id,
        quantity: 2,
        status: 'placed',
      });
    } finally {
      await cancelPurchase(buyer, purchase);
    }
  });
});
