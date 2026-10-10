// Data-driven from a decision table (rules/find-by-status.yaml, generated into
// generated/decision-tables.ts). One test per table keeps one identity; each rule is a step with a
// soft assertion, so every rule reports even when an earlier one fails.

import { test, expect } from '../fixtures';
import { describeRule } from '../../../helpers/decision-table';
import { decisionTables } from '../generated/decision-tables';
import { FIND_PETS_BY_STATUS_STATUS_PARAM_VALUES as STATUS_VALUES } from '../generated/enums';

const table = decisionTables['find-by-status'];

/** Concrete inputs for each class of `status_value`; in-set uses every value of the set. */
const STATUS_INPUTS: Record<string, readonly string[]> = {
  'in-set': STATUS_VALUES,
  'outside-set': [`${STATUS_VALUES[0]}-unknown`],
  empty: [''],
};

/** The inputs for a class; a class the spec cannot map is a spec defect, never an empty loop. */
function statusInputs(statusValue: string | undefined): readonly string[] {
  const inputs = statusValue === undefined ? undefined : STATUS_INPUTS[statusValue];
  if (!inputs) throw new Error(`No status input for class "${statusValue}" of ${table.title}.`);
  return inputs;
}

test(
  'GET /pet/findByStatus follows its decision table',
  { tag: '@regression' },
  async ({ pets }) => {
    for (const rule of table.rules) {
      await test.step(describeRule(rule), async () => {
        const omitted = rule.when.status_sent === 'omitted';
        const inputs = omitted ? [undefined] : statusInputs(rule.when.status_value);
        for (const status of inputs) {
          const response = await pets.findByStatus(status);
          expect.soft(response.status(), `status=${status ?? '(omitted)'}`).toBe(rule.then.status);
        }
      });
    }
  },
);
