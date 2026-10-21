# Service pack: keycloak

Keycloak Admin REST API, version `v26`, scaffolded on 2026-10-16 by `npm run scaffold:service`.
The layout and the layers follow `services/petstore/`, the worked example.

## Resources

| Resource | Client | Fixture | Operations | Suggested code |
|---|---|---|---|---|
| `Realms Admin` | `clients/realms-admin-client.ts` | `realmsAdmin` | 45 | `REALMS` |
| `Attack Detection` | `clients/attack-detection-client.ts` | `attackDetection` | 3 | `ATTACK` |
| `Authentication Management` | `clients/authentication-management-client.ts` | `authenticationManagement` | 39 | `AUTHEN` |
| `Client Registration Policy` | `clients/client-registration-policy-client.ts` | `clientRegistrationPolicy` | 1 | `CLIENT` |
| `Client Scopes` | `clients/client-scopes-client.ts` | `clientScopes` | 10 | `CLIEN2` |
| `Protocol Mappers` | `clients/protocol-mappers-client.ts` | `protocolMappers` | 21 | `PROTOC` |
| `Scope Mappings` | `clients/scope-mappings-client.ts` | `scopeMappings` | 33 | `SCOPEM` |
| `Clients` | `clients/clients-client.ts` | `clients` | 35 | `CLIEN3` |
| `Client Initial Access` | `clients/client-initial-access-client.ts` | `clientInitialAccess` | 3 | `CLIEN4` |
| `admin` | `clients/admin-client.ts` | `admin` | 31 | `ADMIN` |
| `Client Attribute Certificate` | `clients/client-attribute-certificate-client.ts` | `clientAttributeCertificate` | 7 | `CLIEN5` |
| `Roles` | `clients/roles-client.ts` | `roles` | 28 | `ROLES` |
| `Component` | `clients/component-client.ts` | `component` | 6 | `COMPON` |
| `Groups` | `clients/groups-client.ts` | `groups` | 11 | `GROUPS` |
| `Role Mapper` | `clients/role-mapper-client.ts` | `roleMapper` | 18 | `ROLEMA` |
| `Client Role Mappings` | `clients/client-role-mappings-client.ts` | `clientRoleMappings` | 15 | `CLIEN6` |
| `Identity Providers` | `clients/identity-providers-client.ts` | `identityProviders` | 17 | `IDENTI` |
| `Key` | `clients/key-client.ts` | `key` | 1 | `KEY` |
| `Organizations` | `clients/organizations-client.ts` | `organizations` | 36 | `ORGANI` |
| `Roles (by ID)` | `clients/roles-by-id-client.ts` | `rolesById` | 10 | `ROLESB` |
| `Users` | `clients/users-client.ts` | `users` | 34 | `USERS` |
| `Workflows` | `clients/workflows-client.ts` | `workflows` | 9 | `WORKFL` |

Suggested codes are agreed at the feature's first intake and are permanent once a case is published.

## Running it

The pack runs against a local Keycloak 26.7.5 in development mode (`docker-compose.yml`, service
`keycloak`), in memory: stopping or restarting the container discards every write, which is the
pack's `recovery`.

- `realm/qa-realm.json` is the realm `qa` the container imports at start. It has three
  service-account clients whose roles of the `realm-management` client make the authorization
  matrix: `qa-admin` reads and manages users and groups, `qa-viewer` only reads them, and
  `qa-no-role` has no admin role. Access tokens live 60 seconds, so a run renews them.
- The client ids and secrets come from `KEYCLOAK_*_CLIENT_ID` and `KEYCLOAK_*_CLIENT_SECRET`
  (`.env.example`); the realm reads them from the container's environment at import, so no
  secret is written in a file. `npm run keycloak:up` (`up.mjs`) names any that is missing and
  starts the container; `npm run keycloak:down` removes it.
- qa-config's `local` environment has the pack's entry: the admin API at `http://localhost:8180`,
  `oauth2_client_credentials` auth from the realm's token endpoint, and the actors `admin` (also
  the default), `viewer` and `no-role`.
- The container's hostname is fixed to its published URL (`KC_HOSTNAME`), so a token's issuer is
  the same whatever host a request names. Without it, Keycloak derives the issuer from the request,
  and a lane's container, which calls `keycloak:8080`, would get `401` for a token issued on
  `localhost`.

```sh
npm run keycloak:up
npx playwright test --project=api-keycloak
```

The contract is the OpenAPI document Keycloak publishes for the release; the container does not
serve it, so `spec_url` is the published one.

## DAST

`npm run lanes:dast -- --service keycloak` scans the pack with ZAP as the default actor, renewing
its token during the scan ([the DAST lane](../../docs/quality-gates.md#lanes)), and restarts
Keycloak afterwards, which discards what the scan wrote.

- [`dast-exclude.txt`](dast-exclude.txt) keeps the scan to the operations the cases cover: a
  realm's users, their count and one user. The whole Admin REST API does not scan within the CI
  job's time.
- [`dast-params.json`](dast-params.json) gives the realm, `qa`; without it ZAP sends a realm called
  `realm` and every request answers `404`. User ids are generated at import, so the operations on
  one user answer `404`.
- [`dast-rules.tsv`](dast-rules.tsv) fails on injection and code execution, as the VAmPI pack does,
  and warns on a `5xx` (KN-11). [`dast-false-positives.tsv`](dast-false-positives.tsv) holds the
  SQL injection reported on `createdAfter` (KN-10).

## Performance

`npm run lanes:perf -- --service keycloak` sends the pack's `GET` operations with k6, as the
default actor, the admin client ([the performance lane](../../docs/quality-gates.md#performance-lane)).
[`perf.json`](perf.json) gives the realm, `qa`, and keeps out the operations that answer `403` to
that client's roles or `501` for a feature the image does not enable; the rest need an id the realm
generates and are left out with that reason. k6 cannot renew the token, so a run that would outlive
it is refused; with the realm's 60-second tokens, keep `--duration` under about 40 seconds.

## Features

| Feature | Contract | Registry |
|---|---|---|
| `USERS` | [users](docs/features/users.md) | [users](registry/users.md) |

Where the API departs from its contract is recorded in
[`docs/contract-notes.md`](docs/contract-notes.md).
