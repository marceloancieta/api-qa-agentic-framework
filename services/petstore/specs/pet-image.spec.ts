// Pets: image uploads, and the anonymous/default parity of the update operations
// (registry/pet-update.md). Every case that writes creates its own pet with an id from the builder's
// range and deletes it afterwards, confirmed by a read that answers 404. No case uploads to a seed
// pet: an upload appends to `photoUrls` (PN-24).

import { test, expect } from '../fixtures';
import { caseDescription, knownGap, operation } from '../../../helpers/case-meta';
import { skipUnless } from '../../../helpers/data-gate';
import { expectErrorEnvelope } from '../../../helpers/error-envelope';
import { expectOnlyChanged, expectSameState } from '../../../helpers/state-compare';
import { aPet, imageBytes, malformedPetIds, UNKNOWN_PET_ID } from '../builders/pet-builder';
import { removePet } from '../flows/cleanup';
import { PET_FIELDS } from '../state-models';
import { PET_STATUSES, type Pet } from '../types';

const AREA = 'pet';
const UPLOAD = '/pet/{petId}/uploadImage';

// A server file-system path inside a string value of a response body: an absolute path under a
// directory a server keeps files in (`/tmp/`, `/var/`, `/home/` ...) that does not continue a URL (no
// host, scheme or path character right before its slash), a Windows drive path (`C:\` or `C:/`)
// that does not continue a word (so `https:/` never matches), or a `file:/` URL. It matches the
// path the service is known to append (`/tmp/inflector<digits>.tmp`, PN-24) and never a generated
// `https://` photo URL. Not global, so `test` keeps no state between values.
const SERVER_PATH =
  /(?<![\w.:/-])(?:\/(?:tmp|var|home|root|usr|opt|etc|srv|mnt|proc|private|Users)\/|[A-Za-z]:[\\/])|\bfile:\//i;

/** A `JSON.parse` reviver that keeps every string value it meets, at any depth, in `into`. */
const collectStrings =
  (into: string[]) =>
  (_key: string, value: unknown): unknown => {
    if (typeof value === 'string') into.push(value);
    return value;
  };

test.describe('Pet images', () => {
  test("TC-PET-47 Uploading an image answers an ApiResponse and keeps the pet's other fields @regression @contract-drift @data-integrity @known-gap", async ({
    pets,
    qa,
    faker,
    contract,
  }) => {
    await operation({ method: 'POST', path: UPLOAD, area: AREA, severity: 'critical' });
    await caseDescription(
      'A pet the case created with two photo URLs, a non-default status, a category and a unique ' +
        'tag gets `<IMAGE_BYTES>` with `POST /pet/<PET_ID>/uploadImage` as ' +
        '`application/octet-stream`. The answer is `200` with a body that matches `ApiResponse` and ' +
        'carries no field of a `Pet` (every `ApiResponse` property is optional, so a `Pet` body ' +
        'would match the schema alone). `GET /pet/<PET_ID>` then shows only `photoUrls` changed, ' +
        'and every photo URL stored before the upload is still there. The service answers a `Pet` ' +
        '(PN-24), so the case is armed as a known gap until `LOCAL-11` ships.',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const pet = aPet(faker).withPhotoUrls(2).withStatus('pending').withUniqueTag().build();
    const id = pet.id as number;
    try {
      expect((await pets.create(pet)).status()).toBe(200);
      const read = await pets.getById(id);
      expect(read.status()).toBe(200);
      const before = (await read.json()) as Pet;
      expect(before).toMatchSchema(contract, 'Pet');

      test.fail(true, await knownGap('LOCAL-11', 'an upload answers a Pet, not an ApiResponse'));
      const uploaded = await pets.uploadImage(id, imageBytes(faker));
      expect(uploaded.status()).toBe(200);
      const answer = (await uploaded.json()) as Record<string, unknown>;
      expect(answer).toMatchSchema(contract, 'ApiResponse');
      expect(
        Object.keys(answer).filter((key) => Object.hasOwn(PET_FIELDS, key)),
        'fields of a Pet in the upload answer',
      ).toEqual([]);

      const reread = await pets.getById(id);
      expect(reread.status()).toBe(200);
      const after = (await reread.json()) as Pet;
      expect(after).toMatchSchema(contract, 'Pet');
      expectOnlyChanged(before, after, PET_FIELDS, ['photoUrls']);
      expect(after.photoUrls).toEqual(expect.arrayContaining(before.photoUrls));
    } finally {
      expect(await removePet({ pets }, id)).toBe(404);
    }
  });

  test('TC-PET-48 An upload without a file is refused and the pet is unchanged @regression @data-integrity', async ({
    pets,
    qa,
    faker,
    contract,
  }) => {
    await operation({ method: 'POST', path: UPLOAD, area: AREA, severity: 'critical' });
    await caseDescription(
      '`POST /pet/<PET_ID>/uploadImage` with `Content-Type: application/octet-stream` and no body, ' +
        'for a pet the case created. The answer is the declared `400` ("No file uploaded"); its body ' +
        'is plain text outside the envelope catalogue (open question A8), so the case asserts the ' +
        'status, and `GET /pet/<PET_ID>` shows the pet in the same state as before the request.',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const pet = aPet(faker).build();
    const id = pet.id as number;
    try {
      expect((await pets.create(pet)).status()).toBe(200);
      const read = await pets.getById(id);
      expect(read.status()).toBe(200);
      const before: unknown = await read.json();
      expect(before).toMatchSchema(contract, 'Pet');

      expect((await pets.uploadImage(id, undefined)).status()).toBe(400);

      const reread = await pets.getById(id);
      expect(reread.status()).toBe(200);
      const after: unknown = await reread.json();
      expect(after).toMatchSchema(contract, 'Pet');
      expectSameState(before, after, PET_FIELDS);
    } finally {
      expect(await removePet({ pets }, id)).toBe(404);
    }
  });

  test('TC-PET-49 An upload to a pet that does not exist answers not-found and creates nothing @regression @data-integrity', async ({
    pets,
    qa,
    faker,
    envelopes,
  }) => {
    await operation({ method: 'POST', path: UPLOAD, area: AREA });
    await caseDescription(
      '`GET /pet/<UNKNOWN_PET_ID>` answers `404` before the case starts (an id one above the ' +
        "builder's range, which no case creates). `POST /pet/<UNKNOWN_PET_ID>/uploadImage` with " +
        '`<IMAGE_BYTES>` answers `404` with the plain-text body `Pet not found`; the case asserts ' +
        'status and text, because this operation labels that text `application/json` and it fits ' +
        'no envelope of the catalogue (PN-02). `GET /pet/<UNKNOWN_PET_ID>` then still answers ' +
        '`404` with the `not-found` envelope: the upload created no pet. That read runs even when ' +
        'the upload assertions fail, and if it finds a pet the case deletes it (the id read `404` ' +
        'right before the write, so only the upload can have created it) and confirms the delete ' +
        'with a `404` read.',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);
    await expectErrorEnvelope(await pets.getById(UNKNOWN_PET_ID), envelopes, 'not-found');

    try {
      const refused = await pets.uploadImage(UNKNOWN_PET_ID, imageBytes(faker));
      // Soft, so the read-back below runs and reports even when the refusal differs.
      expect.soft(refused.status()).toBe(404);
      expect.soft((await refused.text()).trim()).toBe('Pet not found');

      await expectErrorEnvelope(await pets.getById(UNKNOWN_PET_ID), envelopes, 'not-found');
    } finally {
      const readStatus = (await pets.getById(UNKNOWN_PET_ID)).status();
      const finalStatus =
        readStatus === 404 ? readStatus : await removePet({ pets }, UNKNOWN_PET_ID);
      expect(finalStatus, 'nothing left at <UNKNOWN_PET_ID>').toBe(404);
    }
  });

  test('TC-PET-50 A malformed pet id on upload is refused @regression probe:p-a53634fbc0 probe:p-5efbcedd89 probe:p-a128774bdd probe:p-e8a7fbc61f', async ({
    pets,
    qa,
    faker,
    envelopes,
  }) => {
    await operation({ method: 'POST', path: UPLOAD, area: AREA });
    await caseDescription(
      '`POST /pet/{petId}/uploadImage` with `<IMAGE_BYTES>` is sent once per malformed `petId`: a ' +
        'non-numeric id, `<INT64_OVERFLOW>`, a run of 300 digits and an id holding an encoded ' +
        'slash. Each answers `400` with the `input-error` envelope.',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const bytes = imageBytes(faker);
    for (const [label, id] of malformedPetIds(faker)) {
      await test.step(`Assert: ${label}`, async () => {
        await expectErrorEnvelope(await pets.uploadImage(id, bytes), envelopes, 'input-error');
      });
    }
  });

  test('TC-PET-51 An upload with an unsupported content type is refused and the pet is unchanged @regression @contract-drift @data-integrity probe:p-496685b029', async ({
    pets,
    qa,
    faker,
    contract,
  }) => {
    await operation({ method: 'POST', path: UPLOAD, area: AREA });
    await caseDescription(
      '`<IMAGE_BYTES>` are sent with `POST /pet/<PET_ID>/uploadImage` labelled ' +
        '`Content-Type: text/plain`, for a pet the case created. The answer is `415`, a code the ' +
        'contract does not declare (PN-08): the case records that drift, so a change to any other ' +
        'refusal shows up. `GET /pet/<PET_ID>` shows the pet in the same state as before.',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const pet = aPet(faker).build();
    const id = pet.id as number;
    try {
      expect((await pets.create(pet)).status()).toBe(200);
      const read = await pets.getById(id);
      expect(read.status()).toBe(200);
      const before: unknown = await read.json();
      expect(before).toMatchSchema(contract, 'Pet');

      expect((await pets.uploadImage(id, imageBytes(faker), 'text/plain')).status()).toBe(415);

      const reread = await pets.getById(id);
      expect(reread.status()).toBe(200);
      const after: unknown = await reread.json();
      expect(after).toMatchSchema(contract, 'Pet');
      expectSameState(before, after, PET_FIELDS);
    } finally {
      expect(await removePet({ pets }, id)).toBe(404);
    }
  });

  test('TC-PET-52 An upload exposes no server file path @regression @security @data-integrity @known-gap', async ({
    pets,
    qa,
    faker,
    contract,
  }) => {
    await operation({ method: 'POST', path: UPLOAD, area: AREA });
    await caseDescription(
      '`<IMAGE_BYTES>` are uploaded with `POST /pet/<PET_ID>/uploadImage` to a pet the case ' +
        'created, then the pet is read with `GET /pet/<PET_ID>`. Both answer `200`, and no string ' +
        'value of either parsed body, at any depth, contains a server file-system path: an ' +
        'absolute path under `/tmp/`, `/var/`, `/home/`, `/root/`, `/usr/`, `/opt/`, `/etc/`, ' +
        '`/srv/`, `/mnt/`, `/proc/`, `/private/` or `/Users/` that does not continue a URL, a ' +
        'Windows drive path (`C:\\` or `C:/`), or a `file:/` URL. The service appends ' +
        '`/tmp/inflector<digits>.tmp` to `photoUrls` (PN-24), so the case is armed as a known gap ' +
        'until `LOCAL-11` ships.',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const pet = aPet(faker).build();
    const id = pet.id as number;
    try {
      expect((await pets.create(pet)).status()).toBe(200);

      test.fail(
        true,
        await knownGap('LOCAL-11', 'an upload adds a server temporary-file path to photoUrls'),
      );
      const uploaded = await pets.uploadImage(id, imageBytes(faker));
      expect(uploaded.status()).toBe(200);
      const answerStrings: string[] = [];
      const answer: unknown = JSON.parse(await uploaded.text(), collectStrings(answerStrings));
      expect(answer).toMatchSchema(contract, 'ApiResponse');

      const read = await pets.getById(id);
      expect(read.status()).toBe(200);
      const storedStrings: string[] = [];
      const stored = JSON.parse(await read.text(), collectStrings(storedStrings)) as Pet;
      expect(stored).toMatchSchema(contract, 'Pet');
      expect(stored.id).toBe(id);

      expect(
        answerStrings.filter((value) => SERVER_PATH.test(value)),
        'server paths in the upload answer',
      ).toEqual([]);
      expect(
        storedStrings.filter((value) => SERVER_PATH.test(value)),
        'server paths in the read-back',
      ).toEqual([]);
    } finally {
      expect(await removePet({ pets }, id)).toBe(404);
    }
  });

  test('TC-PET-53 An anonymous caller updates, form-updates and uploads to its own pet like the default caller @regression @security @data-integrity', async ({
    actor,
    qa,
    faker,
    contract,
  }) => {
    await operation({ method: 'PUT', path: '/pet', area: AREA });
    await caseDescription(
      'The `anonymous` and the `default` actor each create a pet of their own, then send ' +
        '`PUT /pet` with a new `<NAME>` and status, `POST /pet/<PET_ID>?name=<NAME>&status=<OTHER_STATUS>` ' +
        'and `POST /pet/<PET_ID>/uploadImage` with `<IMAGE_BYTES>`, each followed by ' +
        '`GET /pet/<PET_ID>`. The contract asks for `petstore_auth`, but the service requires no ' +
        'credential (PN-05, tolerated), so the case asserts parity: both actors get `200` for every ' +
        'request, and for both the `PUT` is stored as sent, the form update changes only `name` and ' +
        '`status` to the values sent, and the upload changes only `photoUrls` and keeps the URLs ' +
        'stored before. A difference between the actors is a finding.',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    // Two different members of Pet.status, the same for both actors: the form update always moves
    // the status away from the one the PUT stored.
    const putStatus = faker.helpers.arrayElement(PET_STATUSES);
    const formStatus = faker.helpers.arrayElement(PET_STATUSES.filter((s) => s !== putStatus));
    const callers = [await actor('anonymous'), await actor('default')];
    const owned = callers.map((caller) => {
      const pet = aPet(faker).build();
      const suffix = () => faker.string.alpha({ length: 6, casing: 'lower' });
      return {
        caller,
        pet,
        replacement: aPet(faker)
          .withId(pet.id as number)
          .named(`${pet.name}-${suffix()}`)
          .withStatus(putStatus)
          .build(),
        form: { name: `${pet.name}-${suffix()}`, status: formStatus },
        image: imageBytes(faker),
      };
    });

    const outcomes: { plan: (typeof owned)[number]; statuses: number[]; texts: string[] }[] = [];
    try {
      for (const plan of owned) {
        const { caller, pet, replacement, form, image } = plan;
        const id = pet.id as number;
        const responses = [
          await caller.pets.create(pet),
          await caller.pets.update(replacement),
          await caller.pets.getById(id),
          await caller.pets.updateWithForm(id, form),
          await caller.pets.getById(id),
          await caller.pets.uploadImage(id, image),
          await caller.pets.getById(id),
        ];
        outcomes.push({
          plan,
          statuses: responses.map((r) => r.status()),
          texts: await Promise.all(responses.map((r) => r.text())),
        });
      }

      // create, PUT, read, form update, read, upload, read: the same for both actors.
      const allOk = [200, 200, 200, 200, 200, 200, 200];
      expect(outcomes.map((o) => [o.plan.caller.name, o.statuses])).toEqual([
        ['anonymous', allOk],
        ['default', allOk],
      ]);

      for (const { plan, texts } of outcomes) {
        await test.step(`Assert: ${plan.caller.name}`, async () => {
          const [, putBody, afterPut, formBody, afterForm, uploadBody, afterUpload] = texts.map(
            (text) => JSON.parse(text) as unknown,
          );
          expect(putBody).toMatchSchema(contract, 'Pet');
          expectSameState(plan.replacement, putBody, PET_FIELDS);
          expect(afterPut).toMatchSchema(contract, 'Pet');
          expectSameState(plan.replacement, afterPut, PET_FIELDS);

          expect(formBody).toMatchSchema(contract, 'Pet');
          expect(afterForm).toMatchSchema(contract, 'Pet');
          expectOnlyChanged(afterPut, afterForm, PET_FIELDS, ['name', 'status']);
          expect(afterForm).toMatchObject({ name: plan.form.name, status: plan.form.status });

          // The upload answer's own shape is TC-PET-47's claim; here it is held to the schema only.
          expect(uploadBody).toMatchSchema(contract, 'ApiResponse');
          expect(afterUpload).toMatchSchema(contract, 'Pet');
          expectOnlyChanged(afterForm, afterUpload, PET_FIELDS, ['photoUrls']);
          expect((afterUpload as Pet).photoUrls).toEqual(
            expect.arrayContaining((afterForm as Pet).photoUrls),
          );
        });
      }
    } finally {
      for (const { caller, pet } of owned) {
        expect(await removePet(caller, pet.id as number)).toBe(404);
      }
    }
  });
});
