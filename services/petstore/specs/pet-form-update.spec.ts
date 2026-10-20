// The form update `POST /pet/{petId}` (registry/pet-update.md, TC-PET-41 to TC-PET-46). `name` and
// `status` are query parameters. Every case creates its own pet with an id from the builder's range,
// reads it back before and after the write, and deletes it afterwards, confirmed by a read that
// answers 404. The cases assert the contract; the departures of PN-21 and PN-23 are designed as
// defects (registry/pet.md), and the cases that meet them are armed known gaps: TC-PET-42 and
// TC-PET-43 until `LOCAL-10` ships, TC-PET-44 until `LOCAL-8` ships.

import type { Faker } from '@faker-js/faker';
import { test, expect } from '../fixtures';
import { caseDescription, knownGap, operation } from '../../../helpers/case-meta';
import { skipUnless } from '../../../helpers/data-gate';
import { expectErrorEnvelope } from '../../../helpers/error-envelope';
import type { SchemaValidator } from '../../../helpers/schema';
import { expectOnlyChanged, expectSameState } from '../../../helpers/state-compare';
import { aPet, malformedPetIds, UNKNOWN_PET_ID } from '../builders/pet-builder';
import type { PetClient } from '../clients/pet-client';
import { removePet } from '../flows/cleanup';
import { PET_FIELDS } from '../state-models';
import { PET_STATUSES, type Pet, type PetStatus } from '../types';

const AREA = 'pet';
const FORM_UPDATE = { method: 'POST', path: '/pet/{petId}', area: AREA } as const;

/**
 * Two members of `Pet.status` other than the builder's default: the first is stored at creation,
 * so a kept status proves something (L-20); the second is the `<OTHER_STATUS>` a case moves to.
 */
function nonDefaultStatuses(faker: Faker): [stored: PetStatus, other: PetStatus] {
  const builderDefault = aPet(faker).build().status;
  const [stored, other] = PET_STATUSES.filter((status) => status !== builderDefault);
  if (stored === undefined || other === undefined) {
    throw new Error('Pet.status needs two members besides the builder default.');
  }
  return [stored, other];
}

/** A builder-generated `<NAME>` other than `current`, so a stored change is visible. */
function anotherName(faker: Faker, current: string): string {
  let name = aPet(faker).build().name;
  while (name === current) name = aPet(faker).build().name;
  return name;
}

/** `GET /pet/<PET_ID>`: `200` and a body matching `Pet`, returned for a state comparison. */
async function readPet(
  pets: PetClient,
  contract: SchemaValidator,
  id: number,
  label: string,
): Promise<Pet> {
  const read = await pets.getById(id);
  expect(read.status(), label).toBe(200);
  const body: unknown = await read.json();
  expect(body, label).toMatchSchema(contract, 'Pet');
  return body as Pet;
}

test.describe('Pet form update', () => {
  test('TC-PET-41 A form update with name and status stores both and keeps the other fields @regression @data-integrity', async ({
    pets,
    qa,
    faker,
    contract,
  }) => {
    await operation(FORM_UPDATE);
    await caseDescription(
      'A pet `<PET_ID>` created with every field (category, a `<TAG>`, two photo URLs, a non-default ' +
        '`<STATUS>`) is updated with `POST /pet/<PET_ID>?name=<NAME>&status=<OTHER_STATUS>`. The ' +
        'answer is `200` with a `Pet` holding the new name and status; the read-back holds them ' +
        'too, and no other field changed (W-11).',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const [stored, other] = nonDefaultStatuses(faker);
    const pet = aPet(faker).withUniqueTag().withPhotoUrls(2).withStatus(stored).build();
    const id = pet.id as number;
    const name = anotherName(faker, pet.name);
    try {
      expect((await pets.create(pet)).status()).toBe(200);
      const before = await readPet(pets, contract, id, 'before the update');

      const answer = await pets.updateWithForm(id, { name, status: other });
      expect(answer.status()).toBe(200);
      const answered: unknown = await answer.json();
      expect(answered).toMatchSchema(contract, 'Pet');
      expect((answered as Pet).name).toBe(name);
      expect((answered as Pet).status).toBe(other);

      const after = await readPet(pets, contract, id, 'after the update');
      expect(after.name).toBe(name);
      expect(after.status).toBe(other);
      expectOnlyChanged(before, after, PET_FIELDS, ['name', 'status']);
      expectSameState(answered, after, PET_FIELDS);
    } finally {
      expect(await removePet({ pets }, id)).toBe(404);
    }
  });

  test('TC-PET-42 A form update with only a status changes the status and keeps the name @regression @contract-drift @data-integrity @known-gap', async ({
    pets,
    qa,
    faker,
    contract,
  }) => {
    await operation(FORM_UPDATE);
    await caseDescription(
      'A pet `<PET_ID>` created with a generated `<NAME>`, a non-default `<STATUS>` and every other ' +
        'field is updated with `POST /pet/<PET_ID>?status=<OTHER_STATUS>`, no `name`. The contract ' +
        'makes both parameters optional, so the answer is `200` with a `Pet`; only the status ' +
        'changes and the name is kept. Known gap `LOCAL-10` (PN-23): `400` plain text ' +
        '`No Name provided. Try again?` and nothing changes (W-06, W-07).',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const [stored, other] = nonDefaultStatuses(faker);
    const pet = aPet(faker).withUniqueTag().withPhotoUrls(2).withStatus(stored).build();
    const id = pet.id as number;
    try {
      expect((await pets.create(pet)).status()).toBe(200);
      const before = await readPet(pets, contract, id, 'before the update');

      test.fail(
        true,
        await knownGap(
          'LOCAL-10',
          'a form update without name is refused, and one without status removes the status',
        ),
      );
      const answer = await pets.updateWithForm(id, { status: other });
      expect(answer.status()).toBe(200);
      const answered: unknown = await answer.json();
      expect(answered).toMatchSchema(contract, 'Pet');
      expect((answered as Pet).status).toBe(other);

      const after = await readPet(pets, contract, id, 'after the update');
      expect(after.status).toBe(other);
      expect(after.name).toBe(pet.name);
      expectOnlyChanged(before, after, PET_FIELDS, ['status']);
      expectSameState(answered, after, PET_FIELDS);
    } finally {
      expect(await removePet({ pets }, id)).toBe(404);
    }
  });

  test('TC-PET-43 A form update with only a name keeps the status @regression @contract-drift @data-integrity @known-gap', async ({
    pets,
    qa,
    faker,
    contract,
  }) => {
    await operation(FORM_UPDATE);
    await caseDescription(
      'A pet `<PET_ID>` created with a `<STATUS>` other than the builder default and every other ' +
        'field is updated with `POST /pet/<PET_ID>?name=<NAME>`, no `status`. The answer is `200` ' +
        'with a `Pet`; only the name changes and the status is kept. Known gap `LOCAL-10` (PN-23): ' +
        'the status is removed (W-08).',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const [stored] = nonDefaultStatuses(faker);
    const pet = aPet(faker).withUniqueTag().withPhotoUrls(2).withStatus(stored).build();
    const id = pet.id as number;
    const name = anotherName(faker, pet.name);
    try {
      expect((await pets.create(pet)).status()).toBe(200);
      const before = await readPet(pets, contract, id, 'before the update');

      test.fail(
        true,
        await knownGap(
          'LOCAL-10',
          'a form update without name is refused, and one without status removes the status',
        ),
      );
      const answer = await pets.updateWithForm(id, { name });
      expect(answer.status()).toBe(200);
      const answered: unknown = await answer.json();
      expect(answered).toMatchSchema(contract, 'Pet');
      expect((answered as Pet).name).toBe(name);

      const after = await readPet(pets, contract, id, 'after the update');
      expect(after.name).toBe(name);
      expect(after.status).toBe(stored);
      expectOnlyChanged(before, after, PET_FIELDS, ['name']);
      expectSameState(answered, after, PET_FIELDS);
    } finally {
      expect(await removePet({ pets }, id)).toBe(404);
    }
  });

  test('TC-PET-44 A form update with a status outside the value set is refused and the status kept @regression @contract-drift @data-integrity @known-gap', async ({
    pets,
    qa,
    faker,
    contract,
    envelopes,
  }) => {
    await operation(FORM_UPDATE);
    await caseDescription(
      'A pet `<PET_ID>` created with `<STATUS>` is sent ' +
        '`POST /pet/<PET_ID>?name=<NAME>&status=<OUT_OF_SET_STATUS>` (a member with a suffix), then ' +
        'the same with the upper-case form of a member, one step each. Rule 2 limits a status to ' +
        '`Pet.status`, so each answers `400` with the `input-error` envelope and the read-back ' +
        'equals the state before the first write. Known gap `LOCAL-8` (PN-21): `200`, stored as ' +
        'sent (W-12).',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const [stored, other] = nonDefaultStatuses(faker);
    const pet = aPet(faker).withUniqueTag().withPhotoUrls(2).withStatus(stored).build();
    const id = pet.id as number;
    const name = anotherName(faker, pet.name);
    const outOfSet: [label: string, status: string][] = [
      ['a member with a suffix', `${other}-unknown`],
      ['the upper-case form of a member', other.toUpperCase()],
    ];
    try {
      expect((await pets.create(pet)).status()).toBe(200);
      const before = await readPet(pets, contract, id, 'before the updates');

      test.fail(true, await knownGap('LOCAL-8', 'writes store pets the contract refuses'));
      for (const [label, status] of outOfSet) {
        await test.step(`Assert: ${label} is refused and the pet is unchanged`, async () => {
          const answer = await pets.updateWithForm(id, { name, status });
          expect.soft(answer.status(), label).toBe(400);
          await expect
            .soft(expectErrorEnvelope(answer, envelopes, 'input-error'), label)
            .resolves.toBeDefined();

          const after = await readPet(pets, contract, id, `after ${label}`);
          expect.soft(() => expectSameState(before, after, PET_FIELDS), label).not.toThrow();
        });
      }
    } finally {
      expect(await removePet({ pets }, id)).toBe(404);
    }
  });

  test('TC-PET-45 A form update of a pet that does not exist answers not-found and creates nothing @regression @contract-drift @data-integrity', async ({
    pets,
    qa,
    faker,
    envelopes,
  }) => {
    await operation(FORM_UPDATE);
    await caseDescription(
      '`POST /pet/<UNKNOWN_PET_ID>?name=<NAME>&status=<STATUS>` for an id no case creates (one ' +
        "above the builder's range) answers `404` with the `not-found` envelope, as every pet " +
        'operation answers an absent pet, and `GET /pet/<UNKNOWN_PET_ID>` still answers `404`: ' +
        'nothing was created. Departure PN-23: the `404` is not declared for this operation ' +
        '(W-13, G13), a contract drift outside the scope of `LOCAL-10`.',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);
    await expectErrorEnvelope(await pets.getById(UNKNOWN_PET_ID), envelopes, 'not-found');

    const name = aPet(faker).build().name;
    const status = faker.helpers.arrayElement(PET_STATUSES);
    try {
      const answer = await pets.updateWithForm(UNKNOWN_PET_ID, { name, status });
      await expectErrorEnvelope(answer, envelopes, 'not-found');

      await expectErrorEnvelope(await pets.getById(UNKNOWN_PET_ID), envelopes, 'not-found');
    } finally {
      // The id read 404 right before the write, so any pet there now was created by this case.
      expect(await removePet({ pets }, UNKNOWN_PET_ID)).toBe(404);
    }
  });

  test('TC-PET-46 A malformed pet id on the form update is refused and changes nothing @regression @data-integrity probe:p-7c534ee450 probe:p-5bc326064d probe:p-083b5c1963 probe:p-df3d42b8ac', async ({
    pets,
    qa,
    faker,
    contract,
    envelopes,
  }) => {
    await operation(FORM_UPDATE);
    await caseDescription(
      'A pet `<PET_ID>` is created by the case. `POST /pet/{petId}?name=<NAME>&status=<STATUS>` is ' +
        'sent once per malformed id: non-numeric, `<INT64_OVERFLOW>`, a run of 300 digits and an ' +
        'encoded slash after `<PET_ID>` (`<PET_ID>%2F1`, so a lenient parse can only reach the ' +
        "case's own pet), one step each. Each answers `400` with the `input-error` envelope, and the " +
        "case's own pet reads back equal to its state before the first write (W-14).",
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const [stored, other] = nonDefaultStatuses(faker);
    const pet = aPet(faker).withUniqueTag().withPhotoUrls(2).withStatus(stored).build();
    const id = pet.id as number;
    const name = anotherName(faker, pet.name);
    try {
      expect((await pets.create(pet)).status()).toBe(200);
      const before = await readPet(pets, contract, id, 'before the updates');

      for (const [label, malformedId] of malformedPetIds(faker, id)) {
        await test.step(`Assert: a ${label} id is refused and the pet is unchanged`, async () => {
          const answer = await pets.updateWithForm(malformedId, { name, status: other });
          expect.soft(answer.status(), label).toBe(400);
          await expect
            .soft(expectErrorEnvelope(answer, envelopes, 'input-error'), label)
            .resolves.toBeDefined();

          const after = await readPet(pets, contract, id, `after the ${label} id`);
          expect.soft(() => expectSameState(before, after, PET_FIELDS), label).not.toThrow();
        });
      }
    } finally {
      expect(await removePet({ pets }, id)).toBe(404);
    }
  });
});
