---
name: qa-intake
description: >-
  Phase 0 of API test work. Turns an API's OpenAPI contract, plus an optional issue or intake request,
  into a feature contract doc at services/<pack>/docs/features/<feature>.md that the design phase
  reads. Use when the user asks to start QA for an endpoint or feature, to "intake" something, to
  analyse what an endpoint really does, or names endpoints of a pack that has no contract doc yet.
  Completes the contract from other sources, measures behaviour with read-only calls, records gaps
  and open questions, then waits for review. Designing cases, writing specs and test-management
  calls belong to later phases.
---

# qa-intake: write the feature contract

**Mode: design** (`.claude/rules/modes.md`). Read-only calls to the API are allowed and expected.
Write requests are not.

## Inputs

- The pack (`.claude/rules/service-packs.md`) and its contract `services/<pack>/openapi.json`, or the
  live `spec_url` with `--live`.
- Optional: an issue key (read it with `npm run tracker -- get <KEY>`), or an intake request written
  from [the intake template](../../../docs/templates/intake.md).
- The pack's skill `.claude/skills/<pack>-api/SKILL.md`, if there is one, and
  `services/<pack>/docs/contract-notes.md`.

## Steps

1. **Pin the scope.** List the endpoints as `METHOD /path` and check each one exists in the contract
   (`node scripts/swagger-digest.mjs --service <pack>` prints the digest without writing it). A
   requested endpoint or feature that the contract does not have is reported as such. Stop and ask:
   never design for an operation that does not exist, and never quietly swap in a similar one.
2. **Check reachability** of what you are about to call (`.claude/rules/reachability.md`).
3. **Read the contract** for these endpoints: parameters, bodies, responses, declared errors, security.
   Run `npm run contract:value-sets`, `npm run contract:floor` and `npm run contract:probes` for
   the pack and keep their output: they are the computed part of the analysis.
4. **Complete the contract** with the source order in
   [contract analysis](../../../docs/references/contract-analysis.md#completing-a-constraint).
   For every constraint the spec leaves open, record which source answered. A completion that
   contradicts the spec is a drift candidate (L-38).
5. **Measure, read-only.** Probe what the spec cannot tell you with safe calls (`GET`, `HEAD`,
   `OPTIONS`) through a throwaway script in the scratchpad that reads credentials from the
   environment. Record each measurement with its request and date. A measurement outranks a reading
   of the spec, and the doc says where they differ. Behaviour of writes is left marked
   **unmeasured**. If it matters before design, propose an execution-mode run against data that
   run creates (`qa-run`), and write its result back here.

   A discrepancy that needs more than a quick look (inputs to vary, sources to compare, records to
   search) goes to a `contract-investigator` agent, one per discrepancy, launched in parallel when
   there are several. It measures read-only and returns a report; you write its conclusion into the
   doc with its measurements, and decide nothing on its behalf.
6. **Search the tracker for every gap as you write it down**
   (`npm run tracker -- search <words>`, a few distinctive words such as the path and the status
   seen), and record the key or "searched, none". Even a probable defect is only recorded as a gap
   here; `qa-report-bug` decides about filing.
7. **Write** `services/<pack>/docs/features/<feature>.md` from
   [the feature contract template](../../../docs/templates/feature-contract.md). Agree the feature
   code with the user the first time (`.claude/rules/registry.md`). Link the new doc from the pack
   README so it is not an orphan.
8. **Review gate.** Show the doc, the gap list and the open questions, and wait for approval.
   Unanswered questions stay in "Assumptions to confirm"; they are never resolved by guessing.
9. **Hand off** to `qa-design` with the endpoint count, rule count, gaps and the file path.

## If it stops halfway

Delete probe scripts. Nothing was written to the API, so the only state is the draft doc: keep it,
marked as a draft at the top, or remove it if the user abandons the feature.

## Do not

- Send `POST`, `PUT`, `PATCH` or `DELETE`, in a probe or anywhere else.
- Design cases, write specs, or touch the test-management tool.
- File issues. Put real identifiers, personal data or credentials in the doc.
