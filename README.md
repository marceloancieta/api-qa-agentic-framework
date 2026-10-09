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
```

## License

[Apache License 2.0](LICENSE). See [NOTICE](NOTICE).
