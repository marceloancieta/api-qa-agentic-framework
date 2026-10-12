# Feature contract template

The document the `qa-intake` skill writes for each feature, at
`services/<pack>/docs/features/<feature>.md`. Design reads it, and its registry names it in the
`contract` header. Copy everything below the line. Every statement cites where it came from: the
spec, a source from the completion order in
[contract analysis](../references/contract-analysis.md#completing-a-constraint), a measurement, or an
assumption marked as one.

---

# `<Feature title>` contract

| | |
|---|---|
| Pack and version | `<pack>` `<version>` |
| Feature code | `<FEATURE>` (case ids `TC-<FEATURE>-NN`) |
| Endpoints | `<METHOD /path>`, one per line |
| Sources | the contract URL or file, issues, documents |
| Intake date | `<YYYY-MM-DD>` |

## Endpoint contract

Per endpoint: parameters (where, required, constraints), the request body, the responses and their
schemas, the declared error codes. Link to the schema rather than copying it. Mark each constraint
that came from somewhere other than the spec, and name the source.

## Business rules

A numbered list. Each rule cites its source. Requirement ids (`REQ-<FEATURE>-NN`) go in the
registry header and point back here.

## Acceptance criteria

Given, when, then.

## Access and ownership

Credentials required, roles per operation, and every path or body identifier that must be checked
against the caller (BOLA). Which actors the cases need (`default`, `anonymous`, names from the
pack's `actors` in qa-config).

## Edge and negative cases

Missing and malformed input, values outside sets, boundaries, unknown fields, behaviour that a
shared layer applies to every operation.

## Test data

The placeholders the cases use (`<PET_ID>`), what each one stands for, and how a case gets it:
created by a builder, or read from shared data under a resource guard. No real identifiers.

## State transitions

Allowed and refused moves, and the repeats that must be idempotent.

## Measurements

What read-only probes showed, each with the request and the date. A measurement outranks a reading
of the spec, and the doc says so where they differ.

## Gaps and discrepancies

| # | Gap | Source | Issue |
|---|---|---|---|
| G1 | what differs or is unknown | where it was seen | the tracker key, or "searched, none" |

Search the tracker for each gap when you write it down, not later when you file it.

## Out of scope

## Assumptions to confirm
