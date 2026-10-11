// Pets: create, read and delete (registry/pet.md). Every case creates its own pet with an id from the
// builder's range and deletes it afterwards, confirmed by a read that answers 404; the seed pets are
// only read.

import { test, expect } from '../fixtures';
import { caseDescription, operation } from '../../../helpers/case-meta';
import { requireData, skipUnless } from '../../../helpers/data-gate';
import { expectErrorEnvelope } from '../../../helpers/error-envelope';
import { expectSameState } from '../../../helpers/state-compare';
import { aPet } from '../builders/pet-builder';
import { removePet } from '../flows/cleanup';
import { PET_FIELDS } from '../state-models';
import { PET_STATUSES, type Pet } from '../types';

const AREA = 'pet';
const INT64_MAX = (2n ** 63n - 1n).toString();
const INT64_OVERFLOW = (2n ** 63n).toString();
const INT64_MIN = (-(2n ** 63n)).toString();
const SEED_PET_ID = 2;

test.describe('Pets', () => {
  test('TC-PET-01 A pet created with every field reads back as sent @smoke @data-integrity', async ({
    pets,
    qa,
    faker,
    contract,
  }) => {
    await operation({ method: 'POST', path: '/pet', area: AREA, severity: 'critical' });
    await caseDescription(
      'A pet with every optional field set (category, a tag, photo URLs, a non-default status) is ' +
        'created with `POST /pet` and read back with `GET /pet/<PET_ID>`. Both answers are `200`, ' +
        'match `Pet` and equal the sent body field by field.',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const pet = aPet(faker).withUniqueTag().withStatus('pending').build();
    const id = pet.id as number;
    try {
      const created = await pets.create(pet);
      expect(created.status()).toBe(200);
      const answer: unknown = await created.json();
      expect(answer).toMatchSchema(contract, 'Pet');
      expectSameState(pet, answer, PET_FIELDS);

      const read = await pets.getById(id);
      expect(read.status()).toBe(200);
      const stored: unknown = await read.json();
      expect(stored).toMatchSchema(contract, 'Pet');
      expectSameState(pet, stored, PET_FIELDS);
    } finally {
      expect(await removePet({ pets }, id)).toBe(404);
    }
  });

  test('TC-PET-11 A create with an id one above the int64 maximum is refused and creates nothing @regression @data-integrity probe:p-e0c43a4d06', async ({
    pets,
    qa,
    faker,
    envelopes,
  }) => {
    await operation({ method: 'POST', path: '/pet', area: AREA });
    await caseDescription(
      'A full pet body whose `id` is `<INT64_OVERFLOW>` (one above the largest int64) is sent with ' +
        '`POST /pet`. It is refused with `400` and the `input-error` envelope, and ' +
        '`GET /pet/<INT64_MAX>` and `GET /pet/<INT64_MIN>` still answer `404`: nothing was stored at ' +
        'either int64 edge.',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);
    expect((await pets.getById(INT64_MAX)).status(), 'nothing at the int64 maximum before').toBe(
      404,
    );
    expect((await pets.getById(INT64_MIN)).status(), 'nothing at the int64 minimum before').toBe(
      404,
    );

    const overflowing = aPet(faker).toJson({ id: INT64_OVERFLOW });
    await expectErrorEnvelope(await pets.createRaw(overflowing), envelopes, 'input-error');

    // Neither edge holds a pet: a parse that wraps 2^63 around would store it at the minimum.
    await expectErrorEnvelope(await pets.getById(INT64_MAX), envelopes, 'not-found');
    await expectErrorEnvelope(await pets.getById(INT64_MIN), envelopes, 'not-found');
  });

  test('TC-PET-14 A create body with an unsupported content type is refused and stores nothing @regression @contract-drift @data-integrity probe:p-175f261d92', async ({
    pets,
    qa,
    faker,
    envelopes,
  }) => {
    await operation({ method: 'POST', path: '/pet', area: AREA });
    await caseDescription(
      'A valid JSON pet body is sent with `POST /pet` but labelled `Content-Type: text/plain`. The ' +
        'answer is `415`, a code the contract does not declare (PN-08): the case records that drift, ' +
        'so a change to any other refusal shows up. `GET /pet/<PET_ID>` answers `404`.',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const pet = aPet(faker).build();
    const id = pet.id as number;
    try {
      const refused = await pets.createRaw(JSON.stringify(pet), 'text/plain');
      expect(refused.status()).toBe(415);

      await expectErrorEnvelope(await pets.getById(id), envelopes, 'not-found');
    } finally {
      expect(await removePet({ pets }, id)).toBe(404);
    }
  });

  test('TC-PET-18 A seed pet reads back with the declared Pet shape @sanity', async ({
    pets,
    contract,
  }) => {
    await operation({ method: 'GET', path: '/pet/{petId}', area: AREA, severity: 'critical' });
    await caseDescription(
      '`GET /pet/<SEED_PET_ID>` for one of the seed pets answers `200` with a body that matches ' +
        '`Pet`, whose `id` is the requested id and whose `status` is a member of `Pet.status`. Read ' +
        'only.',
    );
    const seed = await requireData(`seed pet ${SEED_PET_ID}`, async () => {
      const response = await pets.getById(SEED_PET_ID);
      return response.status() === 404 ? null : response;
    });

    expect(seed.status()).toBe(200);
    const seedBody: unknown = await seed.json();
    expect(seedBody).toMatchSchema(contract, 'Pet');
    const seedPet = seedBody as Pet;
    expect(seedPet.id).toBe(SEED_PET_ID);
    expect(PET_STATUSES).toContain(seedPet.status);
  });

  test('TC-PET-23 Deleting a pet removes it and a later read answers not-found @smoke @data-integrity', async ({
    pets,
    qa,
    faker,
    envelopes,
  }) => {
    await operation({ method: 'DELETE', path: '/pet/{petId}', area: AREA, severity: 'critical' });
    await caseDescription(
      'A pet the case created and read back once is deleted with `DELETE /pet/<PET_ID>`. The ' +
        'delete answers `200` and a later `GET /pet/<PET_ID>` answers `404` with the `not-found` ' +
        'envelope.',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const pet = aPet(faker).build();
    const id = pet.id as number;
    try {
      expect((await pets.create(pet)).status()).toBe(200);
      expect((await pets.getById(id)).status()).toBe(200);

      expect((await pets.remove(id)).status()).toBe(200);

      await expectErrorEnvelope(await pets.getById(id), envelopes, 'not-found');
    } finally {
      expect(await removePet({ pets }, id)).toBe(404);
    }
  });

  test('TC-PET-26 An anonymous caller creates, reads and deletes its own pet like the default caller @regression @security @data-integrity', async ({
    actor,
    qa,
    faker,
  }) => {
    await operation({ method: 'POST', path: '/pet', area: AREA });
    await caseDescription(
      'The `anonymous` and the `default` actor each create, read and delete a pet of their own. ' +
        'The contract asks for `petstore_auth`, but the service requires no credential (PN-05, ' +
        'tolerated), so the case asserts parity: both actors get `200`, `200`, `200`, `404` and ' +
        'equivalent bodies. A difference between the actors is a finding.',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const callers = [await actor('anonymous'), await actor('default')];
    const owned = callers.map((caller) => ({ caller, pet: aPet(faker).build() }));
    const statuses: Record<string, number[]> = {};
    const readBack: Record<string, string> = {};
    try {
      for (const { caller, pet } of owned) {
        const id = pet.id as number;
        const created = await caller.pets.create(pet);
        const read = await caller.pets.getById(id);
        readBack[caller.name] = await read.text();
        const removed = await caller.pets.remove(id);
        const after = await caller.pets.getById(id);
        statuses[caller.name] = [created, read, removed, after].map((r) => r.status());
      }

      expect(statuses['anonymous']).toEqual([200, 200, 200, 404]);
      expect(statuses['default']).toEqual(statuses['anonymous']);
      for (const { caller, pet } of owned) {
        expectSameState(pet, JSON.parse(readBack[caller.name] ?? ''), PET_FIELDS);
      }
    } finally {
      for (const { caller, pet } of owned) {
        expect(await removePet(caller, pet.id as number)).toBe(404);
      }
    }
  });
});
