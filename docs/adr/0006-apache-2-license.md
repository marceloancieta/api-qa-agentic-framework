# 0006 - Apache License 2.0

**Status:** Accepted (2026-10-08). Supersedes the MIT license chosen at scaffolding (never published).

## Context

The framework is meant to be adopted by company QA teams and to receive outside contributions. Both
MIT and Apache-2.0 are permissive and compatible with every dependency (all MIT, Apache-2.0, BSD,
ISC or BlueOak).

## Decision

License the project under the Apache License 2.0, with a `NOTICE` file. Apache-2.0 adds what MIT
leaves implicit: an explicit patent grant with a patent-retaliation clause, and section 5, which
covers contributions under the same license without a separate contributor agreement.

## Consequences

- Legal review in adopting organizations is usually faster.
- Redistributors must keep `LICENSE` and `NOTICE` and mark modified files.
