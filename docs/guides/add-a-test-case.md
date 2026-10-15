# Add a test case

This guide takes one new case from an idea to a published definition and a reported run. It uses
the example pack in `services/petstore/` throughout, and shows each step twice: with Claude Code,
where a phase skill does the work and stops at a review gate, and by hand, with the files to edit
and the commands to run.

The running example is a new case for the `PET` feature:

> A pet created with each status of the `Pet.status` value set reads back with that status.

Its id is written `TC-PET-NN` in this guide. `NN` is a stand-in, not a real number: a real case
takes the next free number of its feature code, and numbers run across every registry file of that
code. The case itself is illustrative; nothing in the repository depends on it.

## The path at a glance

| Step | Artifact | With Claude Code | By hand |
|---|---|---|---|
| 1. Contract | `services/petstore/docs/features/pet.md` | `qa-intake` | edit the doc, measure read-only |
| 2. Design | a row in `services/petstore/registry/pet.md` | `qa-design` | add the row and its details |
| 3. Automate | a test in `services/petstore/specs/pet.spec.ts` | `qa-automate` | write, check, run, review |
| 4. Publish | the definition in the test-management tool | `qa-publish` | `npm run tm:publish` |
| 5. Run and report | a reported run | `qa-run` | `npx playwright test`, `npm run tm:report` |

Steps 1 to 4 are design mode and step 5 is execution mode. The two never mix
([modes](../../.claude/rules/modes.md)): design calls the API read-only, apart from running the spec
it is writing, and a run never edits a spec, a registry or a definition. Every step ends at a review
gate, and the next step starts only after it is approved.

Before you start, have the local Petstore running (`npm run petstore:up`) and the setup from the
[README](../../README.md) done. The session start hook reports whether the API answers.

## 1. Check the contract covers the behaviour

A case asserts something the feature contract states. Open
[`services/petstore/docs/features/pet.md`](../../services/petstore/docs/features/pet.md) and find
the business rule the case proves. For the example it is the rule that a status is a member of the
`Pet.status` value set, which the registry cites as `REQ-PET-02`.

If the behaviour is not in the doc yet, complete the contract first. Do not design from memory or
from an issue description.

**With Claude Code.** Ask for an intake of the endpoints involved, for example "intake `POST /pet`
and `GET /pet/{petId}` for petstore". The `qa-intake` skill completes the contract from the sources
in [contract analysis](../references/contract-analysis.md), measures with read-only calls, records
gaps and open questions, and waits for your review.

**By hand.** Edit the feature doc, following
[the feature contract template](../templates/feature-contract.md). Measure only with safe methods
(`GET`, `HEAD`, `OPTIONS`); a write whose behaviour matters is measured later by a run against data
that run creates. Record where the API departs from its contract in
[`services/petstore/docs/contract-notes.md`](../../services/petstore/docs/contract-notes.md).

## 2. Design the case

The case becomes a row in the registry of its feature, plus a details section. The registry format
and the status lifecycle are defined in [the registry rule](../../.claude/rules/registry.md); the
techniques and priorities in [contract analysis](../references/contract-analysis.md#6-techniques).

**With Claude Code.** Ask for the case, for example "design a case in the petstore PET registry: a
pet created with each status reads back with it". The `qa-design` skill derives the case, asks the
integrity questions for the write, writes the row as `draft`, runs the checks and stops at its
gate. Review the row and its details; once you approve, it sets the status to `approved`.

**By hand.**

1. Pick the registry file. The `PET` cases are split across several files by sub-area, as
   `services/petstore/registry/pet.md` explains; create and read cases live in that file. Take the
   next number after the highest `TC-PET` id in any of them. Never reuse or renumber an id: once a
   case is published, its id is its identity in the test-management tool.
2. Add the row to the `## Cases` table with status `draft`, an empty Spec and an empty Defect:

   ```md
   | TC-PET-NN | A pet created with each status of the value set reads back with that status | REQ-PET-02 | equivalence-partition | medium | draft | | |
   ```

   The Requirement must be declared in the file's `requirements` header, and every `<PLACEHOLDER>`
   the details use must be declared in `test_data`. `pet.md` already declares `REQ-PET-02`,
   `<PET_ID>` and `<STATUS>`.
3. Add the details under `## Case details`:

   ```md
   ### TC-PET-NN

   - **Preconditions**: `default`; for each `<STATUS>` of `Pet.status`, a pet `<PET_ID>` built
     with that status.
   - **Request**: `POST /pet`, then `GET /pet/<PET_ID>`, once per status.
   - **Expected**: `200` and a body matching `Pet` on both; the read-back's `status` is `<STATUS>`.
   - **Verification**: follow-up read.
   - **Cleanup**: delete, confirmed by a `404` read.
   - **Tags**: `@regression @data-integrity`
   ```

   Choose the tags with [the tagging rule](../../.claude/rules/tagging.md): exactly one layer tag
   (`@regression` here, since the case is neither a critical path nor a shape check), and category
   tags only for what the case really does (`@data-integrity`, because it reads state back).
4. Run the checks, then have someone review the row and set it to `approved`:

   ```sh
   npm run lint:docs
   npm run coverage:status -- --service petstore
   ```

## 3. Automate the case

The approved row becomes one test. Where each concern lives (clients, builders, flows, generated
value sets, error envelopes, state models) and the shape every case follows are set by
[the generation rule](../../.claude/rules/generation.md); the layers and their reasons by
[ADR 0007](../adr/0007-layered-test-architecture.md).

**With Claude Code.** Ask to automate the case, for example "automate TC-PET-NN". The
`qa-automate` skill builds any missing client method, builder or flow first, writes the test (or
hands a spec file to a `spec-author` agent), checks it offline, runs it, and launches the
`api-spec-reviewer` agent for an independent review. It moves the row to `automated` and stops at
its gate with the reviewer's verdict and the run summary.

**By hand.** Add the test inside the `Pets` describe block of
`services/petstore/specs/pet.spec.ts`. That file already imports everything the test uses
(`caseDescription` and `operation` from `helpers/case-meta.ts`, `skipUnless` from
`helpers/data-gate.ts`, `aPet`, `removePet`, `PET_STATUSES`) and defines `AREA`:

```ts
test('TC-PET-NN A pet created with each status of the value set reads back with that status @regression @data-integrity', async ({
  pets,
  qa,
  faker,
  contract,
}) => {
  await operation({ method: 'POST', path: '/pet', area: AREA });
  await caseDescription(
    'For each member `<STATUS>` of `Pet.status`, a pet `<PET_ID>` with that status is created ' +
      'with `POST /pet` and read back with `GET /pet/<PET_ID>`. Both answers are `200` and match ' +
      '`Pet`, and the read-back carries the status sent.',
  );
  skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

  for (const status of PET_STATUSES) {
    await test.step(`status=${status}`, async () => {
      const pet = aPet(faker).withStatus(status).build();
      const id = pet.id as number;
      try {
        const created = await pets.create(pet);
        expect(created.status()).toBe(200);
        const answer: unknown = await created.json();
        expect(answer).toMatchSchema(contract, 'Pet');

        const read = await pets.getById(id);
        expect(read.status()).toBe(200);
        const stored: unknown = await read.json();
        expect(stored).toMatchSchema(contract, 'Pet');
        expect(stored).toMatchObject({ id, status });
      } finally {
        expect(await removePet({ pets }, id)).toBe(404);
      }
    });
  }
});
```

What each part is for:

- **The title** starts with the case id and ends with the tags. The id gives the result its identity
  (`caseIdentity` in `helpers/case-meta.ts`); the tags select lanes and reach the results as they
  are. Replace `NN` with the real number: a title without a numeric id has no identity.
- **Metadata first.** `operation` and `caseDescription` run before `skipUnless`, so a skipped case
  still reports where it belongs. Placeholders in the description stay in code spans.
- **The precondition** skips with a reason where the environment does not allow writes.
- **Data** comes from the builder and the seeded `faker` fixture, and the statuses from
  `PET_STATUSES`, which `services/petstore/types.ts` takes from `generated/enums.ts`. Never type a
  value set from memory.
- **Calls** go through the `pets` client from `services/petstore/fixtures.ts`; a spec never builds
  a URL or a header. The clients attach every request and response, redacted, as evidence.
- **Assertions** cover the status, the body against its schema every time, and the business field
  the case is about. The write is read back.
- **Cleanup** deletes what the case created and proves it with a read that answers `404`
  (`services/petstore/flows/cleanup.ts`).

For other shapes, read the worked examples: an error envelope with `expectErrorEnvelope` and a probe
reference in TC-PET-11 (`services/petstore/specs/pet.spec.ts`), a flow and a state comparison in
TC-STOR-01 (`services/petstore/specs/store.spec.ts`), and a decision table in
`services/petstore/specs/pet-search.spec.ts`. A case kept red by an open issue is armed with
`knownGap(key, why)` right before the action and tagged `@known-gap`; a case that breaks reads for
other callers is `@destructive` and lives in a spec file of its own.

Then check, run and record:

1. Check offline:

   ```sh
   npm run types:check
   npm run lint
   npm run lint:qa
   npx playwright test services/petstore/specs/pet.spec.ts --list
   ```

2. List the contract probes no spec covers yet with
   `npm run contract:probes -- --service petstore --gaps`. If the case covers some, add each as
   `probe:<id>` at the end of the title, then record the coverage with
   `npm run contract:probes:write -- --service petstore`.
3. Run the spec against the local environment and check that the case passes, or fails only as an
   armed known gap:

   ```sh
   npx playwright test services/petstore/specs/pet.spec.ts --grep "TC-PET-NN "
   ```

   Never add `--reporter`: it replaces the configured reporters and the run refuses to start
   ([reporting](../../.claude/rules/reporting.md)).
4. Have the spec reviewed by someone who did not write it, against the registry case. The
   checklist is the one the `api-spec-reviewer` agent uses (`.claude/agents/api-spec-reviewer.md`).
5. Set the row to `automated` and fill its Spec column with `specs/pet.spec.ts`, then run
   `npm run coverage:status -- --service petstore`.

## 4. Publish the definition

Only `automated` and `published` rows are sent to the test-management tool. The tool is chosen in
qa-config `test_management.provider`; [test management](../test-management.md) describes the
providers and the flow.

**With Claude Code.** Ask to publish, for example "publish the petstore cases". The `qa-publish`
skill checks the tool answers, builds the manifest, shows a dry run at its gate, publishes after
your approval, reads every write back, and moves the confirmed rows to `published`.

**By hand.**

```sh
npm run tm:manifest -- --service petstore
npm run tm:publish -- --service petstore --dry-run
npm run tm:publish -- --service petstore
```

The manifest lists every result it cannot attribute to a case, with the reason; fix a missing
identity in the spec, never in the manifest. Check the dry run before the real publish. After the
publish, set the row to `published`. From then on its id is frozen.

A results-first tool (the `allure-report` and `allure-testops` providers) has no definitions step:
the case is created from the next reported run, so do step 5 first. Then resume `qa-publish` to set
the row to `published` for the identities `reports/tm/report-<provider>.json` lists; the run itself
never edits a registry.

## 5. Run and report

**With Claude Code.** Ask to run, for example "run the petstore suite and report it". The `qa-run`
skill picks the selection, checks the environment, states what data the run needs (and, for a
selection that writes, waits for your go), runs, reports to the tool, and summarizes every pass,
failure and skip with its reason. It never edits what it ran; a failure becomes a proposal for
design, a defect (`qa-report-bug`) or a flake check.

**By hand.**

```sh
npx playwright test services/petstore/specs
npm run tm:report -- --service petstore
```

The run prints its seed (`QA_SEED`) and its run id; `tm:report` reuses the run id, reports the
latest results of the pack and closes the run. With the `allure-report` provider,
`npm run tm:open` serves the report. The [qa-run skill](../../.claude/skills/qa-run/SKILL.md) lists
the other selections: a tag such as `--grep @smoke`, the published lane, the known-gap lane, and the
destructive lane, which is the only way `@destructive` cases run.

## What the checks will say

Each linter documents its rules in its own header, and [quality gates](../quality-gates.md) lists
what `npm run gates` runs. These are the findings a new case usually meets:

| Check | Typical finding | Why |
|---|---|---|
| `npm run lint:docs` (registry-shape) | a bad header key, a row with the wrong number of cells, an id that is not `TC-<FEATURE>-NN`, a status, technique or priority outside its list, a duplicate id | the registry is read as data, so its shape is strict (`scripts/lib/registry.mjs`) |
| `npm run lint:docs` (dead-path, dead-link) | a path or link in the case details that does not exist | prose must point at real files |
| `npm run lint:docs` (note-citation) | a contract note id (`<PREFIX>-NN`, or a range `<PREFIX>-NN to <PREFIX>-NN`) that `services/<pack>/docs/contract-notes.md` does not define | a case cites the note it reproduces, so the note must exist |
| `npm run lint:harness` | a tag outside the taxonomy or not exactly one layer tag; `operation` after a skip; an assertion only reached when the response looks right; a write to a seed record outside a resource guard; I/O at import time; `@known-gap` without its `knownGap()` arm; a `@destructive` case next to other cases | each pattern makes a case pass, skip or report itself wrongly while the API is not really checked |
| `npm run lint:suite` | a real-looking e-mail, host, IP, phone number, UUID, token or long digit run in a spec, registry or doc | nothing real or personal is committed; use builders and `<PLACEHOLDERS>` |
| `npm run coverage:status` | a `draft` or `approved` row whose id a spec already carries; an `automated` row whose Spec file lacks exactly one enabled test with the id; a `published` row with no result in the latest run of its spec; a spec test whose id no registry lists; fewer cases than the floor | the registry is a claim and the specs and results are the evidence; the floor comes from `scripts/derive-floor.mjs` |
| `npm run contract:check` | the probe matrix is out of date | a `probe:<id>` was added or removed without `npm run contract:probes:write -- --service <pack>` |

Two consequences of how results are kept:

- Every Playwright run starts by clearing `allure-results/`, including the unit run inside
  `npm run gates`. `coverage:status` and `tm:report` read whatever run is there, so run the pack's
  suite last before reporting. After a single-spec run, `coverage:status` judges the `published`
  rows of that spec only and counts the others in a note; a `--grep` selection inside a spec still
  reports the spec's `published` rows it left out.
- A `draft` or `approved` row must not have a spec test yet. Write the test, then move the row to
  `automated` in the same change.

## Before you commit

Run `npm run gates` and keep the change to one logical step: a registry change, then a spec with its
row moving to `automated`. Commit messages follow
[ADR 0008](../adr/0008-branching-and-traceability.md).
