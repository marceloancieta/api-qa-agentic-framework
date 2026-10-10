---
name: qa-design
description: >-
  Phase 1 of API test work. Designs test cases for a feature from its approved contract doc and writes
  them to the registry services/<pack>/registry/<feature>.md with TC-<FEATURE>-NN ids, a technique
  and a priority per case, status draft, then stops at a review gate. Use when the user asks to design
  or plan test cases, asks what should be tested for an endpoint, or wants coverage of a feature
  reviewed. Produces Markdown only: no specs, no API calls, no test-management writes.
---

# qa-design: write the registry

**Mode: design** (`.claude/rules/modes.md`). No calls to the API.

## Inputs

- The approved contract doc `services/<pack>/docs/features/<feature>.md`. If it is missing or thin,
  offer `qa-intake` first.
- [Contract analysis](../../../docs/references/contract-analysis.md): techniques, security and
  integrity cases, priorities.
- `npm run coverage:status` for the floor of the endpoints, and `npm run contract:probes -- --gaps`
  for the probes no spec covers yet.
- An existing registry for the feature, if there is one: extend it, never restart its numbering.

## Steps

1. **Derive cases** for every rule and every constrained field, across these categories: positive,
   negative, boundary, security, integrity and performance where the contract or owner states a
   budget. Each case names one technique from the registry list. Use a decision table (a YAML file
   under `services/<pack>/rules/`) when a result depends on a combination of conditions.
2. **Ask the integrity questions** for each write (L-20, L-25, L-35, L-37):
   - *Who else writes this field?* Find every operation that stores it or shares its code path, and
     cover them, or note them as out of scope.
   - *Does the case prove preserve-on-omit?* Then it first sets a value other than the default.
   - *What does the case assert on?* Records it created, never shared counters or listings.
   - *What if the write answers with an error?* The case then checks the state.
   - *Can the record it leaves break a read for other callers?* Then the case is `@destructive` and
     its details name the recovery: the delete that removes the record, or a restart (L-59).
3. **Write each case**: preconditions with placeholders, request, expected result (status, schema or
   error envelope, the business fields), verification, tags (`.claude/rules/tagging.md`), priority.
4. **Fill the registry** from [the template](../../../docs/templates/registry.md): the header
   (`.claude/rules/registry.md`), one row per case with status `draft`, the case details, and
   `beyond_floor` for cases that do not come from the contract. When an open defect already explains
   a case, put its key in the Defect column; the case still runs (L-57).
5. **Check**: `npm run lint:docs` and `npm run coverage:status`. A gap below the floor is either closed
   or explained in the registry text, never hidden.
6. **Review gate.** Show the cases grouped by category, the floor and gap, and which rules have no
   case. Apply the changes the reviewer asks for, then set the approved cases to `approved`.
7. **Hand off** to `qa-automate` with counts by category and status.

## If it stops halfway

A registry with only `draft` rows is harmless: nothing reads drafts except the reviewer. Keep it,
or remove it if the feature is dropped. Never leave half-renumbered ids: renumbering is done in one
change or not at all.

## Do not

- Write specs, call the API, or publish.
- Reuse or rename a published feature code (`.claude/rules/registry.md`).
- Write the floor or coverage numbers by hand.
