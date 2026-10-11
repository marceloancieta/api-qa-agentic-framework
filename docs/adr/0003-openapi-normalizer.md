# 0003 - One OpenAPI normalizer for Swagger 2.0, OpenAPI 3.0 and 3.1

**Status:** Accepted (2026-10-08)

## Context

Contract tooling (digest, floor derivation, probe matrix, value sets, declared codes) must work for
the spec versions real APIs publish. Each tool parsing raw specs would multiply version handling.

## Decision

`scripts/lib/openapi.mjs` turns Swagger 2.0, OpenAPI 3.0.x and 3.1.x (JSON or YAML) into one internal
model: schemas, request bodies (including 2.0 `body`/`formData`), responses, parameters, nullability
(`x-nullable` / `nullable` / `type: null`), servers vs `host` + `basePath`, security schemes and
`allOf`/`oneOf`/`anyOf`. Every tool reads the model, never the raw spec. Any other version is
rejected with an explicit error, never processed partially. Response validation reads the same
model: every version is first converted to JSON Schema 2020-12 and checked with `ajv/dist/2020`.

A self-test asserts that the same resource described in 2.0 and in 3.0 yields the same model, floor
and probes.

## Consequences

- New spec versions are supported in one place.
- The compatibility table in the README is backed by fixtures, not claims.
