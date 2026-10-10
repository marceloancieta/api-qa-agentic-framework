# api-spec-reviewer evaluation fixtures

Input for evaluating the `api-spec-reviewer` agent (`.claude/agents/api-spec-reviewer.md`): a
registry for an imaginary Petstore feature and two specs that implement it, with seeded defects and
clean look-alikes.

| File | Holds |
|---|---|
| `pet-review.md` | the registry, feature `PETREV`, cases TC-PETREV-01 to TC-PETREV-13 |
| `pet-core.spec.ts` | TC-PETREV-01 to 05, 08, 09, 12 and 13 |
| `pet-edges.spec.ts` | TC-PETREV-06, 07, 10 and 11 |

Nothing here is collected or run: the folder is outside `services/*/specs/` (the Playwright `api`
project) and outside the scopes of the linters, and `tsc`, ESLint and `lint-docs` exclude
`scripts/__fixtures__/`. The specs import the real Petstore fixtures, builders and helpers, so they
read like pack specs.

## Markers

A seeded defect carries `// expect-review: <check-id>`, either at the end of the offending line or
alone on the line right above it (for a finding about a whole test, above its `test(` call). Every
id is one of the checks the agent catalogues, and every catalogued check is seeded at least once.
Unmarked code is meant to be clean: a finding on it is a false positive.

## Running an evaluation

1. Make marker-free copies. Each marker becomes nothing or an empty line, so line numbers do not
   change:

   ```sh
   out="<scratchpad>/review-eval"; mkdir -p "$out"
   for f in scripts/__fixtures__/agents/api-spec-reviewer/*.spec.ts; do
     sed -E 's#[[:space:]]*// expect-review: [a-z, -]+$##' "$f" > "$out/$(basename "$f")"
   done
   ```

2. Launch the agent with: the two copies as the specs, saying that each stands for the file of the
   same name in `scripts/__fixtures__/agents/api-spec-reviewer/` (imports resolve from there) and
   that it must not open this README or the originals; the registry `pet-review.md` from this
   folder with cases TC-PETREV-01 to TC-PETREV-13; the pack `petstore`. `npm run lint:qa` does not
   scan these files and `--list` finds no tests in them; both are expected.
3. Compare the report with the tables below: each expected finding with the same case, check and
   line, each verdict, and every finding outside the table (a look-alike flagged, or a guess).
   Severity is part of the result; a different severity is a partial match.

## Expected findings

| Case | Check | Severity | File | Scenario that still passes |
|---|---|---|---|---|
| TC-PETREV-02 | `title-claim` | blocker | `pet-core.spec.ts` | Only the name is read back; a PUT that ignores `status` passes although the title claims it is stored. |
| TC-PETREV-02 | `vacuous-assertion` | major | `pet-core.spec.ts` | The schema check reads the request `changed`, not the response; a response of any shape passes. |
| TC-PETREV-03 | `missing-oracle` | major | `pet-core.spec.ts` | No read-back after the refused write (L-35); a server that answers `400` but stores the pet without its name passes. The `@data-integrity` tag goes with the fix. |
| TC-PETREV-05 | `coincidental-pass` | blocker | `pet-core.spec.ts` | The pet comes from `PetMother.minimal`, so it has no tags; "kept" equals what a server that drops omitted tags stores. |
| TC-PETREV-08 | `vacuous-assertion` | blocker | `pet-core.spec.ts` | The loop has no length check and the case created no sold pet; an empty list passes. |
| TC-PETREV-09 | `registry-fidelity` | blocker | `pet-core.spec.ts` | The registry expects `404` and no pet created; the spec asserts that the PUT creates the pet, so it passes on the very defect the case was designed to catch. |
| TC-PETREV-12 | `layering` | major | `pet-core.spec.ts` | The value set is typed from memory instead of `PET_STATUSES` (L-36); a member the contract adds is never tried. |
| TC-PETREV-12 | `data-safety` | major | `pet-core.spec.ts` | Every pet created is left behind, in the generated range and in each status listing. |
| TC-PETREV-13 | `data-safety` | blocker | `pet-core.spec.ts` | It updates the first sold pet of the listing, a record it did not create (a seed pet or another case's), without a guard, and leaves it `available`. |
| TC-PETREV-06 | `coincidental-pass` | major | `pet-edges.spec.ts` | The id is drawn from the builder's range, where other cases create pets; not-found holds only while no case happens to use it. The registry's `<UNKNOWN_PET_ID>` lies above the range. |
| TC-PETREV-10 | `registry-fidelity` | major | `pet-edges.spec.ts` | The case is `draft`; only approved cases are automated. |
| TC-PETREV-11 | `case-shape` | minor | `pet-edges.spec.ts` | The step named `Assert` only reads; the assertions run after it. |

## Expected verdicts

- `pet-core.spec.ts`: `block`
- `pet-edges.spec.ts`: `changes`

## Look-alikes (not findings)

- TC-PETREV-01 compares the response and the read-back with the request that created the pet: a
  read-back oracle, not a value compared with itself.
- TC-PETREV-02 sends `status: 'sold'`: one literal, checked by the generated `PetStatus` union and
  named by the registry.
- TC-PETREV-03 branches on `422`, and both branches assert (`expectErrorEnvelope` checks the `400`).
  The known gap is armed right before the action, with `@known-gap` and the registry's key.
- TC-PETREV-04 is preserve-on-omit done right: a non-default status first, then `expectOnlyChanged`.
- TC-PETREV-06 draws its id from the seeded `faker` fixture: the defect is coincidence, not
  layering.
- TC-PETREV-07 loops over the listing only after asserting that the case pet is in it, and checks
  other callers' pets for the filter only, never for their shape.
- TC-PETREV-09, 10 and 11 delete in `finally` an id the case created, even when it already deleted
  it: cleanup that tolerates a second delete.
- TC-PETREV-13 takes its pet through `requireData`, which skips with a reason; the defect is the
  write, not the precondition.

## Keeping this in sync

`node --test scripts/__tests__/agent-review-fixtures.test.mjs` checks that the catalogue of the
agent and the markers name the same checks, that the expected findings above match the markers
case by case, that the verdicts follow from the severities, that the registry parses and covers
every case, and that no linter reports anything here. A new check in the agent needs a seed here
and a row above.
