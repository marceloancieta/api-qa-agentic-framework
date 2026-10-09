# API QA Agentic Framework

An agentic API QA framework: OpenAPI-driven test design, Playwright + TypeScript execution,
pluggable test-management adapters, and Claude Code skills and guardrails.

> **Status: under construction.** This README is a placeholder; full documentation lands with v0.1.0.
> Architecture decisions are recorded in [`docs/adr/`](docs/adr/README.md).

## Requirements

- Node.js >= 22
- Docker (for the example API, Swagger Petstore v3)
- [gitleaks](https://github.com/gitleaks/gitleaks) (pre-commit secret scan)

## Quick start

```sh
npm ci
npm run hooks:install          # pre-commit secret scan, commit-msg scan, pre-push gates
cp qa-config.example.json qa-config.json
cp .env.example .env
npm run petstore:up            # http://localhost:8080/api/v3
npm run gates
npm test                       # unit tests, preflight, then every API spec
```

## Running tests

| Command | Runs |
|---|---|
| `npm test` | Every Playwright project: `unit`, `preflight`, `api`. |
| `npm run test:unit` | Core unit tests only. No network; part of `npm run gates`. |
| `npm run test:smoke` | Cases tagged `@smoke`, after the preflight. |

The `preflight` project checks the variables named by `api.auth` and that the API host answers,
then the `api` project runs. When it fails, no API case runs. Add `--no-deps` to skip it.
`QA_ENV` picks the environment and `API_BASE_URL` overrides its URL. Each API call is attached
to its test as redacted evidence. Results go to `allure-results/` and `playwright-report/`.

## Contract tooling

The `contract:*` scripts read the API description (Swagger 2.0, OpenAPI 3.0 or 3.1) and report
contract drift, probe coverage, value sets, the minimum number of cases per operation, and declared
versus observed response codes. See [`docs/contract-tooling.md`](docs/contract-tooling.md).

## Quality gates

`npm run gates` runs the linters (harness, test data, docs) with their self-tests, the contract and
coverage checks and the unit tests. Lanes for known gaps, published cases and flakiness, the quality
gate and mutation testing run on demand. See [`docs/quality-gates.md`](docs/quality-gates.md).

## Example service pack

[`services/petstore/`](services/petstore/README.md) runs the framework against Swagger Petstore v3
in Docker. It is both the template for a new pack and a worked example: its
[contract notes](services/petstore/docs/contract-notes.md) list real departures from the published
contract that the suite surfaced.

## License

[Apache License 2.0](LICENSE). See [NOTICE](NOTICE).
