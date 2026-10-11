// Pet searches (registry/pet-search.md). The two decision tables (rules/find-by-status.yaml and
// rules/pet-find-by-tags.yaml, generated into generated/decision-tables.ts) run one test per table
// and one step per rule, with soft assertions so every rule reports even when an earlier one fails.
// A search result is judged only on the case's own pet: the seed pets and other cases' pets may be
// listed too (L-25).

import { test, expect } from '../fixtures';
import type { APIResponse } from '@playwright/test';
import { caseDescription, operation } from '../../../helpers/case-meta';
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

/** The ids of a search answer, after checking every element against `Pet`. */
async function listedIds(response: APIResponse, contract: SchemaValidator) {
  const body: unknown = await response.json();
  expect(Array.isArray(body)).toBe(true);
  for (const pet of body as unknown[]) expect(pet).toMatchSchema(contract, 'Pet');
  return (body as Pet[]).map((pet) => pet.id);
}

test.describe('Pet searches', () => {
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
});
