# Keycloak Admin REST API: contract notes

Observed departures from the published contract, one entry per finding, each with its status and,
when filed, its issue key. Written by the phases (`qa-intake` measures, `qa-run` observes). Empty
until the first intake.

Each entry is a row of the table below, with an id `<PREFIX>-NN` that keeps for good. Choose a
prefix for this pack that no other pack uses and that is not an id family of the repository (`L`,
`TC`, `REQ`, the backlog prefixes such as `CI` or `GATE`); the example packs use `PN` and
`VN`. `lint-docs` checks every cited id against this table.

**Status:** `untracked` (observed, no issue yet) · `tracked` (issue filed, key given) · `by-design`
(a difference to tolerate, not a defect).

| Id | Observation | Reproduce | Kind | Status |
|---|---|---|---|---|
