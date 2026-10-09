// Flow: an actor lists a pet and places an order for it. Steps show up in the report; a step that
// fails stops the flow, because a broken precondition is not what the calling spec is testing.

import { expectStatus, step } from '../../../helpers/flow';
import type { PetstoreClients } from '../fixtures';
import type { Order, Pet } from '../types';

export interface Purchase {
  pet: Pet;
  order: Order;
}

export async function purchasePet(
  clients: PetstoreClients,
  pet: Pet,
  order: Order,
): Promise<Purchase> {
  const listed = await step('list the pet for sale', async () =>
    expectStatus<Pet>(await clients.pets.create(pet), 200, 'create pet'),
  );
  const placed = await step('place the order', async () =>
    expectStatus<Order>(
      await clients.store.placeOrder({ ...order, petId: listed.id }),
      200,
      'place order',
    ),
  );
  return { pet: listed, order: placed };
}

/** Undo a purchase. Missing resources are fine: cleanup must not fail a case that already failed. */
export async function cancelPurchase(clients: PetstoreClients, purchase: Partial<Purchase>) {
  if (purchase.order?.id !== undefined) await clients.store.deleteOrder(purchase.order.id);
  if (purchase.pet?.id !== undefined) await clients.pets.remove(purchase.pet.id);
}
