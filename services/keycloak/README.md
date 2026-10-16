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

```sh
npm run keycloak:up
npx playwright test --project=api-keycloak
```

The contract is the OpenAPI document Keycloak publishes for the release; the container does not
serve it, so `spec_url` is the published one.

## Features

| Feature | Contract | Registry |
|---|---|---|
| `USERS` | [users](docs/features/users.md) | not yet designed |

Where the API departs from its contract is recorded in
[`docs/contract-notes.md`](docs/contract-notes.md).
