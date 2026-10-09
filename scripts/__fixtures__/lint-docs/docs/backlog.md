# Backlog

Origins cite [lessons](lessons-learned.md) (`L-01`, `L-04..L-05`); decisions are in ADR 0001.
A range with a missing lesson: L-01..L-03. <!-- expect-finding: count-claim -->
A cited decision that does not exist: ADR 0009. <!-- expect-finding: adr-index -->

**Stages:** E1 core · E2 tools · E3 extras.

## E1 - Core

Complete: CORE-01 to CORE-02 are in **Done**.

## E2 - Tools

| Id | Item | Origin | Status |
|---|---|---|---|
| TOOL-01 | Build `scripts/quality-gate.mjs` and a CHANGELOG. | L-01 | todo |
| TOOL-02 | A status outside the enum. | L-02 | done | <!-- expect-finding: backlog-row-shape -->
| TOOL-03 | Too few cells. | todo | <!-- expect-finding: backlog-row-shape -->
| tool-4 | A lowercase id. | exp | todo | <!-- expect-finding: backlog-row-shape -->
| E3 | Stage ids belong in Done. | exp | todo | <!-- expect-finding: backlog-row-shape -->
| TOOL-01 | A repeated id. | exp | todo | <!-- expect-finding: backlog-row-shape -->
| TOOL-05 |  | exp | blocked | <!-- expect-finding: backlog-row-shape -->
| TOOL-06 | Accepts \| inside a cell. | exp | wont-do |
| SUB-X1-07 | A compound id. | exp | in-progress |
| OLD-01 | Open here and closed below. | exp | todo |

## E3 - Extras

Complete: EXT-01 to EXT-03 are in **Done**. <!-- expect-finding: count-claim -->

---

## Done

| Id | Item | Closed by |
|---|---|---|
| E0 | Scaffold; ADRs 0001-0002. | `abc1234` |
| E0.5-a | First part of a half stage; ADRs 0003-0006. | `abc1234`, `def5678` | <!-- expect-finding: count-claim -->
| CORE-01 | First. | `abc1234` |
| CORE-02 | Second. | `abc1234` |
| EXT-01 | First extra. | `abc1234` |
| EXT-02 | Second extra. | `abc1234` |
| EXT-04 | Outside the claimed range. | `abc1234` |
| OLD-01 | Closed while still open. | `abc1234` | <!-- expect-finding: backlog-row-shape -->
| MISC-01 | Not closed by a commit. | soon | <!-- expect-finding: backlog-row-shape -->
