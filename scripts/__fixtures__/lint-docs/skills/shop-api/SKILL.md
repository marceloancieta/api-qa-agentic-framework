---
name: shop-api
description: Fixture skill of a pack past automate.
---

# Shop

A fact not known yet is marked pending until the phase that fills it; nothing is pending here once
the phases ran, and the word pending in prose is not a marker.

- Environments and shared records: _pending until intake_. <!-- expect-finding: pending-skill-fact -->
- Actors: _Pending until design_. <!-- expect-finding: pending-skill-fact -->
- Builders and guards: _pending until automate_. <!-- expect-finding: pending-skill-fact -->
- From a skill scaffolded before the phases were named: _pending_. <!-- expect-finding: pending-skill-fact -->
- A phase that does not exist: _pending until release_. <!-- expect-finding: pending-skill-fact -->
- A marker quoted in a code span is not a fact: `_pending until automate_`.
- Two facts on one line: _pending until intake_ and _pending until automate_. <!-- expect-finding: pending-skill-fact -->

```md
How a case confirms a write: _pending until automate_ (a fenced example is not read).
```

<!-- A comment holding _pending until automate_ is not read. -->
