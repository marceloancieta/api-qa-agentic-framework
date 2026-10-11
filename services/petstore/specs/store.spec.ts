// Store: orders and the inventory (registry/store.md). Every order id comes from anOrder and is
// confirmed absent before the first write; every order and pet a case creates is deleted and
// confirmed by a read that answers 404. No case sends an order for id 0, where a body the service
// stores without an id lands (PN-17); TC-STOR-06 only removes one its refused bodies left there.

import { test, expect } from '../fixtures';
import { caseDescription, operation } from '../../../helpers/case-meta';
import { skipUnless } from '../../../helpers/data-gate';
import { expectErrorEnvelope } from '../../../helpers/error-envelope';
import { expectSameState } from '../../../helpers/state-compare';
import { expectInventoryMap } from '../assertions';
import { anOrder } from '../builders/order-builder';
import { aPet } from '../builders/pet-builder';
import { removeOrder, removePet } from '../flows/cleanup';
import { cancelPurchase, purchasePet, type Purchase } from '../flows/purchase';
import { ORDER_FIELDS } from '../state-models';
import { ORDER_STATUSES, type Order } from '../types';

const AREA = 'store';
test.describe('Store', () => {
  test('TC-STOR-01 A valid order is placed and reads back with the values sent @smoke @data-integrity', async ({
    actor,
    qa,
    faker,
    clock,
    contract,
  }) => {
    await operation({ method: 'POST', path: '/store/order', area: AREA, severity: 'critical' });
    await caseDescription(
      'The `purchasePet` flow lists a pet and places `<VALID_ORDER>` for it with ' +
        '`POST /store/order`; `GET /store/order/<ORDER_ID>` reads it back. Both answers are `200`, ' +
        'match `Order` and carry the business fields sent (`shipDate` compared as an instant, ' +
        'PN-04).',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const buyer = await actor('default');
    const pet = aPet(faker).build();
    const order = anOrder(faker, clock).withQuantity(2).build();
    const orderId = order.id as number;
    expect((await buyer.store.getOrder(orderId)).status(), 'order id free before').toBe(404);
    let purchase: Partial<Purchase> = { pet, order };
    try {
      purchase = await purchasePet(buyer, pet, order);
      expect(purchase.order).toMatchSchema(contract, 'Order');
      expectSameState({ ...order, petId: pet.id }, purchase.order, ORDER_FIELDS);

      const read = await buyer.store.getOrder(orderId);
      expect(read.status()).toBe(200);
      const stored: unknown = await read.json();
      expect(stored).toMatchSchema(contract, 'Order');
      expectSameState({ ...order, petId: pet.id }, stored, ORDER_FIELDS);
    } finally {
      await cancelPurchase(buyer, purchase);
      expect((await buyer.store.getOrder(orderId)).status()).toBe(404);
      expect((await buyer.pets.getById(pet.id as number)).status()).toBe(404);
    }
  });

  test('TC-STOR-02 Every status and complete combination is stored and reads back as sent @regression @data-integrity probe:p-998560ef2e probe:p-16a5f8465e probe:p-a651760305 probe:p-68ed126724 probe:p-8cb7db05f7 probe:p-eec4f45f31 probe:p-9e83ee67ff probe:p-9363ba71df probe:p-47e36835bb', async ({
    pets,
    store,
    qa,
    faker,
    clock,
    contract,
  }) => {
    await operation({ method: 'POST', path: '/store/order', area: AREA });
    await caseDescription(
      'For each of the nine combinations of `status` (every `OrderStatus` value) and `complete` ' +
        "(`true`, `false`, omitted), an order for the case's pet is placed, read back and deleted. " +
        'Each answer is `200` and `Order`; status and complete read back as sent, and an omitted ' +
        '`complete` reads back as `false` (the baseline measured at W-21, L-56).',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const pet = aPet(faker).build();
    const petId = pet.id as number;
    try {
      expect((await pets.create(pet)).status()).toBe(200);
      for (const status of ORDER_STATUSES) {
        for (const complete of [true, false, undefined]) {
          await test.step(`status=${status}, complete=${complete ?? '(omitted)'}`, async () => {
            const order: Order = anOrder(faker, clock).forPet(petId).withStatus(status).build();
            if (complete === undefined) delete order.complete;
            else order.complete = complete;
            const id = order.id as number;
            expect((await store.getOrder(id)).status(), 'order id free before').toBe(404);
            try {
              const placed = await store.placeOrder(order);
              expect.soft(placed.status()).toBe(200);
              const answer: unknown = await placed.json();
              expect.soft(answer).toMatchSchema(contract, 'Order');
              const read = await store.getOrder(id);
              expect(read.status()).toBe(200);
              const stored: unknown = await read.json();
              expect.soft(stored).toMatchSchema(contract, 'Order');
              expect.soft(stored).toMatchObject({ status, complete: complete ?? false });
            } finally {
              expect(await removeOrder({ store }, id)).toBe(404);
            }
          });
        }
      }
    } finally {
      expect(await removePet({ pets }, petId)).toBe(404);
    }
  });

  test('TC-STOR-06 A body that cannot be read as an Order is refused and stores nothing @regression @contract-drift @data-integrity probe:p-6e89af34c6 probe:p-f54f62ef61 probe:p-6656b5bf39 probe:p-2d61516968', async ({
    store,
    qa,
    faker,
    clock,
    envelopes,
  }) => {
    await operation({ method: 'POST', path: '/store/order', area: AREA });
    await caseDescription(
      '`POST /store/order` with malformed JSON, truncated JSON, an empty body, a JSON text that is ' +
        'not an object, and `<VALID_ORDER>` labelled `text/plain`. Each JSON variant answers `400` ' +
        '(the `input-error` envelope where the service parses the body; the empty body answers ' +
        'plain text, PN-08) and `text/plain` answers `415`, a code the contract does not declare. ' +
        'Nothing is stored: `<ORDER_ID>` and order `0` read `404`.',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const order = anOrder(faker, clock).build();
    const id = order.id as number;
    const valid = JSON.stringify(order);
    expect((await store.getOrder(id)).status(), 'order id free before').toBe(404);
    expect((await store.getOrder(0)).status(), 'order 0 absent before').toBe(404);
    try {
      const malformed: [string, string][] = [
        ['malformed', `{${valid}`],
        ['truncated', valid.slice(0, -2)],
        ['not an object', JSON.stringify('not-an-object')],
      ];
      for (const [label, body] of malformed) {
        await test.step(label, async () => {
          await expectErrorEnvelope(await store.placeOrderRaw(body), envelopes, 'input-error');
        });
      }
      await test.step('empty body', async () => {
        expect((await store.placeOrderRaw('')).status()).toBe(400);
      });
      await test.step('text/plain', async () => {
        expect((await store.placeOrderRaw(valid, 'text/plain')).status()).toBe(415);
      });

      await expectErrorEnvelope(await store.getOrder(id), envelopes, 'not-found');
      await expectErrorEnvelope(await store.getOrder(0), envelopes, 'not-found');
    } finally {
      expect(await removeOrder({ store }, id)).toBe(404);
      // Order 0 read 404 before any write, and no other case writes it: a refused variant the
      // service stored anyway (an empty body read as `{}`, PN-17) is this case's to remove.
      expect(await removeOrder({ store }, 0)).toBe(404);
    }
  });

  test('TC-STOR-21 Deleting an owned order answers 200 and the order reads 404 afterwards @smoke @data-integrity', async ({
    actor,
    qa,
    faker,
    clock,
    envelopes,
  }) => {
    await operation({
      method: 'DELETE',
      path: '/store/order/{orderId}',
      area: AREA,
      severity: 'critical',
    });
    await caseDescription(
      'An order the case placed and read back with `200` is deleted with ' +
        '`DELETE /store/order/<ORDER_ID>`. The delete answers `200` with no body, and a later read ' +
        'answers `404` with the `not-found` envelope.',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const buyer = await actor('default');
    const pet = aPet(faker).build();
    const order = anOrder(faker, clock).build();
    const orderId = order.id as number;
    expect((await buyer.store.getOrder(orderId)).status(), 'order id free before').toBe(404);
    let purchase: Partial<Purchase> = { pet, order };
    try {
      purchase = await purchasePet(buyer, pet, order);
      expect((await buyer.store.getOrder(orderId)).status()).toBe(200);

      const removed = await buyer.store.deleteOrder(orderId);
      expect(removed.status()).toBe(200);
      expect(await removed.text()).toBe('');

      await expectErrorEnvelope(await buyer.store.getOrder(orderId), envelopes, 'not-found');
    } finally {
      await cancelPurchase(buyer, purchase);
      expect((await buyer.store.getOrder(orderId)).status()).toBe(404);
      expect((await buyer.pets.getById(pet.id as number)).status()).toBe(404);
    }
  });

  test('TC-STOR-25 The inventory answers a map of int32 counts @sanity', async ({ store }) => {
    await operation({ method: 'GET', path: '/store/inventory', area: AREA, severity: 'critical' });
    await caseDescription(
      '`GET /store/inventory` answers `200` `application/json` with an object whose every value is ' +
        'an integer within int32. No key is required and no count is asserted (L-25). Read only.',
    );

    await expectInventoryMap(await store.inventory());
  });

  test('TC-STOR-28 The inventory without an api_key header answers as the service declares @regression @security', async ({
    actor,
  }) => {
    await operation({ method: 'GET', path: '/store/inventory', area: AREA });
    await caseDescription(
      '`GET /store/inventory` as the `anonymous` actor, with no `api_key` header. The contract ' +
        'declares `api_key`, so an API that enforced it would answer `401`; this image does not ' +
        '(PN-05, tolerated), and the case records the `200` with the map of int32 counts. Read only.',
    );
    const anonymous = await actor('anonymous');

    await expectInventoryMap(await anonymous.store.inventory());
  });
});
