# lint-layers fixture tree

A small repository for `node scripts/lint-layers.mjs --self-test`. Every line the linter must report
carries an `expect-finding:` marker; every other file and line is a look-alike that must stay
silent.

| File | Holds |
|---|---|
| `helpers/pack-import.ts`, `scripts/tool.mjs`, `scripts/lib/deep.mjs` | core imports that reach into `services/` |
| `helpers/allowed.ts`, `fixtures/index.ts` | core code that names pack paths as data, imports a computed path, or opens its own request context |
| `services/demo/fixtures.ts` | pack code, which may use the request fixture to build clients |
| `services/demo/specs/raw.spec.ts` | a spec that sends requests without a client, once per shape |
| `services/demo/specs/clients.spec.ts` | a spec that drives the API through its clients only |

Nothing here is executed or type-checked.
