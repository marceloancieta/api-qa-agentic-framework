# 0002 - Node/TypeScript as the only runtime

**Status:** Accepted (2026-10-08)

## Context

QA frameworks often grow a mix of runtimes: TypeScript for tests, Python for hooks or spec parsing,
PowerShell for tracker and reporting scripts. Each one is another toolchain every contributor and CI
agent must install, launchers differ by OS (the Windows `py` launcher does not exist on Linux), and
Windows PowerShell scripts do not run on a stock Linux CI agent.

## Decision

Node (>= 22) is the only runtime; Docker is the only other contributor dependency (for the example
API). Tests use Playwright + TypeScript (`@playwright/test`). Hooks and scripts are Node ES modules;
there are no PowerShell or Python scripts. Spec parsing has a single implementation, the OpenAPI
normalizer (ADR 0003), so two parsers can never disagree.

## Consequences

- One toolchain on Windows, Linux, macOS and CI.
- Hook and script tests use the built-in `node:test` runner: no extra test dependency.
