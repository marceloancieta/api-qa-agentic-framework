# Fixture repository

Links that resolve: [guide](docs/guide.md), [a section](docs/guide.md#getting-started),
[the repeated heading](docs/guide.md#notes-1), [decisions](docs/adr/README.md),
[the decisions folder](docs/adr/), [demo pack](services/demo/README.md "Demo"),
[backlog](docs/backlog.md), [top](#fixture-repository) and [a site](https://example.org/gone.md).

A dead link: [gone](docs/gone.md). <!-- expect-finding: dead-link -->
A dead anchor: [nowhere](docs/guide.md#no-such-heading). <!-- expect-finding: dead-link -->
Outside the tree: [up](../../outside.md). <!-- expect-finding: dead-link -->
A code span is not a link: `[gone](docs/gone.md)`.

```md
[fenced](docs/also-gone.md) and `helpers/fenced.mjs` are not checked.
```

Paths that exist: `helpers/clock.mjs`, `docs/adr/`, `package.json`, `clock.mjs`, `adr/0001-first.md`.
A path that does not: `helpers/calendar.mjs`. <!-- expect-finding: dead-path -->
A file name found nowhere: `calendar.mjs`. <!-- expect-finding: dead-path -->
Not paths to check: `services/<name>/README.md`, `out/report.json`, `settings.local.json`,
`--root`, `api.base_url`, `docs/*.md`, `NNNN-title.md`, `docs/{name}.md`, `GET /demo`.
Planned: `scripts/quality-gate.mjs` is named by an open row; `helpers/rules/` lands later (E2).
