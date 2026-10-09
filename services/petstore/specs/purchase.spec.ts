// Example of the opt-in layers: an actor, a flow and builders. The subject is the order read-back;
// listing the pet and placing the order are the flow's preconditions.

import { test, expect } from '../fixtures';
import { aPet } from '../builders/pet-builder';
import { anOrder } from '../builders/order-builder';
import { cancelPurchase, purchasePet, type Purchase } from '../flows/purchase';
import { skipUnless } from '../../../helpers/data-gate';
import { expectSameState } from '../../../helpers/state-compare';
import { ORDER_FIELDS } from '../state-models';

test.describe('Petstore purchase', () => {
  test('a placed order can be read back with its pet and quantity', async ({
    actor,
    qa,
    faker,
    clock,
    contract,
  }) => {
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

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
      // Field by field; the ship date is compared as an instant (contract note PN-04).
      expectSameState({ ...order, petId: pet.id }, body, ORDER_FIELDS);
    } finally {
      await cancelPurchase(buyer, purchase);
    }
  });
});
