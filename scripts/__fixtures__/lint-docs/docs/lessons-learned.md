# Lessons

Work is tracked in the [backlog](backlog.md).

## A. Checks

**L-01 - Named guards exist.** *Guarded by:* the `clock` helper and `makeClock()` (E1);
`npm run gates`; `--self-test`; `tidy-rule`; a `CHANGELOG.md` entry.

**L-02 - Future guards wait for their stage.** *Guarded by:* `lint-fixture` (E2),
`scripts/quality-gate.mjs` and `.gitignore`.

**L-04 - A skipped number.** *Guarded by:* the `calendar` helper <!-- expect-finding: count-claim, lesson-guard -->
and `makeClock()` (E0.5, E1).

**L-05 - A guard with no stage must exist now.** *Guarded by:*
`npm run missing-script`. <!-- expect-finding: lesson-guard -->

**L-06 - Skills and tags are guards.** *Guarded by:* the `demo-phase` skill, the `@demo` and
`@demo-tag` tags (E1).

**L-07 - A missing skill or tag is reported.** *Guarded by:* the `ghost-phase` skill (E1); <!-- expect-finding: lesson-guard -->
the `@ghost-tag` tag (E1). <!-- expect-finding: lesson-guard -->

**L-05 - A repeated number.** <!-- expect-finding: count-claim -->
*Applies to:* `nothing-checked` (E1).
