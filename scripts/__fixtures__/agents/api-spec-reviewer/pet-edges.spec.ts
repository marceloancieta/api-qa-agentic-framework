// Pet edges: absent pets, deletes and the status filter of the listing.

import { test, expect } from '../../../../services/petstore/fixtures';
import {
  aPet,
  GENERATED_ID_MAX,
  GENERATED_ID_MIN,
} from '../../../../services/petstore/builders/pet-builder';
import { PetMother } from '../../../../services/petstore/builders/mother';
import { PET_STATUSES, type Pet } from '../../../../services/petstore/types';
import { caseDescription, operation } from '../../../../helpers/case-meta';
import { skipUnless } from '../../../../helpers/data-gate';
import { expectErrorEnvelope } from '../../../../helpers/error-envelope';

const WRITES_OFF = (environment: string) => `environment "${environment}" does not allow writes`;

test.describe('Pet edges', () => {
  test('TC-PETREV-06 reading a pet that does not exist answers not-found @regression', async ({
    pets,
    faker,
    envelopes,
  }) => {
    await operation({ method: 'get', path: '/pet/{petId}', area: 'pet' });
    await caseDescription('`GET /pet/{petId}` for an id no case creates answers `not-found`.');

    const id = faker.number.int({ min: GENERATED_ID_MIN, max: GENERATED_ID_MAX }); // expect-review: coincidental-pass
    const response = await pets.getById(id);
    await expectErrorEnvelope(response, envelopes, 'not-found');
  });

  test('TC-PETREV-07 listing pets by status returns only pets of that status @regression', async ({
    pets,
    qa,
    faker,
    contract,
  }) => {
    await operation({ method: 'get', path: '/pet/findByStatus', area: 'pet' });
    await caseDescription('The listing by status holds the case pet and only pets of that status.');
    skipUnless(qa.allowWrites, WRITES_OFF(qa.environment));

    const status = faker.helpers.arrayElement(PET_STATUSES);
    const pet = aPet(faker).withStatus(status).build();
    const id = pet.id as number;
    try {
      await test.step('Arrange', async () => {
        expect((await pets.create(pet)).status()).toBe(200);
      });
      const response = await test.step('Act', () => pets.findByStatus(status));
      await test.step('Assert', async () => {
        expect(response.status()).toBe(200);
        const listed = (await response.json()) as Pet[];
        // The case pet must be listed, so the loop below never runs over an empty list. Other
        // callers' pets are checked for the filter only: their shape is not this case's claim.
        expect(listed.map((item) => item.id)).toContain(id);
        const own = listed.find((item) => item.id === id);
        expect(own).toMatchSchema(contract, 'Pet');
        for (const item of listed) {
          expect(item.status).toBe(status);
        }
      });
    } finally {
      await pets.remove(id);
    }
  });

  // expect-review: registry-fidelity
  test('TC-PETREV-10 deleting a pet twice answers not-found the second time @regression', async ({
    pets,
    qa,
    faker,
    envelopes,
  }) => {
    await operation({ method: 'delete', path: '/pet/{petId}', area: 'pet' });
    await caseDescription('A second `DELETE /pet/{petId}` of the same pet answers `not-found`.');
    skipUnless(qa.allowWrites, WRITES_OFF(qa.environment));

    const pet = PetMother.available(faker);
    const id = pet.id as number;
    try {
      await test.step('Arrange', async () => {
        expect((await pets.create(pet)).status()).toBe(200);
        expect((await pets.remove(id)).status()).toBe(200);
      });
      const second = await test.step('Act', () => pets.remove(id));
      await test.step('Assert', async () => {
        await expectErrorEnvelope(second, envelopes, 'not-found');
      });
    } finally {
      await pets.remove(id);
    }
  });

  test('TC-PETREV-11 deleting a pet removes it @smoke @data-integrity', async ({
    pets,
    qa,
    faker,
    envelopes,
  }) => {
    await operation({ method: 'delete', path: '/pet/{petId}', area: 'pet', severity: 'critical' });
    await caseDescription('`DELETE /pet/{petId}` removes the pet: a read answers `not-found`.');
    skipUnless(qa.allowWrites, WRITES_OFF(qa.environment));

    const pet = PetMother.available(faker);
    const id = pet.id as number;
    try {
      await test.step('Arrange', async () => {
        expect((await pets.create(pet)).status()).toBe(200);
      });
      const response = await test.step('Act', () => pets.remove(id));
      const read = await test.step('Assert', () => pets.getById(id)); // expect-review: case-shape
      expect(response.status()).toBe(200);
      await expectErrorEnvelope(read, envelopes, 'not-found');
    } finally {
      await pets.remove(id);
    }
  });
});
