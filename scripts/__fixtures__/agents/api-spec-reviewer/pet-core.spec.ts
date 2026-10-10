// Pet core: create, replace and status moves of pets, each case on a pet it creates, read back and
// compared with the field models of the pack.

import { test, expect } from '../../../../services/petstore/fixtures';
import { aPet, GENERATED_ID_MAX } from '../../../../services/petstore/builders/pet-builder';
import { PetMother } from '../../../../services/petstore/builders/mother';
import { PET_FIELDS } from '../../../../services/petstore/state-models';
import type { Pet } from '../../../../services/petstore/types';
import { caseDescription, knownGap, operation } from '../../../../helpers/case-meta';
import { requireData, skipUnless } from '../../../../helpers/data-gate';
import { expectErrorEnvelope } from '../../../../helpers/error-envelope';
import { expectOnlyChanged, expectSameState } from '../../../../helpers/state-compare';

const WRITES_OFF = (environment: string) => `environment "${environment}" does not allow writes`;

test.describe('Pet core', () => {
  test('TC-PETREV-01 creating a pet stores every field and it reads back equal @smoke @data-integrity', async ({
    pets,
    qa,
    faker,
    contract,
  }) => {
    await operation({ method: 'post', path: '/pet', area: 'pet', severity: 'critical' });
    await caseDescription('A pet created with every field reads back equal to the body sent.');
    skipUnless(qa.allowWrites, WRITES_OFF(qa.environment));

    const pet = aPet(faker).withAnyStatus().build();
    const id = pet.id as number;
    try {
      const created = await test.step('Act', () => pets.create(pet));
      await test.step('Assert', async () => {
        expect(created.status()).toBe(200);
        const body: unknown = await created.json();
        expect(body).toMatchSchema(contract, 'Pet');
        expectSameState(pet, body, PET_FIELDS);

        const read = await pets.getById(id);
        expect(read.status()).toBe(200);
        expectSameState(pet, await read.json(), PET_FIELDS);
      });
    } finally {
      await pets.remove(id);
    }
  });

  test('TC-PETREV-02 updating a pet with PUT stores the new name and status @smoke @data-integrity', async ({
    pets,
    qa,
    faker,
    contract,
  }) => {
    await operation({ method: 'put', path: '/pet', area: 'pet', severity: 'critical' });
    await caseDescription('A `PUT /pet` stores a new name and a new status for an existing pet.');
    skipUnless(qa.allowWrites, WRITES_OFF(qa.environment));

    const pet = PetMother.available(faker);
    const id = pet.id as number;
    try {
      await test.step('Arrange', async () => {
        expect((await pets.create(pet)).status()).toBe(200);
      });
      const changed: Pet = { ...pet, name: `${pet.name}-renamed`, status: 'sold' };
      const response = await test.step('Act', () => pets.update(changed));
      await test.step('Assert', async () => {
        expect(response.status()).toBe(200);
        expect(changed).toMatchSchema(contract, 'Pet'); // expect-review: vacuous-assertion
        const read = (await (await pets.getById(id)).json()) as Pet;
        expect(read.name).toBe(changed.name); // expect-review: title-claim
      });
    } finally {
      await pets.remove(id);
    }
  });

  test('TC-PETREV-03 a PUT without a name is refused @regression @contract-drift @data-integrity @known-gap', async ({
    pets,
    qa,
    faker,
    contract,
    envelopes,
  }) => {
    await operation({ method: 'put', path: '/pet', area: 'pet' });
    await caseDescription('A `PUT /pet` without `name` is refused and the pet is unchanged.');
    skipUnless(qa.allowWrites, WRITES_OFF(qa.environment));

    const pet = aPet(faker).build();
    const id = pet.id as number;
    try {
      await test.step('Arrange', async () => {
        expect((await pets.create(pet)).status()).toBe(200);
      });
      const nameless: Partial<Pet> = { ...pet };
      delete nameless.name;
      const response = await test.step('Act', async () => {
        test.fail(true, await knownGap('GAP-1', 'a PUT without a name answers 200 and stores it'));
        return pets.update(nameless as Pet);
      });
      // expect-review: missing-oracle
      await test.step('Assert', async () => {
        // The registry allows either refusal; each branch checks the body of its own status.
        if (response.status() === 422) {
          expect(await response.json()).toMatchSchema(contract, 'ApiResponse');
        } else {
          await expectErrorEnvelope(response, envelopes, 'input-error');
        }
      });
    } finally {
      await pets.remove(id);
    }
  });

  test('TC-PETREV-04 a PUT without a status keeps the stored status @regression @data-integrity', async ({
    pets,
    qa,
    faker,
    contract,
  }) => {
    await operation({ method: 'put', path: '/pet', area: 'pet' });
    await caseDescription('A `PUT /pet` without `status` changes the name and keeps the status.');
    skipUnless(qa.allowWrites, WRITES_OFF(qa.environment));

    // Sold, not the builder's default: a server that resets an omitted status would fail (L-20).
    const pet = PetMother.sold(faker);
    const id = pet.id as number;
    try {
      const before = await test.step('Arrange', async () => {
        expect((await pets.create(pet)).status()).toBe(200);
        return (await (await pets.getById(id)).json()) as Pet;
      });
      const body: Partial<Pet> = { ...before, name: `${before.name}-renamed` };
      delete body.status;
      const response = await test.step('Act', () => pets.update(body as Pet));
      await test.step('Assert', async () => {
        expect(response.status()).toBe(200);
        expect(await response.json()).toMatchSchema(contract, 'Pet');
        const after: unknown = await (await pets.getById(id)).json();
        expectOnlyChanged(before, after, PET_FIELDS, ['name']);
      });
    } finally {
      await pets.remove(id);
    }
  });

  test('TC-PETREV-05 a PUT without tags keeps the stored tags @regression @data-integrity', async ({
    pets,
    qa,
    faker,
    contract,
  }) => {
    await operation({ method: 'put', path: '/pet', area: 'pet' });
    await caseDescription('A `PUT /pet` that omits `tags` keeps the tags already stored.');
    skipUnless(qa.allowWrites, WRITES_OFF(qa.environment));

    const pet = PetMother.minimal(faker); // expect-review: coincidental-pass
    const id = pet.id as number;
    try {
      const before = await test.step('Arrange', async () => {
        expect((await pets.create(pet)).status()).toBe(200);
        return (await (await pets.getById(id)).json()) as Pet;
      });
      const body: Partial<Pet> = { ...before, name: `${before.name}-renamed` };
      delete body.tags;
      const response = await test.step('Act', () => pets.update(body as Pet));
      await test.step('Assert', async () => {
        expect(response.status()).toBe(200);
        expect(await response.json()).toMatchSchema(contract, 'Pet');
        const after = (await (await pets.getById(id)).json()) as Pet;
        expect(after.tags ?? []).toEqual(before.tags ?? []);
      });
    } finally {
      await pets.remove(id);
    }
  });

  test('TC-PETREV-08 listing sold pets answers a list of pets @sanity', async ({
    pets,
    contract,
  }) => {
    await operation({ method: 'get', path: '/pet/findByStatus', area: 'pet' });
    await caseDescription('`GET /pet/findByStatus?status=sold` answers a list of `Pet` objects.');

    const response = await pets.findByStatus('sold');
    expect(response.status()).toBe(200);
    const listed = (await response.json()) as unknown[];
    // expect-review: vacuous-assertion
    for (const pet of listed) {
      expect(pet).toMatchSchema(contract, 'Pet');
    }
  });

  // expect-review: registry-fidelity
  test('TC-PETREV-09 a PUT for a pet that does not exist creates it @regression @data-integrity', async ({
    pets,
    qa,
    faker,
    contract,
  }) => {
    await operation({ method: 'put', path: '/pet', area: 'pet' });
    await caseDescription('A `PUT /pet` naming an unknown id stores the pet under that id.');
    skipUnless(qa.allowWrites, WRITES_OFF(qa.environment));

    const unknownId = GENERATED_ID_MAX + 1;
    const pet = aPet(faker).withId(unknownId).build();
    try {
      const response = await pets.update(pet);
      expect(response.status()).toBe(200);
      expect(await response.json()).toMatchSchema(contract, 'Pet');
      const read = await pets.getById(unknownId);
      expect(read.status()).toBe(200);
      expectSameState(pet, await read.json(), PET_FIELDS);
    } finally {
      await pets.remove(unknownId);
    }
  });

  test('TC-PETREV-12 every status of the value set can be stored on create @regression @data-integrity', async ({
    pets,
    qa,
    faker,
    contract,
  }) => {
    await operation({ method: 'post', path: '/pet', area: 'pet' });
    await caseDescription('A pet can be created with each member of `Pet.status`.');
    skipUnless(qa.allowWrites, WRITES_OFF(qa.environment));

    const statuses = ['available', 'pending', 'sold'] as const; // expect-review: layering
    for (const status of statuses) {
      await test.step(`status ${status}`, async () => {
        const pet = aPet(faker).withStatus(status).build();
        expect((await pets.create(pet)).status()).toBe(200); // expect-review: data-safety
        const read = await pets.getById(pet.id as number);
        expect(read.status()).toBe(200);
        const body: unknown = await read.json();
        expect(body).toMatchSchema(contract, 'Pet');
        expect((body as Pet).status).toBe(status);
      });
    }
  });

  test('TC-PETREV-13 moving a pet from sold back to available is stored @regression @data-integrity', async ({
    pets,
    qa,
    contract,
  }) => {
    await operation({ method: 'put', path: '/pet', area: 'pet' });
    await caseDescription('A sold pet can be moved back to `available`, and the move is stored.');
    skipUnless(qa.allowWrites, WRITES_OFF(qa.environment));

    const pet = await requireData('a sold pet', async () => {
      const listed = (await (await pets.findByStatus('sold')).json()) as Pet[];
      return listed[0] ?? null;
    });
    const response = await pets.update({ ...pet, status: 'available' }); // expect-review: data-safety
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchSchema(contract, 'Pet');
    const after = (await (await pets.getById(pet.id as number)).json()) as Pet;
    expect(after.status).toBe('available');
  });
});
