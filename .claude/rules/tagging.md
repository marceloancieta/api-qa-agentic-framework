---
paths:
  - 'services/**/specs/**'
  - 'services/*/registry/**'
  - 'scripts/lib/tags.mjs'
---

# Tagging

Tags select lanes (`--grep @smoke`) and filter results in the test-management tool. Allure copies
every Playwright tag to the result, so a tag is written once: in the test title or in
`{ tag: [...] }`, on the test or on a describe around it.

The list lives in `scripts/lib/tags.mjs`. `npm run lint:harness` (tag-taxonomy) reports any other
tag, and a designed case (title starting with `TC-<FEATURE>-NN`) without exactly one layer tag. To
add a tag, change that file and this table in the same commit; a test keeps them equal.

| Tag | Axis | Applies when |
|---|---|---|
| `@smoke` | layer | the case proves a critical path works: the main read and write of a resource, authentication |
| `@sanity` | layer | the case proves an operation answers and its body has the declared shape |
| `@regression` | layer | everything else: negatives, boundaries, security, integrity, performance |
| `@security` | category | authentication, authorization (BOLA, function level), injection, unknown fields, declared versus honored, exposure |
| `@performance` | category | a latency or size budget, pagination limits, light concurrency |
| `@data-integrity` | category | the case reads state back: round trips, preserved fields, cascades, state after an error |
| `@contract-drift` | category | the case documents a difference between the contract and the service |
| `@known-gap` | category | the case is armed with `knownGap(key, why)` because an open issue keeps it red |
| `@quarantine` | category | the flake lane confirmed the case is flaky; gate lanes leave it out until the linked fix lands |

Rules of thumb:

- **Severity does not choose the layer.** A critical negative is still `@regression`; its weight
  lives in the case's priority and severity.
- **Tags describe the code as written**, whatever the registry planned. A case that does not read
  state back is not `@data-integrity`.
- **`@known-gap` and the arm go together.** The tag without `knownGap()` in the body, or the arm
  without the tag, is a lint finding (L-14). Arm right before the action (L-13).
- **A workaround names its exit.** Code that compensates for someone else's defect says which issue
  it waits on and what has to become true to remove it, in a form `npm run cited:status` can read:
  "until `<KEY>` ships". If the issue closes as won't fix, rewrite the comment, either to point at
  what will change instead or to say the workaround is permanent (L-26).
