---
paths:
  - 'services/**'
---

# Generation: from a designed case to a spec

How an approved registry case becomes code in a service pack. The layers and their reasons are in
ADR 0007; `services/petstore/` is the worked example.

## Where things go

| Concern | Lives in | A spec... |
|---|---|---|
| HTTP: paths, headers, serialization, credentials | `clients/`, one client per resource, over `helpers/base-client.ts` | calls a client method; never builds a URL or a header |
| Who calls | `actor(name)` from the pack fixtures | asks for an actor for authorization cases |
| Multi-step preconditions | `flows/` | calls a flow; each step stops on an unexpected status |
| Request data | `builders/` and the Object Mother, with the `faker`, `rng` and `clock` fixtures | never uses `Math.random` or `Date.now()` (L-27) |
| Literal values of the contract | `generated/enums.ts` (`npm run contract:value-sets`) | never types a value set from memory (L-36) |
| Error formats | `error-envelopes.json` | asserts with `expectErrorEnvelope` |
| Combinations of conditions | `rules/<id>.yaml`, generated into `generated/decision-tables.ts` | iterates the table in one test, one step per rule |
| State comparison | `state-models.ts` | uses `expectSameState` and `expectOnlyChanged` (L-53) |
| Shared records | `guards.ts` with `withResourceGuard` | wraps every write to data it did not create (L-39) |
| Checks several specs share (an inline schema with no name) | `assertions.ts` | imports them; never imports another spec |

## Every case

1. **The title starts with the case id** and ends with its tags:
   `TC-PET-03 a pet without a name is refused @regression @contract-drift`. The id gives the result
   its identity (L-22); the tags follow `.claude/rules/tagging.md`.
2. **Metadata first.** Call `operation(...)` and `caseDescription(...)` before any skip, so a skipped
   case still reports where it belongs (L-16).
3. **Preconditions next.** Use `skipUnless` or `requireData` for missing data or a read-only
   environment. A skip carries its reason, and data in the wrong state fails instead of skipping
   (L-40).
4. **Steps** are optional; a short case reads fine without them. When used, they are named for what
   they do: `Arrange`, `Act`, `Assert`, and `Record` for a step that keeps evidence without judging
   it. A step called `Assert` must assert.
5. **Assertions:**
   - the status;
   - the body against the schema with `toMatchSchema`, or the error envelope with
     `expectErrorEnvelope`, every time and never behind a condition (L-19);
   - the business fields the case is about.

   Writes add a read-back, and a write that answered with an error adds a check of the state (L-35).
6. **Own records only** (L-25). Assert on what the case created; take ids from the response that
   created them.
7. **Preserve-on-omit** cases set a non-default value first (L-20).
8. **Known gaps** arm right before the action: `test.fail(true, await knownGap('<KEY>', why))`, with
   `@known-gap` in the title (L-13, L-14).
9. **Probes** the case covers are referenced as `probe:<id>` in the title. Run
   `npm run contract:probes:write` afterwards.

## Data and secrets

- No real identifiers, personal data or credentials in specs, registries or docs. Use placeholders in
  prose and builders in code. `npm run lint:suite` checks emails, phone numbers, hosts and long digit
  runs (L-41).
- Evidence is attached by the clients, redacted, with identity fields pseudonymized (L-42). A spec
  does not attach raw bodies itself.
- Modules do no I/O at import time, so a failure cannot abort collection of the whole lane (L-24).
  Data a spec needs at collection time comes from a generated module (`generated/`), not from reading
  a file.

## Before calling a spec done

`npm run types:check`, `npm run lint`, `npm run lint:qa` and a run of the spec against the
environment. Data-backed cases pass or fail as designed, data-gated cases skip with their reason, and
nothing skips silently. Then the `api-spec-reviewer` agent, never the spec's author, returns
`approve` for it (`qa-automate`).
