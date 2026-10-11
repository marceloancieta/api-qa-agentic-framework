# Lessons learned

Field experience from testing large production APIs with agent-assisted QA, written down as the design
principles of this framework. Each entry names a failure mode that is easy to miss, explains why it
happens, and points to the part of the framework that guards against it (**Guarded by**). A principle
kept only in prose tends to be forgotten at the moment it matters, so wherever possible the guard is a
check rather than a sentence.

Normative principles become rules in `.claude/rules/` (E5). Work they imply is tracked in
[`backlog.md`](backlog.md) by the `L-NN` id.

## The central idea

> **False assurance is the most expensive defect a QA framework can have.** A gate pointed at the
> wrong input, an assertion with no failing branch and a report that announces work which never happened
> all look like protection. Most entries below are variations of that one problem.

---

## A. Checks and gates

**L-01 - Distinguish "not evaluated" from "passed".** When a rule cannot read what it is supposed to
judge (input on stdin, a missing file, a command it cannot parse), the honest outcome is a warning or a
refusal, never a silent pass. *Guarded by:* `git-policy` fail-closed branches; `secret-scan` refusing to
run without gitleaks.

**L-02 - Drift detection needs the live source.** Comparing two local artifacts with each other can
only show that they agree, not that the API still matches them. *Guarded by:* `swagger-digest --live`
(E2) on a daily schedule (E8).

**L-03 - Test the checkers themselves, in both directions.** Every linter ships fixtures that contain
the defect and look-alike code that is correct, and its self-test expects exactly the right findings.
Noisy checks get ignored, so precision matters more than catching every variant. *Guarded by:*
`--self-test` per linter, run in `gates`.

**L-04 - Verify writes to external systems by reading them back.** A client library may report success
while the server stored something else, replaced a whole collection instead of merging into it, or
attached far more than intended. Compare the stored state for equality after each write. *Guarded by:*
adapter contract tests (E4).

**L-05 - Never discard data quietly.** Filtering invalid results is fine; doing it without saying so
hides the problem the filter exists for. Report every excluded item and how to fix its cause.
*Guarded by:* adapters and gates listing each exclusion.

**L-06 - Audit with several independent signals.** Stale work items surface differently: a closed
ticket, wording that says the work is finished, or the delivered artifact already existing. Any single
signal misses items the others catch. *Applies to:* backlog audits, `cited-status` (E3).

## B. Facts and documentation

**L-07 - Give each shared fact a single home.** Copies of a value drift as soon as one of them is
corrected. Other documents link to the owning file instead of repeating it. *Guarded by:* the
fact-ownership table and `lint-docs` fact checks (E3).

**L-08 - Compute numbers; do not write them by hand.** Totals, coverage figures and partitions maintained
manually diverge quickly and silently. A script produces them and the documents cite the script.
*Guarded by:* `derive-floor`, `coverage-status`, generated tables.

**L-09 - A new artifact is not done until something points to it.** An unlisted rule is never loaded by
the agent, and an unlinked reference is never read. *Guarded by:* `lint-docs` orphan checks (E3).

**L-10 - Changing a policy includes changing everything that applies it.** Updating the instruction while
the executing skill keeps the old behaviour produces two truths. Each policy lists its implementers so
they change in the same commit. *Guarded by:* the propagation table in `.claude/rules/documentation.md` (E5).

**L-11 - Statements about other systems go stale.** "Waiting for ticket X" stays in the text long after
X is resolved. Such statements sit next to their key in a form a scheduled check can re-read and flag
when the state changes. *Guarded by:* `cited-status` against the configured tracker (E3, opt-in).

**L-12 - Validate structure before content, and statuses against an enum.** A malformed table row
shifts its columns, so a content check reads the wrong cell; a list of "closed" words misses the word
nobody anticipated. *Guarded by:* `lint-docs` backlog checks (E3).

## C. Test harness (Playwright)

**L-13 - Arm an expected failure at the last possible moment.** `test.fail()` accepts any error as the
expected one, including network, authentication or data problems. Assert the preconditions first and
arm immediately before the action under test. *Guarded by:* `lint-harness` `xfail-armed-early` (E3).

**L-14 - Expected failures expire and must be re-checked.** Once the underlying defect is fixed, the
case starts failing in a way nobody is watching. Tag and arm must agree, the arm carries its defect
link through one helper, and a daily lane executes them one per Playwright process, so a single
result cannot mask the others. A case that starts passing is investigated before the arm is removed, because the
reproduction may have broken for reasons unrelated to the defect. *Guarded by:* `knownGap()` (E1), `known-gap-untracked`
and `known-gap-lane` (E3).

**L-15 - Teardown verdicts must stay visible.** An armed expected failure also absorbs an error raised
while restoring state. Restore results are reported through a channel the arm cannot swallow.
*Guarded by:* resource guard reporting (E1).

**L-16 - Establish a test's identity before anything can skip it.** If metadata is set after a skip,
reporters fall back to defaults and the published case is misfiled or duplicated. *Guarded by:*
`lint-harness` `metadata-after-skip` (E3).

**L-17 - An aborted serial block leaves anonymous results.** Tests that never start emit results with
no business identity. They are removed at the upload boundary and listed by name. *Guarded by:*
adapter input validation (E4).

**L-18 - Parallelism is per file, so shared mutable data needs a plan.** `mode: serial` orders tests
within a file only; a test in a different file can still change the same record. Prefer data each test creates for itself;
when sharing is unavoidable, run the mutating tests in a dedicated serial lane. *Guarded by:* builders
and self-provisioned data (E1), `shared-fixture-mutation` (E3).

**L-19 - Watch for assertions that cannot fail.** A check wrapped in the condition it should detect
(`if (valid) { expect(...) }`), or a comparison between values in different formats, always passes.
*Guarded by:* `lint-harness` `optional-assertion` and normalization checks (E3).

**L-20 - Watch for assertions that pass by coincidence.** A check that a field "stays as it was when not
sent" proves nothing when the stored value happens to be the default. Set a non-default value first. *Applies to:* design skill and
spec reviewer (E5, E7).

**L-21 - The title is a claim; the body must prove that claim.** A test can describe one behaviour and
assert another. *Guarded by:* the `api-spec-reviewer` agent comparing title and assertions (E7).

**L-22 - Derive case identity from a business key.** Default identities hash the file path and describe
blocks, so moving or renaming code creates duplicates. Use `<service>-<version>-<case id>`, which also
keeps ids unique across API versions. *Guarded by:* `caseIdentity` (E1) and an identity-format check (E3).

**L-23 - Command-line flags can change what gets recorded.** `--reporter` replaces the configured
reporters, and `--list` emits placeholder results without running setup. The configuration guards
against both and adds extra reporters through environment variables. *Guarded by:*
`playwright.config.ts` (E1).

**L-24 - Keep spec modules free of I/O at import time.** An exception during import aborts collection of
the whole lane and reports zero tests rather than a failure. *Guarded by:* `lint-harness` (E3).

**L-25 - Assert on records you own.** Counting rows in a shared table is affected by any concurrent
writer. Identify your own records and assert on those. *Applies to:* design skill, spec reviewer (E5, E7).

**L-26 - Every workaround names its reason and its exit.** Code that compensates for an external defect cites
the defect key and the condition for removing it; if the defect will never be fixed, the comment says
the workaround is permanent. *Guarded by:* `cited-status` reading "until X ships" phrasing (E3).

**L-27 - Control randomness and time.** Unseeded random data and fixed sleeps are leading causes of
flaky tests. Fixtures supply a seeded generator and a controllable clock, and the seed is printed when
a test fails. *Guarded by:* RNG and clock fixtures (E1), anti-flake lane (E3).

## D. Contract and drift

**L-28 - Assume the contract changes without notice.** Fetch the spec on a schedule and keep a tracked
digest so every change appears as a reviewable diff. *Guarded by:* `swagger-digest` and the drift job
(E2, E8).

**L-29 - Fingerprint every constrained element.** A digest limited to body properties misses parameter
constraints and response-code changes, and probes generated only from bodies miss path and query
parameters. *Guarded by:* the normalized model (E2) feeding both digest and probes.

**L-30 - Behaviour can change through description text alone.** Ignoring descriptions removes noise but
also hides a semantic change stated only in prose. Report operation description changes as their own
low-severity drift category. *Guarded by:* digest (E2).

**L-31 - A contract change triggers the affected tests.** Diffing the spec is not enough; the published
cases touching changed operations must run, and ordinary published cases need periodic re-runs as well.
*Guarded by:* published-case lane (E3, E8).

**L-32 - Specs can contain invalid content.** A malformed regular expression must not crash the tooling;
report it and continue. *Guarded by:* normalizer (E2).

**L-33 - Check declared response codes in both directions.** Each declared code should be reachable, no
undeclared code should be returned, and declared descriptions may themselves be wrong. *Guarded by:*
`declared-codes` and designed cases (E2, E5).

**L-34 - Behaviour shared by all endpoints needs probes on all endpoints.** Malformed or truncated JSON,
wrong content types and path-parameter validation are handled by shared layers, so one endpoint's test
says little about the rest. *Guarded by:* service-wide probe battery (E2).

**L-35 - An error status does not prove that nothing changed.** A write can succeed and still return a
server error. After an error on a write, verify the resulting state. *Applies to:* design skill,
builders and flows (E1, E5).

**L-36 - Take literal values from the contract.** Hand-picked values can be illegal and turn a correct
rejection into a false finding; hand-maintained type unions drift. Derive values and types from the
spec. *Guarded by:* `derive-value-sets` and generated types (E2).

**L-37 - A wrong stored value has siblings.** Code that mishandles one field usually mishandles fields
sharing its code path. Before filing or closing, find every operation that stores that field or a
similar one, and check them too.
*Applies to:* design and report-bug skills (E5).

**L-38 - Complete the contract before designing cases.** Gaps in the spec get filled from the strongest
available source (models, implementation, documentation, the owner), and open questions are recorded
instead of guessed. *Applies to:* intake skill (E5).

## E. Data, evidence and secrets

**L-39 - Tests that modify shared data must restore it, always.** Restore runs in `finally`, reads the
current state first and repairs only real differences, never throws over the original failure, and
never counts on the API refusing the request, since that refusal is the behaviour under test. Creating
dedicated data avoids the issue. *Guarded by:* `withResourceGuard` and builders (E1).

**L-40 - Missing data is a visible skip, and data promises are verified.** A silent skip reports green
while testing nothing; checking that a fixture exists says nothing about the state it must be in.
*Guarded by:* fixtures that warn on skips and verify declared state (E1).

**L-41 - Keep real identifiers out of the repository.** Use placeholders in designs and specs and inject
real values at run time. Reserved fictional values (RFC 2606 domains, fictional number ranges) avoid
the need for allow-lists, which become loopholes. *Guarded by:* `lint-suite` (E3).

**L-42 - Evidence means the whole response, redacted.** A status code alone cannot be reviewed later.
Masking by key name misses identifiers that are not secrets but still point to another party's data,
so the redaction helper also accepts a project-defined list of identity fields. *Guarded by:* `evidence` and `redact` helpers (E1).

**L-43 - Missing configuration fails immediately and by name.** In CI, a broken secret binding yields an
empty variable that fails far from its cause. Entry points assert required variables up front, tokens
are never passed on a command line, and error output is sanitized. *Guarded by:* environment
assertions in tooling (E1, E4).

## F. Tooling and process

**L-44 - Run hooks without a shell.** Shell-based hooks depend on a working shell on every machine,
which endpoint-security software can break. Exec form avoids that dependency. *Guarded by:* ADR 0005,
hooks README.

**L-45 - Generated files use LF.** Generators compare output byte for byte, so line-ending conversion on
checkout makes unchanged files look stale, and an always-red check stops being read. *Guarded by:*
`.gitattributes`.

**L-46 - Tools that call services must be resilient.** Retry `429` and `5xx` with backoff, make close
and finish operations idempotent, read identifiers from structured output, lock against concurrent
local runs, and scope operations to what changed instead of rereading everything. *Guarded by:*
adapter base and contract tests (E4).

**L-47 - Rendering can alter text.** Angle-bracket placeholders in Markdown prose may be interpreted as
HTML and disappear, and conversions between markup dialects lose formatting. Wrap placeholders in code
spans and read rendered output back. *Guarded by:* metadata helper (E1), adapter read-back (E4).

**L-48 - Make tool actions traceable.** Every tool line carries a timestamp and a shared run identifier,
so a test run, its publication and any tracker update can be tied together afterwards. *Guarded by:* tooling log format (E4).

**L-49 - A gate only counts if failure blocks.** Checks that exist but are not wired into CI, or wrapper
scripts that return a different command's exit code, let failing work through. *Guarded by:*
`npm run gates` in CI and pre-push (E0, E8); `exitCodeOf` and the exit-code tests of every
wrapper, with `package-scripts.test.mjs` (CI-04).

## G. Defects and reporting

**L-50 - The validating layer determines the error format.** Framework-level request validation and
handler-level business validation often answer with different envelopes and content types. Each service
pack documents its envelopes; negative tests assert the reported field (tolerating different name
spellings) rather than message text, and validate the envelope unconditionally. *Guarded by:* error
envelope catalog and helper (E1, E5).

**L-51 - Scope a defect by where it will be fixed.** Filing the same root cause once per endpoint creates
duplicates; grouping separate fixes under one ticket leaves it half-closed. The level (endpoint,
operation group, component, global) follows a shared cause, not a similar symptom; broader tickets list
every operation they cover; a wider scope found later updates the existing ticket. *Guarded by:*
bug-reporting reference and report-bug skill (E5).

**L-52 - Class and severity are separate judgements.** Mapping one to the other fails in both
directions. Classify by observable effect; rate severity by impact, reach and recoverability, and keep
it independent of the ticket's resolution. Calibrate new ratings against existing ones. *Guarded by:*
defect rubric, report-bug skill, adapter labels (E4, E5).

**L-53 - Compare states field by field, by category.** Timestamps and generated ids break naive
comparisons. Treat fields as identity (equal), business state (asserted), provenance (shape only) or
volatile (freshness or order only); never assert a generated id literal; take ids from the response
that created them; compare related resources by count and identity. *Guarded by:* state-comparison
helper (E1).

## H. Test design method

**L-54 - Closed value sets may be written as patterns.** A spec can declare no `enum` and still restrict
values through anchored alternation in `pattern`. Plain alternatives form a value set (invalid-value
negatives); patterns with classes, escapes or quantifiers describe a format (boundary values).
*Guarded by:* `derive-value-sets` and the floor's value-set detection (E2).

**L-55 - The case floor is a minimum on one axis.** The floor is computed from the contract and is
reproducible. Cases coming from source analysis, equivalence or risk are counted on a separate axis so
coverage ratios keep their meaning. *Guarded by:* `derive-floor` and the registry header (E2, E5).

**L-56 - Observe instead of inventing.** When no source defines a constraint, record what the API does
with a behaviour-defining probe and review that observation as the baseline. *Applies to:*
contract-analysis reference (E5).

**L-57 - Reserve `blocked` for cases that cannot execute.** A case failing on a known defect still runs,
reports and publishes as a known gap. `blocked` (with a filed key) means there is nothing to call or no
possible data. Overusing it hides real coverage. *Guarded by:* registry lifecycle rule and
`coverage-status` (E3, E5).

**L-58 - Keep design and execution separate.** Design measures read-only and produces reviewed
artifacts; execution runs suites and posts results. A request mixing both is split and handled in
order. *Guarded by:* the mode rule in `CLAUDE.md` (E5).

**L-59 - Some records break a read for everyone.** A single malformed record, created by any caller,
can make a shared read fail for every other caller until it is removed, and sometimes no API call
can remove it. A case that reproduces such a defect is not just mutating, it is destructive: it
cannot share a run with other cases, and the run must end by restoring the service. Find these at
intake, with writes measured against data the run creates, before any suite depends on the broken
read. *Guarded by:* the `@destructive` tag (E6); `destructive-lane`, `destructive-recovery` and
`destructive-isolation` (GATE-12).

**L-60 - Parallel agents need disjoint data.** Agents that run against the same environment at the
same time can each mistake the other's records for leftovers, and one of them deleted a record
outside the range it was given. Give each agent its own id range or name prefix, and let it delete
only the ids its own create responses returned, never records it found by listing or searching.
*Guarded by:* the `spec-author` launch prompt and `qa-automate` (E7).
