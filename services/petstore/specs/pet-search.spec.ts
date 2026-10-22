// Pet searches (registry/pet-search.md). The two decision tables (rules/find-by-status.yaml and
// rules/pet-find-by-tags.yaml, generated into generated/decision-tables.ts) run one test per table
// and one step per rule, with soft assertions so every rule reports even when an earlier one fails.
// A search result is judged only on the case's own pet: the seed pets and other cases' pets may be
// listed too (L-25). Tags come from uniqueTag, so a search by tag lists the case's pets and nothing
// else, and its result can be compared whole.

import { test, expect } from '../fixtures';
import type { APIResponse } from '@playwright/test';
import { caseDescription, knownGap, operation } from '../../../helpers/case-meta';
import { skipUnless } from '../../../helpers/data-gate';
import { describeRule } from '../../../helpers/decision-table';
import { expectErrorEnvelope } from '../../../helpers/error-envelope';
import type { SchemaValidator } from '../../../helpers/schema';
import { aPet, uniqueTag } from '../builders/pet-builder';
import { removePet } from '../flows/cleanup';
import { decisionTables } from '../generated/decision-tables';
import { FIND_PETS_BY_STATUS_STATUS_PARAM_VALUES as STATUS_VALUES } from '../generated/enums';
import type { Pet } from '../types';

const AREA = 'pet';

// A fully qualified implementation type in an error message, such as `java.lang.Long` (PN-07).
const IMPLEMENTATION_TYPE = /\b[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+\.[A-Z]\w*/;

/** The pets of a search answer, after checking every element against `Pet`. */
async function listedPets(response: APIResponse, contract: SchemaValidator) {
  const body: unknown = await response.json();
  expect(Array.isArray(body)).toBe(true);
  for (const pet of body as unknown[]) expect(pet).toMatchSchema(contract, 'Pet');
  return body as Pet[];
}

/** The ids of a search answer, after checking every element against `Pet`. */
async function listedIds(response: APIResponse, contract: SchemaValidator) {
  return (await listedPets(response, contract)).map((pet) => pet.id);
}

const tagNames = (pet: Pet) => (pet.tags ?? []).map((tag) => tag.name);
const sorted = (ids: (number | undefined)[]) => [...ids].sort((a, b) => Number(a) - Number(b));

test.describe('Pet searches', () => {
  test("TC-PET-54 Finding by each status lists the case's own pet and only pets of that status @smoke @data-integrity", async ({
    pets,
    qa,
    faker,
    contract,
  }) => {
    await operation({ method: 'GET', path: '/pet/findByStatus', area: AREA });
    await caseDescription(
      'One pet per member of `Pet.status` is created, each with its own `<PET_ID>`. ' +
        '`GET /pet/findByStatus?status=<STATUS>` for each member answers `200` with an array of ' +
        "`Pet`: every item has the requested status, the case's pet of that status is listed and " +
        'its pets of the other statuses are not.',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const own = STATUS_VALUES.map((status) => aPet(faker).withStatus(status).build());
    try {
      for (const pet of own) expect((await pets.create(pet)).status()).toBe(200);

      for (const status of STATUS_VALUES) {
        await test.step(`Assert status=${status}`, async () => {
          const response = await pets.findByStatus(status);
          expect.soft(response.status(), status).toBe(200);
          const listed = await listedPets(response, contract);
          expect
            .soft(listed.filter((pet) => pet.status !== status).map((pet) => pet.id))
            .toEqual([]);
          const ids = listed.map((pet) => pet.id);
          for (const pet of own) {
            expect
              .soft(ids.includes(pet.id), `pet with ${pet.status} under ${status}`)
              .toBe(pet.status === status);
          }
        });
      }
    } finally {
      for (const pet of own) expect(await removePet({ pets }, pet.id as number)).toBe(404);
    }
  });

  test('TC-PET-55 Finding by status answers as its decision table says @regression probe:p-9e9221c97f probe:p-71b75f7773', async ({
    pets,
    envelopes,
    contract,
  }) => {
    const table = decisionTables['find-by-status'];
    await operation({ method: 'GET', path: '/pet/findByStatus', area: AREA });
    await caseDescription(
      '`GET /pet/findByStatus` once per rule of `rules/find-by-status.yaml`: each member of the ' +
        'value set answers `200`; a value outside it, an empty value and no parameter answer `400` ' +
        'with the `input-error` envelope. Read only.',
    );
    const inputs: Record<string, readonly string[]> = {
      'in-set': STATUS_VALUES,
      'outside-set': [`${STATUS_VALUES[0]}-unknown`],
      empty: [''],
    };

    for (const rule of table.rules) {
      const when: Readonly<Record<string, string>> = rule.when;
      await test.step(describeRule(rule), async () => {
        const omitted = when['status_sent'] === 'omitted';
        const values = omitted ? [undefined] : inputs[when['status_value'] ?? ''];
        if (!values) throw new Error(`No status input for class "${when['status_value']}".`);
        for (const status of values) {
          const response = await pets.findByStatus(status);
          const label = `status=${status ?? '(omitted)'}`;
          expect.soft(response.status(), label).toBe(rule.then.status);
          if (rule.then.status === 200) {
            await expect.soft(listedIds(response, contract), label).resolves.toBeDefined();
          } else {
            await expect
              .soft(expectErrorEnvelope(response, envelopes, 'input-error'), label)
              .resolves.toBeDefined();
          }
        }
      });
    }
  });

  test('TC-PET-56 Status matching is exact: wrong case and padded values are refused @regression', async ({
    pets,
    envelopes,
  }) => {
    await operation({ method: 'GET', path: '/pet/findByStatus', area: AREA });
    await caseDescription(
      '`GET /pet/findByStatus` with a member of `Pet.status` in upper case, and with the same ' +
        'member after a leading space. Each answers `400` with the `input-error` envelope. Read only.',
    );
    const member = STATUS_VALUES[0];

    for (const [label, status] of [
      ['upper case', member.toUpperCase()],
      ['leading space', ` ${member}`],
    ] as const) {
      const response = await pets.findByStatus(status);
      expect.soft(response.status(), label).toBe(400);
      await expect
        .soft(expectErrorEnvelope(response, envelopes, 'input-error'), label)
        .resolves.toBeDefined();
    }
  });

  test('TC-PET-57 Several statuses in one request list the pets of each and are all validated @regression @contract-drift @known-gap', async ({
    pets,
    qa,
    faker,
    envelopes,
    contract,
  }) => {
    await operation({ method: 'GET', path: '/pet/findByStatus', area: AREA });
    await caseDescription(
      'A pet with `<STATUS>` and a pet with `<OTHER_STATUS>`. `?status=<STATUS>,<OTHER_STATUS>` and ' +
        '`?status=<STATUS>&status=<OTHER_STATUS>` each answer `200` listing both pets, every item ' +
        'having one of the two statuses, as the spec prose promises; ' +
        '`?status=<STATUS>&status=<OUT_OF_SET_STATUS>` answers `400` `input-error`, because every ' +
        'value is validated. Known gap `LOCAL-12` (PN-10): the comma list answers `400`, and with ' +
        'repeated parameters only the first is used and validated.',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const [status, otherStatus] = [STATUS_VALUES[0], STATUS_VALUES[1]];
    const own = [status, otherStatus].map((value) => aPet(faker).withStatus(value).build());
    const ownIds = own.map((pet) => pet.id);
    try {
      for (const pet of own) expect((await pets.create(pet)).status()).toBe(200);

      test.fail(
        true,
        await knownGap('LOCAL-12', 'several statuses are refused or only the first is used'),
      );
      for (const [label, search] of [
        ['comma list', () => pets.findByStatusList([status, otherStatus])],
        ['repeated', () => pets.findByStatus([status, otherStatus])],
      ] as const) {
        await test.step(`Assert ${label}`, async () => {
          const response = await search();
          expect.soft(response.status(), label).toBe(200);
          const judged = listedPets(response, contract).then((listed) => ({
            outsideTheTwoStatuses: listed
              .filter((pet) => pet.status !== status && pet.status !== otherStatus)
              .map((pet) => pet.id),
            ownPetsMissing: ownIds.filter((id) => !listed.some((pet) => pet.id === id)),
          }));
          await expect
            .soft(judged, label)
            .resolves.toEqual({ outsideTheTwoStatuses: [], ownPetsMissing: [] });
        });
      }

      await test.step('Assert repeated with an out-of-set value', async () => {
        const response = await pets.findByStatus([status, `${status}-unknown`]);
        expect.soft(response.status()).toBe(400);
        await expect
          .soft(expectErrorEnvelope(response, envelopes, 'input-error'))
          .resolves.toBeDefined();
      });
    } finally {
      for (const pet of own) expect(await removePet({ pets }, pet.id as number)).toBe(404);
    }
  });

  test('TC-PET-58 An injection string in status is refused without echoing it @regression @security @known-gap', async ({
    pets,
    faker,
    envelopes,
  }) => {
    await operation({ method: 'GET', path: '/pet/findByStatus', area: AREA });
    await caseDescription(
      '`GET /pet/findByStatus?status=<INJECTION_STRING>` (a quote, a statement separator and a ' +
        'comment marker). It answers `400` with the `input-error` envelope, never a `5xx`, and the ' +
        'message neither echoes the raw input nor names an implementation type. Known gap ' +
        '`LOCAL-14` (PN-07): input errors echo the raw input. Read only.',
    );
    // The marker is unique to the case: an escaped or trimmed echo still carries it.
    const marker = uniqueTag(faker);
    const injection = [`'`, ';', '--', marker].join(' ');

    test.fail(true, await knownGap('LOCAL-14', 'input errors echo the raw value sent'));
    const response = await pets.findByStatus(injection);
    expect(response.status()).toBeLessThan(500);
    expect.soft(response.status()).toBe(400);
    const body = (await expectErrorEnvelope(response, envelopes, 'input-error')) as {
      message: string;
    };
    expect.soft(body.message, 'echoes the raw input').not.toContain(injection);
    expect.soft(body.message, 'echoes part of the input').not.toContain(marker);
    expect.soft(body.message, 'names an implementation type').not.toMatch(IMPLEMENTATION_TYPE);
  });

  test("TC-PET-59 Finding by the case's tag lists its pet exactly once @regression @data-integrity", async ({
    pets,
    qa,
    faker,
    contract,
  }) => {
    await operation({ method: 'GET', path: '/pet/findByTags', area: AREA });
    await caseDescription(
      'A pet `<PET_ID>` created with `<TAG>`. `GET /pet/findByTags?tags=<TAG>` answers `200` with ' +
        "an array of `Pet`: the case's pet appears exactly once and every item carries `<TAG>`.",
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const pet = aPet(faker).withUniqueTag().build();
    const id = pet.id as number;
    const tag = tagNames(pet)[0] ?? '';
    try {
      expect((await pets.create(pet)).status()).toBe(200);

      const response = await pets.findByTags(tag);
      expect(response.status()).toBe(200);
      const listed = await listedPets(response, contract);
      expect.soft(listed.filter((item) => item.id === id)).toHaveLength(1);
      expect
        .soft(listed.filter((item) => !tagNames(item).includes(tag)).map((item) => item.id))
        .toEqual([]);
    } finally {
      expect(await removePet({ pets }, id)).toBe(404);
    }
  });

  test('TC-PET-60 Finding by tags answers as its decision table says @regression probe:p-d5d4a0da19', async ({
    pets,
    qa,
    faker,
    contract,
  }) => {
    const table = decisionTables['pet-find-by-tags'];
    await operation({ method: 'GET', path: '/pet/findByTags', area: AREA });
    await caseDescription(
      '`GET /pet/findByTags` once per rule of `rules/pet-find-by-tags.yaml`. A tag carried by the ' +
        "case's own pet answers `200` listing it; a tag no pet carries answers `200` with an empty " +
        'list; an empty value and no parameter answer `400` (status only: the empty-value body is ' +
        'plain text outside the envelope catalogue, PN-08).',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const pet = aPet(faker).withUniqueTag().build();
    const id = pet.id as number;
    const known = pet.tags?.[0]?.name ?? '';
    const inputs: Record<string, string> = { known, unknown: uniqueTag(faker), empty: '' };
    try {
      expect((await pets.create(pet)).status()).toBe(200);

      for (const rule of table.rules) {
        const when: Readonly<Record<string, string>> = rule.when;
        await test.step(describeRule(rule), async () => {
          const omitted = when['tags_sent'] === 'omitted';
          const tag = omitted ? undefined : inputs[when['tags_value'] ?? ''];
          if (!omitted && tag === undefined) {
            throw new Error(`No tag input for class "${when['tags_value']}".`);
          }
          const response = await pets.findByTags(tag);
          expect.soft(response.status(), `tags=${tag ?? '(omitted)'}`).toBe(rule.then.status);
          if (rule.then.status !== 200) return;
          const ids = await listedIds(response, contract);
          if (when['tags_value'] === 'known') expect.soft(ids).toEqual([id]);
          else expect.soft(ids).toEqual([]);
        });
      }
    } finally {
      expect(await removePet({ pets }, id)).toBe(404);
    }
  });

  test('TC-PET-61 Several tags in one request list each matching pet once @regression @contract-drift @known-gap', async ({
    pets,
    qa,
    faker,
    contract,
  }) => {
    await operation({ method: 'GET', path: '/pet/findByTags', area: AREA });
    await caseDescription(
      'Three pets: one with `<TAG>`, one with `<OTHER_TAG>`, one with both. ' +
        '`?tags=<TAG>&tags=<OTHER_TAG>` and `?tags=<TAG>,<OTHER_TAG>` each answer `200` listing all ' +
        'three pets once; `?tags=<TAG>&tags=<TAG>` lists the two `<TAG>` pets once each; ' +
        '`?tags=<TAG>&tags=` lists the `<TAG>` pets (the measured baseline: the contract does not ' +
        'define an empty value next to a valid one). Known gap `LOCAL-13` (PN-11): repeated tags ' +
        'list a pet once per matching tag, and a comma list is matched as one literal tag and ' +
        'returns `[]`.',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const [tag, otherTag] = [uniqueTag(faker), uniqueTag(faker)];
    const onlyTag = aPet(faker).withTagNames(tag).build();
    const onlyOther = aPet(faker).withTagNames(otherTag).build();
    const both = aPet(faker).withTagNames(tag, otherTag).build();
    const own = [onlyTag, onlyOther, both];
    const all = sorted(own.map((pet) => pet.id));
    const tagged = sorted([onlyTag.id, both.id]);
    try {
      for (const pet of own) expect((await pets.create(pet)).status()).toBe(200);

      test.fail(true, await knownGap('LOCAL-13', 'several tags duplicate pets or match nothing'));
      for (const [label, search, expected] of [
        ['repeated', () => pets.findByTags([tag, otherTag]), all],
        ['comma list', () => pets.findByTagsList([tag, otherTag]), all],
        ['same tag twice', () => pets.findByTags([tag, tag]), tagged],
        ['empty second value', () => pets.findByTags([tag, '']), tagged],
      ] as const) {
        await test.step(`Assert ${label}`, async () => {
          const response = await search();
          expect.soft(response.status(), label).toBe(200);
          await expect
            .soft(listedIds(response, contract).then(sorted), label)
            .resolves.toEqual(expected);
        });
      }
    } finally {
      for (const pet of own) expect(await removePet({ pets }, pet.id as number)).toBe(404);
    }
  });

  test("TC-PET-62 Tag matching is exact: wrong case and padded tags do not find the case's pet @regression", async ({
    pets,
    qa,
    faker,
    contract,
  }) => {
    await operation({ method: 'GET', path: '/pet/findByTags', area: AREA });
    await caseDescription(
      'A pet `<PET_ID>` created with `<TAG>`. `GET /pet/findByTags` with `<TAG>` in upper case, and ' +
        "with `<TAG>` after a leading space, each answers `200` and does not list the case's pet.",
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const pet = aPet(faker).withUniqueTag().build();
    const id = pet.id as number;
    const tag = tagNames(pet)[0] ?? '';
    try {
      expect((await pets.create(pet)).status()).toBe(200);
      // The exact tag finds the pet, so its absence below is about matching, not a broken search.
      const exact = await pets.findByTags(tag);
      expect(exact.status()).toBe(200);
      expect(await listedIds(exact, contract)).toContain(id);

      for (const [label, value] of [
        ['upper case', tag.toUpperCase()],
        ['leading space', ` ${tag}`],
      ] as const) {
        const response = await pets.findByTags(value);
        expect.soft(response.status(), label).toBe(200);
        await expect
          .soft(
            listedIds(response, contract).then((ids) => ids.includes(id)),
            label,
          )
          .resolves.toBe(false);
      }
    } finally {
      expect(await removePet({ pets }, id)).toBe(404);
    }
  });

  test('TC-PET-63 Long and injection tag values answer an empty list, never a server error @regression @security', async ({
    pets,
    faker,
  }) => {
    await operation({ method: 'GET', path: '/pet/findByTags', area: AREA });
    await caseDescription(
      '`GET /pet/findByTags` with a 2000-character tag unique to the case and with ' +
        '`<INJECTION_STRING>` (a quote, a statement separator and a comment marker). Each answers ' +
        '`200` with an empty list, never a `5xx`. Read only.',
    );
    const overlong = uniqueTag(faker).padEnd(2000, 'x');
    const injection = [`'`, ';', '--', uniqueTag(faker)].join(' ');

    for (const [label, tag] of [
      ['overlong', overlong],
      ['injection', injection],
    ] as const) {
      const response = await pets.findByTags(tag);
      expect.soft(response.status(), label).toBe(200);
      expect.soft(await response.json(), label).toEqual([]);
    }
  });

  test('TC-PET-64 A status change moves the pet between search results @regression @data-integrity', async ({
    pets,
    qa,
    faker,
    contract,
  }) => {
    await operation({ method: 'PUT', path: '/pet', area: AREA });
    await caseDescription(
      'A pet created with `<STATUS>` is moved to `<OTHER_STATUS>` with `PUT /pet`, then back with ' +
        'the form update `POST /pet/<PET_ID>` (with `name`, PN-23). After each move ' +
        '`findByStatus` lists the pet under its new status only.',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const [status, otherStatus] = [STATUS_VALUES[0], STATUS_VALUES[1]];
    const pet = aPet(faker).withStatus(status).build();
    const id = pet.id as number;
    const listedUnder = async (value: string) => {
      const response = await pets.findByStatus(value);
      expect(response.status(), `findByStatus ${value}`).toBe(200);
      return (await listedIds(response, contract)).includes(id);
    };
    try {
      expect((await pets.create(pet)).status()).toBe(200);

      const updated = await pets.update({ ...pet, status: otherStatus });
      expect(updated.status()).toBe(200);
      const updatedBody: unknown = await updated.json();
      expect(updatedBody).toMatchSchema(contract, 'Pet');
      expect(await listedUnder(otherStatus), `listed under ${otherStatus}`).toBe(true);
      expect(await listedUnder(status), `no longer under ${status}`).toBe(false);

      const formUpdated = await pets.updateWithForm(id, { name: pet.name, status });
      expect(formUpdated.status()).toBe(200);
      const formBody: unknown = await formUpdated.json();
      expect(formBody).toMatchSchema(contract, 'Pet');
      expect(await listedUnder(status), `listed under ${status} again`).toBe(true);
      expect(await listedUnder(otherStatus), `no longer under ${otherStatus}`).toBe(false);
    } finally {
      expect(await removePet({ pets }, id)).toBe(404);
    }
  });

  test('TC-PET-65 A deleted pet disappears from searches by status and by tag @regression @data-integrity', async ({
    pets,
    qa,
    faker,
    contract,
  }) => {
    await operation({ method: 'DELETE', path: '/pet/{petId}', area: AREA });
    await caseDescription(
      'A pet `<PET_ID>` created with `<STATUS>` and `<TAG>` is listed by `findByStatus` and by ' +
        '`findByTags` before `DELETE /pet/<PET_ID>`. After the delete a read answers `404`, and ' +
        'both searches answer `200` without the pet.',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const pet = aPet(faker).withAnyStatus().withUniqueTag().build();
    const id = pet.id as number;
    const status = pet.status ?? '';
    const tag = tagNames(pet)[0] ?? '';
    const listedBy = async () => {
      const byStatus = await pets.findByStatus(status);
      const byTag = await pets.findByTags(tag);
      expect(byStatus.status(), 'findByStatus').toBe(200);
      expect(byTag.status(), 'findByTags').toBe(200);
      return {
        status: (await listedIds(byStatus, contract)).includes(id),
        tag: (await listedIds(byTag, contract)).includes(id),
      };
    };
    let removed = false;
    try {
      await test.step('Arrange', async () => {
        expect((await pets.create(pet)).status()).toBe(200);
        expect(await listedBy()).toEqual({ status: true, tag: true });
      });
      await test.step('Act', async () => {
        expect(await removePet({ pets }, id)).toBe(404);
        removed = true;
      });
      await test.step('Assert', async () => {
        expect(await listedBy()).toEqual({ status: false, tag: false });
      });
    } finally {
      if (!removed) expect(await removePet({ pets }, id)).toBe(404);
    }
  });

  test('TC-PET-66 An anonymous caller gets the same search answers as the default caller @regression @security', async ({
    pets,
    actor,
    qa,
    faker,
    contract,
  }) => {
    await operation({ method: 'GET', path: '/pet/findByStatus', area: AREA });
    await caseDescription(
      'A pet `<PET_ID>` created with `<STATUS>` and `<TAG>`. `findByStatus?status=<STATUS>` and ' +
        '`findByTags?tags=<TAG>` sent as the `anonymous` and as the `default` actor answer the same ' +
        "status, and both list the case's pet. Tolerated (PN-05): no `401`; a difference between " +
        'the actors is a finding.',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const pet = aPet(faker).withAnyStatus().withUniqueTag().build();
    const id = pet.id as number;
    const status = pet.status ?? '';
    const tag = tagNames(pet)[0] ?? '';
    try {
      expect((await pets.create(pet)).status()).toBe(200);

      type Answer = { search: string; status: number; listed: boolean };
      const answersOf = async (name: 'anonymous' | 'default'): Promise<Answer[]> => {
        const caller = await actor(name);
        const answers: Answer[] = [];
        for (const [search, response] of [
          ['findByStatus', await caller.pets.findByStatus(status)],
          ['findByTags', await caller.pets.findByTags(tag)],
        ] as const) {
          const listed =
            response.status() === 200 && (await listedIds(response, contract)).includes(id);
          answers.push({ search, status: response.status(), listed });
        }
        return answers;
      };
      const anonymous = await answersOf('anonymous');
      const byDefault = await answersOf('default');
      expect(anonymous, 'anonymous answers equal default answers').toEqual(byDefault);
      expect(byDefault).toEqual([
        { search: 'findByStatus', status: 200, listed: true },
        { search: 'findByTags', status: 200, listed: true },
      ]);
    } finally {
      expect(await removePet({ pets }, id)).toBe(404);
    }
  });
});
