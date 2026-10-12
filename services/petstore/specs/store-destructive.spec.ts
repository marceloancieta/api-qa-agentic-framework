// Destructive store case (registry/store.md, L-59). An order without a status makes the inventory
// answer 500 to every caller while it exists (PN-17, LOCAL-2), so this file holds only destructive
// cases: every other run leaves them out and `npm run lanes:destructive` runs each alone, followed
// by the pack's recovery. The case itself deletes its orders in `finally`.

import { test, expect } from '../fixtures';
import { caseDescription, knownGap, operation } from '../../../helpers/case-meta';
import { skipUnless } from '../../../helpers/data-gate';
import { expectInventoryMap } from '../assertions';
import { anOrder } from '../builders/order-builder';
import { aPet } from '../builders/pet-builder';
import { removeOrder, removePet } from '../flows/cleanup';
import type { Order } from '../types';

const AREA = 'store';

test('TC-STOR-27 An order without status leaves the inventory answering 200 @regression @destructive @known-gap @data-integrity probe:p-a1aafd58bf probe:p-46c7d683e4 probe:p-14922c0e29 probe:p-6e48590751', async ({
  pets,
  store,
  qa,
  faker,
  clock,
}) => {
  await operation({ method: 'POST', path: '/store/order', area: AREA });
  await caseDescription(
    '`POST /store/order` with `{"id": <ORDER_ID>}`, then `<VALID_ORDER>` with `"status": null`, ' +
      'then `<VALID_ORDER>` without `status` and `complete` `true`, `false` and omitted, each with ' +
      'a fresh `<ORDER_ID>`. Each answers `200` (status is optional) and `GET /store/inventory` ' +
      'keeps answering `200` after each. Today the inventory answers `500` while such an order ' +
      'exists (PN-17, `LOCAL-2`). Recovery: delete every order, confirm each reads `404` and the ' +
      'inventory answers `200` again.',
  );
  skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

  const pet = aPet(faker).build();
  const petId = pet.id as number;
  const withoutStatus = (complete?: boolean): Order => {
    const order: Order = anOrder(faker, clock).forPet(petId).build();
    delete order.status;
    if (complete === undefined) delete order.complete;
    else order.complete = complete;
    return order;
  };
  const nullStatus = { ...anOrder(faker, clock).forPet(petId).build(), status: null };
  const variants: [string, Record<string, unknown>][] = [
    ['id only', { id: anOrder(faker, clock).build().id }],
    ['status null', nullStatus],
    ['complete true', { ...withoutStatus(true) }],
    ['complete false', { ...withoutStatus(false) }],
    ['complete omitted', { ...withoutStatus() }],
  ];
  const ids = variants.map(([, body]) => body['id'] as number);
  for (const id of ids) expect((await store.getOrder(id)).status(), `order ${id} free`).toBe(404);
  expect((await store.inventory()).status(), 'inventory answers before').toBe(200);
  try {
    expect((await pets.create(pet)).status()).toBe(200);

    test.fail(
      true,
      await knownGap('LOCAL-2', 'the inventory answers 500 while an order has no status'),
    );
    for (const [label, body] of variants) {
      await test.step(label, async () => {
        expect.soft((await store.placeOrderRaw(JSON.stringify(body))).status()).toBe(200);
        await expect
          .soft(expectInventoryMap(await store.inventory()), 'inventory after')
          .resolves.toBeUndefined();
      });
    }
  } finally {
    for (const id of ids) expect(await removeOrder({ store }, id)).toBe(404);
    expect((await store.inventory()).status(), 'inventory answers again').toBe(200);
    expect(await removePet({ pets }, petId)).toBe(404);
  }
});
