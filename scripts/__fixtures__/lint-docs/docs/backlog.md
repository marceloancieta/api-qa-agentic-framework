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

<!-- The hashes are commits of the self-test history, withFixtureHistory() in scripts/lint-docs.mjs:
first aaa916d and second ad35537 on main (HEAD), side f56536b on an unmerged branch. -->

| Id | Item | Closed by |
|---|---|---|
| E0 | Scaffold; ADRs 0001-0002. | `aaa916d` |
| E0.5-a | First part of a half stage; ADRs 0003-0006. | `aaa916d`, `ad35537` | <!-- expect-finding: count-claim -->
| CORE-01 | First. | `aaa916d` |
| CORE-02 | Second. | `ad35537` |
| EXT-01 | First extra. | `aaa916d` |
| EXT-02 | Second extra. | `ad35537` |
| EXT-04 | Outside the claimed range. | `aaa916d` |
| OLD-01 | Closed while still open. | `aaa916d` | <!-- expect-finding: backlog-row-shape -->
| MISC-01 | Not closed by a commit. | soon | <!-- expect-finding: backlog-row-shape -->
| HIST-01 | A full hash in the history of HEAD. | `ad35537df2b62d8e03d4253317fe3b000b033cb9` |
| HIST-02 | A longer prefix of a commit in the history. | `aaa916ddd46c` |
| HIST-03 | A commit that exists on an unmerged branch only. | `f56536b` | <!-- expect-finding: closing-commit -->
| HIST-04 | A commit of no branch, as after a history rewrite. | `0123456` | <!-- expect-finding: closing-commit -->
| HIST-05 | One commit in the history and one outside it. | `ad35537`, `f56536b` | <!-- expect-finding: closing-commit -->
| HIST-06 | A malformed reference is a shape finding only. | `F56536B` | <!-- expect-finding: backlog-row-shape -->
