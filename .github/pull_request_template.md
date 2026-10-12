<!--
Title: `type(scope): <BACKLOG-ID> summary` (ADR 0008). It becomes the commit subject on main after the
squash merge, and the `title` check rejects any other shape. One logical change per pull request.
-->

## Backlog item

<!-- The item this change delivers, as in docs/backlog.md, for example `TM-08`. A finished item
moves to Done with its closing commit in a follow-up change. -->

## What changes and why

## How it was checked

- [ ] `npm run gates` passes locally
- [ ] New or changed checks come with fixtures and look-alikes, and their self-test expects exactly those findings
- [ ] Docs changed with the behaviour they describe; facts link to their owner (`.claude/rules/documentation.md`)
- [ ] No credentials, real hosts or personal data (placeholders and builders only)

## Notes for the reviewer
