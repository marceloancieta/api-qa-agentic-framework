// Pets: full updates with PUT /pet (registry/pet-update.md, TC-PET-28 to TC-PET-40). Every case
// creates its own pet with an id from the builder's range, never a seed pet (PN-06 once corrupted
// one), and deletes it afterwards, confirmed by a read that answers 404. Every refused write reads
// the pet back and compares it with the state before the write.

import type { APIResponse } from '@playwright/test';
import { test, expect } from '../fixtures';
import { caseDescription, knownGap, operation } from '../../../helpers/case-meta';
import { skipUnless } from '../../../helpers/data-gate';
import { expectErrorEnvelope, type EnvelopeCatalog } from '../../../helpers/error-envelope';
import type { SchemaValidator } from '../../../helpers/schema';
import { expectOnlyChanged, expectSameState } from '../../../helpers/state-compare';
import { aPet, INT64_OVERFLOW, UNKNOWN_PET_ID } from '../builders/pet-builder';
import type { PetClient } from '../clients/pet-client';
import { removePet } from '../flows/cleanup';
import { PET_FIELDS } from '../state-models';
import { PET_STATUSES, type Pet, type PetStatus } from '../types';

const AREA = 'pet';
const PUT_PET = { method: 'PUT', path: '/pet', area: AREA } as const;

/** The case's own pet as stored: `200` and a body matching `Pet`. */
async function readPet(pets: PetClient, contract: SchemaValidator, id: number): Promise<unknown> {
  const read = await pets.getById(id);
  expect(read.status(), 'read-back of the own pet').toBe(200);
  const stored: unknown = await read.json();
  expect(stored).toMatchSchema(contract, 'Pet');
  return stored;
}

/**
 * One refused variant of a multi-variant case, checked softly so every variant gets a verdict: the
 * `input-error` envelope, then the pet read back equal to `before`, the state just before this
 * write. Returns the state read, which is the `before` of the next variant, so a variant the
 * service stored anyway fails on its own and does not make the variants after it fail too.
 */
async function expectRefusedUnchanged(
  label: string,
  refused: APIResponse,
  checks: { pets: PetClient; contract: SchemaValidator; envelopes: EnvelopeCatalog },
  id: number,
  before: unknown,
): Promise<unknown> {
  await expect
    .soft(expectErrorEnvelope(refused, checks.envelopes, 'input-error'), label)
    .resolves.toBeDefined();
  const read = await checks.pets.getById(id);
  expect.soft(read.status(), `${label}: read-back`).toBe(200);
  const after: unknown = await read.json();
  expect.soft(after, `${label}: read-back`).toMatchSchema(checks.contract, 'Pet');
  expect.soft(() => expectSameState(before, after, PET_FIELDS), `${label}: state`).not.toThrow();
  return after;
}

test.describe('Pets: PUT updates', () => {
  test('TC-PET-28 Updating a pet with PUT stores every changed field @smoke @data-integrity', async ({
    pets,
    qa,
    faker,
    contract,
  }) => {
    await operation({ ...PUT_PET, severity: 'critical' });
    await caseDescription(
      'A pet created by the case with every field is updated with `PUT /pet`: same `<PET_ID>`, a ' +
        'new `<NAME>`, `<OTHER_STATUS>`, category, `<TAG>` and two photo URLs. The answer is `200` ' +
        '`Pet` equal to the sent body, and `GET /pet/<PET_ID>` returns it field by field: every ' +
        'business field changed from the state before, and nothing else.',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const [name, newName] = faker.helpers.uniqueArray(() => faker.animal.petName(), 2);
    const pet = aPet(faker)
      .named(name as string)
      .withUniqueTag()
      .withStatus('pending')
      .build();
    const id = pet.id as number;
    try {
      expect((await pets.create(pet)).status()).toBe(200);
      const before = await readPet(pets, contract, id);
      expectSameState(pet, before, PET_FIELDS);

      const otherStatus = faker.helpers.arrayElement(PET_STATUSES.filter((s) => s !== pet.status));
      const update = aPet(faker)
        .withId(id)
        .named(newName as string)
        .withUniqueTag()
        .withPhotoUrls(2)
        .withStatus(otherStatus)
        .build();
      const updated = await pets.update(update);
      expect(updated.status()).toBe(200);
      const answer: unknown = await updated.json();
      expect(answer).toMatchSchema(contract, 'Pet');
      expectSameState(update, answer, PET_FIELDS);

      const stored = await readPet(pets, contract, id);
      expectSameState(update, stored, PET_FIELDS);
      expectOnlyChanged(before, stored, PET_FIELDS, [
        'name',
        'status',
        'category',
        'tags',
        'photoUrls',
      ]);
    } finally {
      expect(await removePet({ pets }, id)).toBe(404);
    }
  });

  test('TC-PET-29 Updating a pet that does not exist answers not-found and creates nothing @regression @data-integrity', async ({
    pets,
    qa,
    faker,
    envelopes,
  }) => {
    await operation(PUT_PET);
    await caseDescription(
      'A full pet body whose `id` is `<UNKNOWN_PET_ID>` (no case creates it) is sent with ' +
        '`PUT /pet`. The answer is `404` with the `not-found` envelope, and ' +
        '`GET /pet/<UNKNOWN_PET_ID>` still answers `404`: an update never creates a pet.',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const pet = aPet(faker).withId(UNKNOWN_PET_ID).withUniqueTag().build();
    expect((await pets.getById(UNKNOWN_PET_ID)).status(), 'no pet at the unknown id before').toBe(
      404,
    );
    try {
      await expectErrorEnvelope(await pets.update(pet), envelopes, 'not-found');

      await expectErrorEnvelope(await pets.getById(UNKNOWN_PET_ID), envelopes, 'not-found');
    } finally {
      // The id read 404 before the write, so a pet there now is one this case's update created.
      expect(await removePet({ pets }, UNKNOWN_PET_ID)).toBe(404);
    }
  });

  test('TC-PET-30 A PUT without a name is refused and the pet keeps its name @regression @contract-drift @data-integrity @known-gap probe:p-323bb34345', async ({
    pets,
    qa,
    faker,
    contract,
    envelopes,
  }) => {
    await operation(PUT_PET);
    await caseDescription(
      'A pet created by the case with a generated `<NAME>` is sent back with `PUT /pet` with ' +
        '`name` removed. The contract requires `name`, so the answer is `400` with the ' +
        '`input-error` envelope (the declared `422` has no catalogued kind and would fail for ' +
        'review), and `GET /pet/<PET_ID>` returns the pet as it was, name included. The service ' +
        'answers `200` and stores the pet without a name (PN-06, `LOCAL-8`).',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const builder = aPet(faker).withUniqueTag().withPhotoUrls(2).withStatus('sold');
    const pet = builder.build();
    const id = pet.id as number;
    try {
      expect((await pets.create(pet)).status()).toBe(200);
      const before = await readPet(pets, contract, id);
      expectSameState(pet, before, PET_FIELDS);

      test.fail(true, await knownGap('LOCAL-8', 'writes store pets the contract refuses'));
      const refused = await pets.updateRaw(JSON.stringify(builder.toBodyWith({ name: undefined })));
      // The catalogue has no 422 kind (never produced, W-38): a 422 would fail here and be reviewed.
      await expectErrorEnvelope(refused, envelopes, 'input-error');

      const after = await readPet(pets, contract, id);
      expectSameState(before, after, PET_FIELDS);
      expect((after as Pet).name).toBe(pet.name);
    } finally {
      expect(await removePet({ pets }, id)).toBe(404);
    }
  });

  test('TC-PET-31 A PUT without photo URLs is refused and the pet keeps its photo URLs @regression @data-integrity @known-gap probe:p-7d0a43508e', async ({
    pets,
    qa,
    faker,
    contract,
    envelopes,
  }) => {
    await operation(PUT_PET);
    await caseDescription(
      'A pet created by the case with two photo URLs is sent back with `PUT /pet` with ' +
        '`photoUrls` removed. The contract requires `photoUrls`, so the answer is `400` with the ' +
        '`input-error` envelope (the declared `422` has no catalogued kind and would fail for ' +
        'review), and `GET /pet/<PET_ID>` returns the pet as it was, both photo URLs ' +
        'included.',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const builder = aPet(faker).withUniqueTag().withPhotoUrls(2).withStatus('pending');
    const pet = builder.build();
    const id = pet.id as number;
    try {
      expect((await pets.create(pet)).status()).toBe(200);
      const before = await readPet(pets, contract, id);
      expectSameState(pet, before, PET_FIELDS);

      test.fail(true, await knownGap('LOCAL-8', 'writes store pets the contract refuses'));
      const refused = await pets.updateRaw(
        JSON.stringify(builder.toBodyWith({ photoUrls: undefined })),
      );
      // The catalogue has no 422 kind (never produced, W-38): a 422 would fail here and be reviewed.
      await expectErrorEnvelope(refused, envelopes, 'input-error');

      const after = await readPet(pets, contract, id);
      expectSameState(before, after, PET_FIELDS);
      expect((after as Pet).photoUrls).toEqual(pet.photoUrls);
    } finally {
      expect(await removePet({ pets }, id)).toBe(404);
    }
  });

  test('TC-PET-32 A PUT with a status outside the value set is refused and the pet keeps its status @regression @contract-drift @data-integrity @known-gap probe:p-8a03833f58', async ({
    pets,
    qa,
    faker,
    contract,
    envelopes,
  }) => {
    await operation(PUT_PET);
    await caseDescription(
      'A pet created by the case with `<STATUS>` (not the builder default) is sent back with ' +
        '`PUT /pet` and `status: <OUT_OF_SET_STATUS>`, a member of `Pet.status` with a suffix. The ' +
        'answer is `400` with the `input-error` envelope (the declared `422` has no catalogued ' +
        'kind and would fail for review), and `GET /pet/<PET_ID>` still has `<STATUS>` and ' +
        'every other field as before. The service answers `200` and stores the value (PN-06, `LOCAL-8`).',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const builder = aPet(faker).withUniqueTag().withPhotoUrls(2).withStatus('pending');
    const pet = builder.build();
    const id = pet.id as number;
    const outOfSet = `${pet.status}-unlisted`;
    try {
      expect((await pets.create(pet)).status()).toBe(200);
      const before = await readPet(pets, contract, id);
      expectSameState(pet, before, PET_FIELDS);

      test.fail(true, await knownGap('LOCAL-8', 'writes store pets the contract refuses'));
      const refused = await pets.updateRaw(
        JSON.stringify(builder.toBodyWith({ status: outOfSet })),
      );
      // The catalogue has no 422 kind (never produced, W-38): a 422 would fail here and be reviewed.
      await expectErrorEnvelope(refused, envelopes, 'input-error');

      const after = await readPet(pets, contract, id);
      expectSameState(before, after, PET_FIELDS);
      expect((after as Pet).status).toBe(pet.status);
    } finally {
      expect(await removePet({ pets }, id)).toBe(404);
    }
  });

  test('TC-PET-33 A PUT whose top-level fields have the wrong type or are null is refused and changes nothing @regression @data-integrity @known-gap probe:p-ae21138f84 probe:p-720ff94cba probe:p-28bbfce11f probe:p-cb6afa2d11 probe:p-19476b1e03 probe:p-10175847e7 probe:p-ad34189970 probe:p-3b6b3472ea probe:p-b9a81a65ab probe:p-a0922cbf74 probe:p-4b4c9950d2', async ({
    pets,
    qa,
    faker,
    contract,
    envelopes,
  }) => {
    await operation(PUT_PET);
    await caseDescription(
      'A pet created by the case with every field is sent back with `PUT /pet` once per variant, ' +
        'each changing one top-level field of the stored body: `name` as a number and `null`, ' +
        '`photoUrls` as a string and `null`, a `photoUrls` item as a number and `null`, `status` ' +
        'as a number and `null`, and `id` as a non-numeric string, as the numeric string of ' +
        '`<PET_ID>`, `null` and a fraction (the rest of the body ' +
        'still describes `<PET_ID>`). Every variant that does not change `name` carries a new ' +
        '`<NAME>`, so one the service applied anyway shows in the state. Each answers `400` with ' +
        'the `input-error` envelope, and after each `GET /pet/<PET_ID>` returns the pet as it was ' +
        'before that write. The non-numeric `id` is refused as designed and runs first, outside ' +
        'the known gaps: the `id null` step answers `500` (PN-01, `LOCAL-9`); the other variants ' +
        'are stored or coerced (`LOCAL-8`).',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const [name, newName] = faker.helpers.uniqueArray(() => faker.animal.petName(), 2);
    const builder = aPet(faker)
      .named(name as string)
      .withUniqueTag()
      .withPhotoUrls(2)
      .withStatus('sold');
    const pet = builder.build();
    const id = pet.id as number;
    // From here every variant body carries the new name, unless the variant itself changes `name`.
    builder.named(newName as string);
    const variants: [label: string, changes: Record<string, unknown>][] = [
      ['name as a number', { name: faker.number.int({ min: 1, max: 999 }) }],
      ['name null', { name: null }],
      ['photoUrls as a string', { photoUrls: faker.image.url() }],
      ['photoUrls null', { photoUrls: null }],
      ['photoUrls item as a number', { 'photoUrls.0': faker.number.int({ min: 1, max: 999 }) }],
      ['photoUrls item null', { 'photoUrls.0': null }],
      ['status as a number', { status: faker.number.int({ min: 1, max: 999 }) }],
      ['status null', { status: null }],
      ['id as a numeric string', { id: String(id) }],
      ['id null', { id: null }],
      ['id as a fraction', { id: id + 0.5 }],
    ];
    const checks = { pets, contract, envelopes };
    try {
      expect((await pets.create(pet)).status()).toBe(200);
      expectSameState(pet, await readPet(pets, contract, id), PET_FIELDS);

      // Refused as designed (measured): checked before the arms with hard assertions, so a change
      // here reports red instead of passing as part of a known gap (L-13).
      await test.step('id as a non-numeric string', async () => {
        const body = JSON.stringify(builder.toBodyWith({ id: faker.string.alpha(6) }));
        await expectErrorEnvelope(await pets.updateRaw(body), envelopes, 'input-error');
        expectSameState(pet, await readPet(pets, contract, id), PET_FIELDS);
      });

      let before = await readPet(pets, contract, id);
      // One key per case (bug reporting, section 6): the `id null` step is LOCAL-9, named in the
      // description, while the case cites LOCAL-8, which keeps most of its variants red.
      test.fail(true, await knownGap('LOCAL-8', 'writes store pets the contract refuses'));
      for (const [label, changes] of variants) {
        await test.step(label, async () => {
          const refused = await pets.updateRaw(JSON.stringify(builder.toBodyWith(changes)));
          before = await expectRefusedUnchanged(label, refused, checks, id, before);
        });
      }
    } finally {
      expect(await removePet({ pets }, id)).toBe(404);
    }
  });

  test('TC-PET-34 A PUT whose category or tags have the wrong type, are null or overflow is refused @regression @data-integrity @known-gap probe:p-28e22c31fe probe:p-c640aef54c probe:p-2f02a37986 probe:p-c907a385c5 probe:p-181dac9e94 probe:p-f859cea034 probe:p-8a6aa183e8 probe:p-9bfd76abaa probe:p-dda2575aac probe:p-c797e626d2 probe:p-55550a8dfe probe:p-000f410ac9 probe:p-e86c3a529b probe:p-fbcb198226 probe:p-3b31e62766 probe:p-464553e03f probe:p-01da4a352e probe:p-95327af7d4 probe:p-164b0e23c6 probe:p-9148951dad', async ({
    pets,
    qa,
    faker,
    contract,
    envelopes,
  }) => {
    await operation(PUT_PET);
    await caseDescription(
      'A pet created by the case with a category and `<TAG>` is sent back with `PUT /pet` once per ' +
        'nested variant of TC-PET-07: `category` and `tags` as a wrong type and `null`; ' +
        '`category.id` and `tags[].id` as a string, `null`, a fraction and `<INT64_OVERFLOW>`; ' +
        '`category.name` and `tags[].name` as a number and `null`; a `tags` item as a string and ' +
        '`null`. Each answers `400` with the `input-error` envelope and leaves the pet as it was. ' +
        'An unknown property inside `category` and inside a `tags` item answers `200` and appears ' +
        'in neither the answer nor the read-back. The overflow and unknown-property steps run first ' +
        'and must pass; the other variants are the known gap `LOCAL-8`.',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const builder = aPet(faker).withUniqueTag().withPhotoUrls(2).withStatus('pending');
    const pet = builder.build();
    const id = pet.id as number;
    const bodyWith = (changes: Record<string, unknown>) =>
      JSON.stringify(builder.toBodyWith(changes));
    // Written as digits: no JavaScript number holds one above the int64 maximum.
    const overflowVariants: [label: string, body: string][] = [
      ['category.id overflow', builder.toJson({ 'category.id': INT64_OVERFLOW })],
      ['tags[].id overflow', builder.toJson({ 'tags.0.id': INT64_OVERFLOW })],
    ];
    // The variants LOCAL-8 covers: a wrong type or null that the service stores or coerces.
    const refusedVariants: [label: string, body: string][] = [
      ['category as a string', bodyWith({ category: faker.word.noun() })],
      ['category null', bodyWith({ category: null })],
      ['tags as a string', bodyWith({ tags: faker.word.noun() })],
      ['tags null', bodyWith({ tags: null })],
      ['category.id as a string', bodyWith({ 'category.id': faker.string.alpha(6) })],
      ['category.id null', bodyWith({ 'category.id': null })],
      ['category.id as a fraction', bodyWith({ 'category.id': faker.number.int(999) + 0.5 })],
      ['tags[].id as a string', bodyWith({ 'tags.0.id': faker.string.alpha(6) })],
      ['tags[].id null', bodyWith({ 'tags.0.id': null })],
      ['tags[].id as a fraction', bodyWith({ 'tags.0.id': faker.number.int(999) + 0.5 })],
      ['category.name as a number', bodyWith({ 'category.name': faker.number.int(999) })],
      ['category.name null', bodyWith({ 'category.name': null })],
      ['tags[].name as a number', bodyWith({ 'tags.0.name': faker.number.int(999) })],
      ['tags[].name null', bodyWith({ 'tags.0.name': null })],
      ['tags item as a string', bodyWith({ 'tags.0': faker.word.noun() })],
      ['tags item null', bodyWith({ 'tags.0': null })],
    ];
    const unknownKey = `qa${faker.string.alpha({ length: 8, casing: 'lower' })}`;
    const ignoredVariants: [label: string, path: string][] = [
      ['unknown property in category', `category.${unknownKey}`],
      ['unknown property in a tags item', `tags.0.${unknownKey}`],
    ];
    const checks = { pets, contract, envelopes };
    try {
      expect((await pets.create(pet)).status()).toBe(200);
      expectSameState(pet, await readPet(pets, contract, id), PET_FIELDS);

      // Steps LOCAL-8 does not explain run first, with hard assertions.
      for (const [label, body] of overflowVariants) {
        await test.step(label, async () => {
          await expectErrorEnvelope(await pets.updateRaw(body), envelopes, 'input-error');
          expectSameState(pet, await readPet(pets, contract, id), PET_FIELDS);
        });
      }
      for (const [label, path] of ignoredVariants) {
        await test.step(label, async () => {
          const body = builder.toBodyWith({ [path]: faker.word.noun() });
          const answered = await pets.updateRaw(JSON.stringify(body));
          expect(answered.status(), label).toBe(200);
          const answer: unknown = await answered.json();
          expect(answer, label).toMatchSchema(contract, 'Pet');
          // The model classifies `category` and `tags` as whole values, so an extra nested key in
          // either is a business difference from the declared pet.
          expectSameState(pet, answer, PET_FIELDS);
          expectSameState(pet, await readPet(pets, contract, id), PET_FIELDS);
        });
      }

      let before = await readPet(pets, contract, id);
      test.fail(true, await knownGap('LOCAL-8', 'writes store pets the contract refuses'));
      for (const [label, body] of refusedVariants) {
        await test.step(label, async () => {
          const refused = await pets.updateRaw(body);
          before = await expectRefusedUnchanged(label, refused, checks, id, before);
        });
      }
    } finally {
      expect(await removePet({ pets }, id)).toBe(404);
    }
  });

  test('TC-PET-35 A PUT with an unknown property stores and returns only declared fields @regression @security @data-integrity probe:p-d348e58e9e', async ({
    pets,
    qa,
    faker,
    contract,
  }) => {
    await operation(PUT_PET);
    await caseDescription(
      'A pet created by the case is sent back with `PUT /pet` with a new `<NAME>` and a property ' +
        'the `Pet` schema does not declare. The answer is `200` `Pet`; the new name is stored, the ' +
        'property is in neither the answer nor `GET /pet/<PET_ID>`, and the answer carries no ' +
        'field the schema does not declare.',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const [name, newName] = faker.helpers.uniqueArray(() => faker.animal.petName(), 2);
    const builder = aPet(faker)
      .named(name as string)
      .withUniqueTag()
      .withPhotoUrls(2)
      .withStatus('sold');
    const pet = builder.build();
    const id = pet.id as number;
    const unknownKey = `qa${faker.string.alpha({ length: 8, casing: 'lower' })}`;
    try {
      expect((await pets.create(pet)).status()).toBe(200);
      const before = await readPet(pets, contract, id);
      expectSameState(pet, before, PET_FIELDS);

      builder.named(newName as string);
      const declared = builder.build();
      const body = builder.toBodyWith({ [unknownKey]: faker.word.noun() });
      const answered = await pets.updateRaw(JSON.stringify(body));
      expect(answered.status()).toBe(200);
      const answer: unknown = await answered.json();
      expect(answer).toMatchSchema(contract, 'Pet');
      expect(answer).not.toHaveProperty(unknownKey);
      // A field the model does not classify (anything undeclared) is reported as a difference.
      expectSameState(declared, answer, PET_FIELDS);

      const stored = await readPet(pets, contract, id);
      expect(stored).not.toHaveProperty(unknownKey);
      expectSameState(declared, stored, PET_FIELDS);
      expectOnlyChanged(before, stored, PET_FIELDS, ['name']);
    } finally {
      expect(await removePet({ pets }, id)).toBe(404);
    }
  });

  test('TC-PET-36 A PUT with an id one above the int64 maximum is refused @regression probe:p-65653eabfd', async ({
    pets,
    qa,
    faker,
    envelopes,
  }) => {
    await operation(PUT_PET);
    await caseDescription(
      'A full pet body whose `id` is `<INT64_OVERFLOW>` (one above the largest int64, written as ' +
        'digits) is sent with `PUT /pet`. The answer is `400` with the `input-error` envelope. The ' +
        'id cannot be read back, so the case checks the answer only.',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const overflowing = aPet(faker).toJson({ id: INT64_OVERFLOW });
    await expectErrorEnvelope(await pets.updateRaw(overflowing), envelopes, 'input-error');
  });

  test('TC-PET-37 Malformed, truncated, empty, null and array PUT bodies are refused and the pet is unchanged @regression @data-integrity probe:p-de35dce237 probe:p-48cbfafe4b probe:p-bcbf9ca278 probe:p-82f205e479 probe:p-9cffc5f3c0', async ({
    pets,
    qa,
    faker,
    contract,
    envelopes,
  }) => {
    await operation(PUT_PET);
    await caseDescription(
      'A pet created by the case receives `PUT /pet` with a JSON content type once per body that ' +
        'cannot be read as a `Pet`: malformed JSON, truncated JSON naming `<PET_ID>`, an empty ' +
        'body, the JSON `null` and an array holding the pet. The variants built from a pet body ' +
        '(malformed, truncated, array) carry a new `<NAME>`, so one the service applied anyway ' +
        'shows in the state. Each answers `400` with the ' +
        '`input-error` envelope, and after each `GET /pet/<PET_ID>` returns the pet as it was.',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const [name, newName] = faker.helpers.uniqueArray(() => faker.animal.petName(), 2);
    const builder = aPet(faker)
      .named(name as string)
      .withUniqueTag()
      .withPhotoUrls(2)
      .withStatus('pending');
    const pet = builder.build();
    const id = pet.id as number;
    const changed = JSON.stringify(builder.named(newName as string).build());
    const variants: [label: string, body: string][] = [
      ['malformed JSON', `{${changed}`],
      ['truncated JSON', changed.slice(0, -2)],
      ['empty body', ''],
      ['JSON null', JSON.stringify(null)],
      ['array holding the pet', `[${changed}]`],
    ];
    const checks = { pets, contract, envelopes };
    try {
      expect((await pets.create(pet)).status()).toBe(200);
      let before = await readPet(pets, contract, id);
      expectSameState(pet, before, PET_FIELDS);

      for (const [label, body] of variants) {
        await test.step(label, async () => {
          const refused = await pets.updateRaw(body);
          before = await expectRefusedUnchanged(label, refused, checks, id, before);
        });
      }
    } finally {
      expect(await removePet({ pets }, id)).toBe(404);
    }
  });

  test('TC-PET-38 A PUT body with an unsupported content type is refused and the pet is unchanged @regression @contract-drift @data-integrity probe:p-05491bfcec', async ({
    pets,
    qa,
    faker,
    contract,
  }) => {
    await operation(PUT_PET);
    await caseDescription(
      'A pet created by the case receives `PUT /pet` with a valid JSON body carrying a new ' +
        '`<NAME>`, labelled `Content-Type: text/plain`. The answer is a `4xx` refusal, `415` in ' +
        'practice, a code the contract does not declare (PN-08): the case records that drift. ' +
        '`GET /pet/<PET_ID>` returns the pet as it was.',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const [name, newName] = faker.helpers.uniqueArray(() => faker.animal.petName(), 2);
    const builder = aPet(faker)
      .named(name as string)
      .withUniqueTag()
      .withPhotoUrls(2)
      .withStatus('sold');
    const pet = builder.build();
    const id = pet.id as number;
    try {
      expect((await pets.create(pet)).status()).toBe(200);
      const before = await readPet(pets, contract, id);
      expectSameState(pet, before, PET_FIELDS);

      const changed = JSON.stringify(builder.named(newName as string).build());
      const refused = await pets.updateRaw(changed, 'text/plain');
      expect(refused.status()).toBe(415);

      const after = await readPet(pets, contract, id);
      expectSameState(before, after, PET_FIELDS);
    } finally {
      expect(await removePet({ pets }, id)).toBe(404);
    }
  });

  test('TC-PET-39 A PUT with an empty object is refused as an input error, not a server error @regression @contract-drift @known-gap', async ({
    pets,
    qa,
    envelopes,
  }) => {
    await operation(PUT_PET);
    await caseDescription(
      '`PUT /pet` with the body `{}`: no `id` names a pet, and the required `name` and `photoUrls` ' +
        'are missing. The answer is `400` with the `input-error` envelope, never a `5xx`. The ' +
        'service answers `500` `server-error` (PN-01, `LOCAL-9`). The answer is the only check: the body ' +
        'names no pet to read back.',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    test.fail(true, await knownGap('LOCAL-9', 'a pet body without an id answers 500'));
    const refused = await pets.updateRaw(JSON.stringify({}));
    expect(refused.status(), 'never a server error').toBeLessThan(500);
    await expectErrorEnvelope(refused, envelopes, 'input-error');
  });

  test('TC-PET-40 Every status move is stored, and repeating an update changes nothing more @regression @data-integrity', async ({
    pets,
    qa,
    faker,
    contract,
  }) => {
    await operation(PUT_PET);
    await caseDescription(
      'A pet created by the case with `available` is moved with `PUT /pet` through every ordered ' +
        'pair of `Pet.status` members, in the order of the intake measurement: pending, sold, ' +
        'available, sold, pending, available (`sold` back to `available` included). Each move ' +
        'answers `200` `Pet` with the new status and the read-back holds it. The last body is then ' +
        'sent again: same answer, same stored state.',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const builder = aPet(faker).withUniqueTag().withPhotoUrls(2).withStatus('available');
    const pet = builder.build();
    const id = pet.id as number;
    const moves: PetStatus[] = ['pending', 'sold', 'available', 'sold', 'pending', 'available'];
    // The walk must cover every ordered pair of the generated value set, whatever it holds.
    const walked = moves.map((to, i) => `${i === 0 ? pet.status : moves[i - 1]}->${to}`);
    const everyPair = PET_STATUSES.flatMap((from) =>
      PET_STATUSES.filter((to) => to !== from).map((to) => `${from}->${to}`),
    );
    expect([...walked].sort(), 'the moves cover every status pair').toEqual([...everyPair].sort());
    try {
      expect((await pets.create(pet)).status()).toBe(200);
      let current = await readPet(pets, contract, id);
      expectSameState(pet, current, PET_FIELDS);

      let last: { body: Pet; answer: unknown } | undefined;
      for (const [i, to] of moves.entries()) {
        const from = i === 0 ? pet.status : moves[i - 1];
        await test.step(`${from} -> ${to}`, async () => {
          const body = builder.withStatus(to).build();
          const moved = await pets.update(body);
          expect(moved.status()).toBe(200);
          const answer: unknown = await moved.json();
          expect(answer).toMatchSchema(contract, 'Pet');
          expectSameState(body, answer, PET_FIELDS);

          const stored = await readPet(pets, contract, id);
          expectOnlyChanged(current, stored, PET_FIELDS, ['status']);
          expect((stored as Pet).status).toBe(to);
          current = stored;
          last = { body, answer };
        });
      }

      await test.step('repeat the last update', async () => {
        const repeated = last as { body: Pet; answer: unknown };
        const again = await pets.update(repeated.body);
        expect(again.status()).toBe(200);
        const answer: unknown = await again.json();
        expect(answer).toMatchSchema(contract, 'Pet');
        expect(answer).toEqual(repeated.answer);

        const stored = await readPet(pets, contract, id);
        expectSameState(current, stored, PET_FIELDS);
      });
    } finally {
      expect(await removePet({ pets }, id)).toBe(404);
    }
  });
});
