#!/usr/bin/env node
/**
 * Creates a service pack from an API description (PROC-06, ADR 0007). It runs in two steps so that
 * nothing is written before someone has looked at what was found:
 *
 *   node scripts/scaffold-service.mjs --name <pack> --spec <file|url> [--version v1] [--title t]
 *       [--skip-smoke "GET /path"]...
 *       reads the contract and prints the plan: resources, clients, suggested feature codes,
 *       security, every operation of the smoke spec, the files it would write. Writes nothing.
 *       A parameterless GET is not always safe to call (it may reset data or expose secrets):
 *       `--skip-smoke` leaves one out of the smoke spec, and must name an operation of the contract.
 *   ... --write
 *       writes the pack, its service skill and its generated contract files. Refuses when
 *       services/<pack>/ or the skill already exists: a pack is never overwritten.
 *   ... --write --skill-only
 *       writes only the service skill, for a pack that exists but has none.
 *
 * What it writes:
 *   services/<pack>/service.json, the contract copy, error-envelopes.json (empty catalogue),
 *   README.md, docs/contract-notes.md, clients/ (one client per tag, one method per operation),
 *   fixtures.ts (the pack's test with one fixture per client and actor()), specs/smoke.spec.ts
 *   (when some GET needs no parameter), and .claude/skills/<pack>-api/SKILL.md from
 *   docs/templates/service-skill.md. Then it runs the contract tools to write the digest, the value
 *   sets and the probe matrix, so `npm run contract:check` covers the new pack at once.
 *
 * Nothing in a scaffolded pack asserts behaviour the contract does not declare. Cases come later,
 * through the phases (qa-intake, qa-design, qa-automate).
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { packVariable, REPO_ROOT } from './lib/cli.mjs';
import { normalize, parseDocument } from './lib/openapi.mjs';
import { describeExit, exitCodeOf } from './lib/spawn.mjs';

const NAME = /^[a-z][a-z0-9-]*$/;
const VERSION = /^[a-z0-9][a-z0-9.-]*$/;
const FEATURE = /^[A-Z][A-Z0-9]{1,9}$/;
// Fixture names the core already provides; a client fixture must not shadow them.
const RESERVED_FIXTURES = new Set([
  'request',
  'auth',
  'qa',
  'faker',
  'rng',
  'clock',
  'actor',
  'actorSession',
  'service',
  'contract',
  'envelopes',
  'caseMeta',
  'page',
  'context',
  'browser',
  'playwright',
]);

const words = (text) =>
  String(text)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
const capital = (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
export const pascalCase = (text) => words(text).map(capital).join('') || 'Api';
export const camelCase = (text) => {
  const pascal = pascalCase(text);
  const camel = pascal.charAt(0).toLowerCase() + pascal.slice(1);
  return /^[0-9]/.test(camel) ? `_${camel}` : camel;
};
const kebabCase = (text) =>
  words(text)
    .map((w) => w.toLowerCase())
    .join('-') || 'api';

/** The pack version: an explicit one, a `/v2` segment of the first server, or `v<major>`. */
export function packVersion(model, explicit) {
  if (explicit) return explicit;
  const segment = model.servers
    .map((server) => /\/(v\d+(?:\.\d+)?)(?:\/|$)/i.exec(server)?.[1])
    .find(Boolean);
  if (segment) return segment.toLowerCase();
  const major = /^(\d+)/.exec(model.info.version ?? '')?.[1];
  return major ? `v${major}` : 'v1';
}

/** A short feature code from a resource name, unique among `taken`. */
export function suggestCode(resource, taken) {
  const letters = words(resource)
    .join('')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  let base = /^[A-Z]/.test(letters) ? letters.slice(0, 6) : `R${letters}`.slice(0, 6);
  if (base.length < 2) base = `${base}X`;
  let code = base;
  for (let n = 2; taken.has(code) || !FEATURE.test(code); n += 1) code = `${base.slice(0, 5)}${n}`;
  taken.add(code);
  return code;
}

const ABSOLUTE_URL = /^https?:\/\//i;
// Stands in for the host while a URL is resolved against a relative server, then becomes `<host>`.
const PLACEHOLDER_ORIGIN = 'https://host.invalid';

/** The first absolute server of the contract, else its first relative one under `https://<host>`. */
function serverBase(model) {
  const servers = model.servers ?? [];
  const absolute = servers.find((url) => ABSOLUTE_URL.test(url));
  const relative = servers.find((url) => url.startsWith('/')) ?? '';
  return absolute ?? `https://<host>${relative}`;
}

/** A contract URL, absolute as declared or resolved against `serverBase` (RFC 3986, as OpenAPI says). */
function absoluteUrl(model, url) {
  if (ABSOLUTE_URL.test(url)) return url;
  const base = serverBase(model);
  const placeholder = base.startsWith('https://<host>');
  const resolved = new URL(
    url,
    placeholder ? base.replace('https://<host>', PLACEHOLDER_ORIGIN) : base,
  ).href;
  return placeholder ? resolved.replace(PLACEHOLDER_ORIGIN, 'https://<host>') : resolved;
}

/** The token URL of an oauth2 scheme's client credentials grant (3.x `clientCredentials`, 2.0 `application`). */
function clientCredentialsTokenUrl(scheme) {
  const url =
    scheme.flows?.clientCredentials?.tokenUrl ??
    (scheme.flow === 'application' ? scheme.tokenUrl : undefined);
  return typeof url === 'string' && url.trim() ? url.trim() : null;
}

/**
 * The qa-config `auth` of the pack's entry, for the scheme most operations accept. An oauth2 scheme
 * with a client credentials grant gets the grant itself, without `scope`: asking for every declared
 * scope would over-ask, so scopes are set by hand when the API needs them. Its other grants, and
 * openIdConnect, get a bearer token obtained outside the framework.
 */
export function suggestAuth(model, pack) {
  const prefix = pack.toUpperCase().replace(/-/g, '_');
  const uses = new Map(Object.keys(model.securitySchemes).map((name) => [name, 0]));
  for (const operation of model.operations) {
    for (const name of new Set(operation.security.flat())) {
      if (uses.has(name)) uses.set(name, uses.get(name) + 1);
    }
  }
  // Most used first; declaration order breaks ties (Map keeps it, and the sort is stable).
  const ranked = [...uses.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  for (const scheme of ranked.map((name) => model.securitySchemes[name])) {
    if (scheme.type === 'apiKey' && (scheme.in === 'header' || scheme.in === 'query')) {
      return { type: 'api_key', in: scheme.in, name: scheme.name, env: `${prefix}_API_KEY` };
    }
    const httpScheme = scheme.type === 'http' ? String(scheme.scheme).toLowerCase() : null;
    if (httpScheme === 'basic') {
      return {
        type: 'basic',
        username_env: `${prefix}_USERNAME`,
        password_env: `${prefix}_PASSWORD`,
      };
    }
    const tokenUrl = scheme.type === 'oauth2' ? clientCredentialsTokenUrl(scheme) : null;
    if (tokenUrl) {
      return {
        type: 'oauth2_client_credentials',
        token_url: absoluteUrl(model, tokenUrl),
        client_id_env: `${prefix}_CLIENT_ID`,
        client_secret_env: `${prefix}_CLIENT_SECRET`,
      };
    }
    if (httpScheme === 'bearer' || scheme.type === 'oauth2' || scheme.type === 'openIdConnect') {
      return { type: 'bearer', env: `${prefix}_TOKEN` };
    }
  }
  return { type: 'none' };
}

/** The environment variables a suggested `auth` names (`env`, `username_env`, ...), in order. */
export function authVariables(auth) {
  return Object.entries(auth)
    .filter(([key, value]) => (key === 'env' || key.endsWith('_env')) && typeof value === 'string')
    .map(([, value]) => value);
}

/**
 * The qa-config entry suggested for the pack in each environment that runs it
 * (`api.environments.<env>.packs.<pack>`): its two required fields. `base_url` is the first absolute
 * server of the contract; a relative one, or none, leaves the host to fill in.
 */
export function suggestPackEntry(model, auth) {
  return { base_url: serverBase(model), auth };
}

/** What the plan and the README say about the suggested credentials, one sentence each. */
function credentialNotes(auth) {
  const variables = authVariables(auth).map((name) => `\`${name}\``);
  const notes = [];
  if (variables.length > 0) {
    const list =
      variables.length > 1
        ? `${variables.slice(0, -1).join(', ')} and ${variables.at(-1)}`
        : variables[0];
    notes.push(`Set ${list} in the environment or the local \`.env\`, never in qa-config.`);
  }
  if (auth.type === 'oauth2_client_credentials') {
    notes.push('Add `scope` (space-separated) by hand if the token endpoint needs one.');
  }
  return notes;
}

const successCodes = (operation) =>
  operation.responses.map((r) => r.status).filter((status) => /^2\d\d$/.test(status));

/** Resources (by first tag, else first path segment), each with its client and methods. */
export function planResources(model) {
  const groups = new Map();
  for (const operation of model.operations) {
    const resource =
      operation.tags[0] ?? operation.path.split('/').find((s) => s && !s.startsWith('{')) ?? 'api';
    if (!groups.has(resource)) groups.set(resource, []);
    groups.get(resource).push(operation);
  }
  const codes = new Set();
  const fixtures = new Set();
  return [...groups.entries()].map(([resource, operations]) => {
    let fixture = camelCase(resource);
    if (RESERVED_FIXTURES.has(fixture) || fixtures.has(fixture)) fixture = `${fixture}Api`;
    fixtures.add(fixture);
    const used = new Set();
    const methods = operations.map((operation) => {
      const base = camelCase(
        operation.operationId ??
          [operation.method.toLowerCase(), ...operation.path.split('/')].join(' '),
      );
      let name = base;
      for (let n = 2; used.has(name); n += 1) name = `${base}${n}`;
      used.add(name);
      const pathParams = [...operation.path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
      return { name, operation, pathParams };
    });
    return {
      resource,
      className: `${pascalCase(resource)}Client`,
      file: `${kebabCase(resource)}-client.ts`,
      fixture,
      code: suggestCode(resource, codes),
      methods,
    };
  });
}

/** "get  /path" as the model keys operations: "GET /path". */
const operationKey = (entry) => {
  const [method = '', ...path] = entry.trim().split(/\s+/);
  return `${method.toUpperCase()} ${path.join(' ')}`;
};

/**
 * GET operations a smoke test can call: no required parameter and a declared 2xx answer, minus the
 * operations in `skip` ("GET /path"). A GET is not always safe (one may reset data or expose
 * secrets), so the plan lists every candidate for review and `--skip-smoke` leaves one out.
 */
export function smokeCandidates(resources, skip = []) {
  const skipped = new Set(skip.map(operationKey));
  return resources.flatMap((resource) =>
    resource.methods
      .filter(
        ({ operation }) =>
          operation.method === 'GET' &&
          !operation.parameters.some((p) => p.required) &&
          successCodes(operation).length > 0 &&
          !skipped.has(operation.key),
      )
      .map((method) => ({ resource, method })),
  );
}

// ---------------------------------------------------------------------------------------------
// File contents

const quote = (text) => `'${String(text).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const comment = (text) =>
  String(text ?? '')
    .replace(/\*\//g, '*\\/')
    .replace(/\s+/g, ' ')
    .trim();

function clientSource(resource) {
  const lines = [
    "import type { APIResponse } from '@playwright/test';",
    "import { BaseClient, type RequestOptions } from '../../../helpers/base-client';",
    '',
    `/** \`${comment(resource.resource)}\` operations. Methods return the raw response; the spec asserts. */`,
    `export class ${resource.className} extends BaseClient {`,
  ];
  resource.methods.forEach(({ name, operation, pathParams }, index) => {
    const args = pathParams.map((param) => `${camelCase(param)}: number | string`);
    const target = operation.path.replace(/^\/+/, '');
    const route =
      pathParams.length > 0
        ? `this.route(${quote(target)}, { ${pathParams
            .map((p) => (camelCase(p) === p ? p : `${quote(p)}: ${camelCase(p)}`))
            .join(', ')} })`
        : quote(target);
    const verb = operation.method.toLowerCase();
    const summary = comment(operation.summary);
    if (index > 0) lines.push('');
    lines.push(`  /** ${operation.key}${summary ? `: ${summary}` : ''} */`);
    lines.push(
      `  ${name}(${[...args, 'options: RequestOptions = {}'].join(', ')}): Promise<APIResponse> {`,
    );
    lines.push(
      verb === 'head'
        ? `    return this.send('HEAD', ${route}, options);`
        : `    return this.${verb}(${route}, options);`,
    );
    lines.push('  }');
  });
  lines.push('}', '');
  return lines.join('\n');
}

function fixturesSource(pack, title, resources, specFile) {
  const yaml = /\.ya?ml$/.test(specFile);
  const parseContract = yaml
    ? `      const text = readFileSync(file, 'utf8');
      await use(createSchemaValidator(/\\.ya?ml$/.test(file) ? parseYaml(text) : JSON.parse(text)));`
    : `      await use(createSchemaValidator(JSON.parse(readFileSync(file, 'utf8'))));`;
  const imports = resources
    .map((r) => `import { ${r.className} } from './clients/${r.file.replace(/\.ts$/, '')}';`)
    .join('\n');
  const clients = resources
    .map((r) => `    ${r.fixture}: new ${r.className}(request, auth, redaction),`)
    .join('\n');
  const fields = resources.map((r) => `  ${r.fixture}: ${r.className};`).join('\n');
  const fixtures = resources
    .map(
      (r) =>
        `  ${r.fixture}: async ({ request, auth, service }, use) => {\n    await use(clientsFor(request, auth, service).${r.fixture});\n  },`,
    )
    .join('\n');
  const typeName = pascalCase(pack);
  return `// ${title} fixtures: the core \`test\` plus this pack's manifest, contract and clients, bound to the
// default credential or to any named actor (\`actor('user')\`). Generated by scaffold-service; edit
// freely. Specs import \`test\` and \`expect\` from here.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';${yaml ? "\nimport { parse as parseYaml } from 'yaml';" : ''}
import type { APIRequestContext } from '@playwright/test';
import { test as core, expect } from '../../fixtures';
import type { AuthStrategy } from '../../helpers/auth';
import { applyCaseMeta } from '../../helpers/case-meta';
import { loadEnvelopeCatalog, type EnvelopeCatalog } from '../../helpers/error-envelope';
import type { RedactionPolicy } from '../../helpers/redact';
import { createSchemaValidator, type SchemaValidator } from '../../helpers/schema';
import { loadService, type ServicePack } from '../../helpers/service';
${imports}

export function clientsFor(request: APIRequestContext, auth: AuthStrategy, service: ServicePack) {
  const redaction: RedactionPolicy = {
    identityFields: service.identity_fields,
    secretKeys: service.secret_keys,
  };
  return {
${clients}
  };
}

export type ${typeName}Clients = ReturnType<typeof clientsFor>;
export type Actor = ${typeName}Clients & { name: string };

interface ${typeName}Fixtures {
${fields}
  /** The pack's clients bound to a named credential: \`default\`, \`anonymous\` or one of the pack's qa-config \`actors\`. */
  actor: (name: string) => Promise<Actor>;
  caseMeta: void;
}

interface ${typeName}WorkerFixtures {
  service: ServicePack;
  contract: SchemaValidator;
  envelopes: EnvelopeCatalog;
}

export const test = core.extend<${typeName}Fixtures, ${typeName}WorkerFixtures>({
  service: [
    // eslint-disable-next-line no-empty-pattern -- Playwright requires the destructuring form.
    async ({}, use) => {
      await use(loadService(__dirname));
    },
    { scope: 'worker' },
  ],
  contract: [
    async ({ service }, use) => {
      const file = join(service.dir, service.spec ?? 'openapi.json');
${parseContract}
    },
    { scope: 'worker' },
  ],
  envelopes: [
    async ({ service }, use) => {
      await use(loadEnvelopeCatalog(join(service.dir, 'error-envelopes.json')));
    },
    { scope: 'worker' },
  ],
  caseMeta: [
    async ({ service }, use, testInfo) => {
      await applyCaseMeta(service, testInfo);
      await use();
    },
    { auto: true },
  ],
${fixtures}
  actor: async ({ actorSession, service }, use) => {
    await use(async (name) => {
      const session = await actorSession(name);
      return { name, ...clientsFor(session.request, session.auth, service) };
    });
  },
});

export { expect };
`;
}

function smokeSource(title, candidates) {
  const tests = candidates
    .map(({ resource, method }) => {
      const codes = successCodes(method.operation).map(Number);
      return `  test(${quote(`${method.operation.key} answers a declared success status`)}, async ({ ${resource.fixture} }) => {
    const response = await ${resource.fixture}.${method.name}();
    expect(${JSON.stringify(codes)}).toContain(response.status());
  });`;
    })
    .join('\n\n');
  return `// Smoke: every GET that needs no parameter answers one of its declared success statuses. Generated
// by scaffold-service as a first check of configuration and auth; designed cases replace it.

import { test, expect } from '../fixtures';

test.describe(${quote(`${title} smoke`)}, { tag: '@smoke' }, () => {
${tests}
});
`;
}

function readmeSource(plan) {
  const rows = plan.resources
    .map(
      (r) =>
        `| \`${r.resource}\` | \`clients/${r.file}\` | \`${r.fixture}\` | ${r.methods.length} | \`${r.code}\` |`,
    )
    .join('\n');
  return `# Service pack: ${plan.name}

${plan.title}, version \`${plan.version}\`, scaffolded on ${plan.date} by \`npm run scaffold:service\`.
The layout and the layers follow \`services/petstore/\`, the worked example.

## Resources

| Resource | Client | Fixture | Operations | Suggested code |
|---|---|---|---|---|
${rows}

Suggested codes are agreed at the feature's first intake and are permanent once a case is published.

## Next steps

1. Add this pack to every environment it runs in: \`api.environments.<env>.packs.${plan.name}\` in
   \`qa-config.json\`. \`base_url\` and \`auth\` are required; \`spec_url\`, \`allow_writes\`, \`recovery\`
   and \`actors\` are optional. Without \`allow_writes: true\` the environment is read-only: write
   cases skip, and the DAST and destructive lanes refuse the pack. A pack without an entry cannot
   run in that environment. The contract suggests:

   \`\`\`json
   ${JSON.stringify(plan.packEntry)}
   \`\`\`
${credentialNotes(plan.auth)
  .map((note) => `\n   ${note}\n`)
  .join('')}
   \`${packVariable(plan.name, 'BASE_URL')}\` and \`${packVariable(plan.name, 'SPEC_URL')}\` override the URLs for one run.
2. Run \`npx playwright test --project=api-${plan.name}\` to check configuration and credentials.
3. Start the phases with \`qa-intake\` for the first feature. Its contract goes in
   \`docs/features/<feature>.md\`.

Where the API departs from its contract is recorded in
[\`docs/contract-notes.md\`](docs/contract-notes.md).
`;
}

const contractNotesSource = (plan) => `# ${plan.title}: contract notes

Observed departures from the published contract, one entry per finding, each with its status and,
when filed, its issue key. Written by the phases (\`qa-intake\` measures, \`qa-run\` observes). Empty
until the first intake.

Each entry is a row of the table below, with an id \`<PREFIX>-NN\` that keeps for good. Choose a
prefix for this pack that no other pack uses and that is not an id family of the repository (\`L\`,
\`TC\`, \`REQ\`, the backlog prefixes such as \`CI\` or \`GATE\`); the example packs use \`PN\` and
\`VN\`. \`lint-docs\` checks every cited id against this table.

**Status:** \`untracked\` (observed, no issue yet) · \`tracked\` (issue filed, key given) · \`by-design\`
(a difference to tolerate, not a defect).

| Id | Observation | Reproduce | Kind | Status |
|---|---|---|---|---|
`;

function skillSource(plan, template) {
  const servers =
    plan.model.servers.length > 0 ? plan.model.servers.map((s) => `\`${s}\``).join(', ') : 'none';
  const schemes = Object.entries(plan.model.securitySchemes);
  // An oauth2 scheme's grants: the 3.x flow names, or the one 2.0 flow.
  const flows = (s) => {
    const names = s.flows ? Object.keys(s.flows) : s.flow ? [s.flow] : [];
    return names.length > 0 ? `, ${names.join(' and ')}` : '';
  };
  const security =
    schemes.length > 0
      ? schemes
          .map(
            ([name, s]) =>
              `\`${name}\` (${s.type}${s.in ? `, ${s.in} \`${s.name}\`` : ''}${s.scheme ? `, ${s.scheme}` : ''}${flows(s)})`,
          )
          .join(', ')
      : 'none';
  const resources = plan.resources
    .map(
      (r) =>
        `| \`${r.resource}\` | \`${r.className}\` | \`${r.fixture}\` | ${r.methods.length} | \`${r.code}\` |`,
    )
    .join('\n');
  const values = {
    NAME: plan.name,
    TITLE: plan.title,
    VERSION: plan.version,
    DATE: plan.date,
    SPEC: plan.specFile,
    FORMAT: plan.model.format,
    OPERATIONS: String(plan.model.operations.length),
    SERVERS: servers,
    SECURITY: security,
    AUTH: `\`${JSON.stringify(plan.auth)}\``,
    RESOURCES: resources,
  };
  return template.replace(/\{\{([A-Z]+)\}\}/g, (match, key) => values[key] ?? match);
}

// ---------------------------------------------------------------------------------------------

async function readSource(spec) {
  if (/^https?:\/\//i.test(spec)) {
    const response = await fetch(spec);
    if (!response.ok) throw new Error(`GET ${spec} answered ${response.status}.`);
    return response.text();
  }
  return readFileSync(spec, 'utf8');
}

/** Read the contract and decide everything; writes nothing. */
export async function planPack({
  name,
  spec,
  version,
  title,
  skipSmoke = [],
  root = REPO_ROOT,
  now = new Date(),
}) {
  if (!NAME.test(name ?? '')) throw new Error('--name must match ^[a-z][a-z0-9-]*$, e.g. shop.');
  if (!spec) throw new Error('--spec <file|url> is required.');
  const text = await readSource(spec);
  const document = parseDocument(text, spec);
  const model = normalize(document);
  const resolvedVersion = packVersion(model, version);
  if (!VERSION.test(resolvedVersion))
    throw new Error(`--version "${resolvedVersion}" must match ${VERSION}.`);
  const yaml = /\.ya?ml$/i.test(extname(spec.split('?')[0]));
  const specFile = yaml ? 'openapi.yaml' : 'openapi.json';
  const resources = planResources(model);
  const keys = new Set(model.operations.map((operation) => operation.key));
  for (const entry of skipSmoke) {
    if (!keys.has(operationKey(entry))) {
      throw new Error(`--skip-smoke "${entry}" is not an operation of the contract ("GET /path").`);
    }
  }
  const plan = {
    name,
    title: title ?? model.info.title ?? name,
    version: resolvedVersion,
    date: now.toISOString().slice(0, 10),
    spec,
    specFile,
    text: yaml ? text : `${JSON.stringify(document, null, 2)}\n`,
    model,
    auth: suggestAuth(model, name),
    resources,
    smoke: smokeCandidates(resources, skipSmoke),
    skippedSmoke: skipSmoke,
    packDir: join(root, 'services', name),
    skillFile: join(root, '.claude', 'skills', `${name}-api`, 'SKILL.md'),
  };
  plan.packEntry = suggestPackEntry(model, plan.auth);
  plan.files = filesFor(plan, root);
  return plan;
}

function filesFor(plan, root) {
  const template = readFileSync(join(REPO_ROOT, 'docs', 'templates', 'service-skill.md'), 'utf8');
  const manifest = {
    name: plan.name,
    version: plan.version,
    title: plan.title,
    // Never the --spec value: a local path names the machine, a URL may name a private host.
    description: `${plan.title}, scaffolded on ${plan.date} from its ${plan.specFile}.`,
    identity_fields: [],
    spec: plan.specFile,
  };
  const files = new Map([
    ['service.json', `${JSON.stringify(manifest, null, 2)}\n`],
    [plan.specFile, plan.text],
    ['error-envelopes.json', `${JSON.stringify({ envelopes: {} }, null, 2)}\n`],
    ['README.md', readmeSource(plan)],
    ['docs/contract-notes.md', contractNotesSource(plan)],
    ['fixtures.ts', fixturesSource(plan.name, plan.title, plan.resources, plan.specFile)],
    ...plan.resources.map((r) => [`clients/${r.file}`, clientSource(r)]),
  ]);
  if (plan.smoke.length > 0) files.set('specs/smoke.spec.ts', smokeSource(plan.title, plan.smoke));
  const absolute = new Map(
    [...files].map(([path, content]) => [join(plan.packDir, path), content]),
  );
  absolute.set(plan.skillFile, skillSource(plan, template));
  return new Map(
    [...absolute].map(([path, content]) => [relative(root, path).replace(/\\/g, '/'), content]),
  );
}

export function describePlan(plan) {
  const lines = [
    `Pack ${plan.name} ${plan.version}: ${plan.title}`,
    `Contract: ${plan.spec} (${plan.model.format}, ${plan.model.operations.length} operations, ${Object.keys(plan.model.schemas).length} schemas)`,
    `Servers: ${plan.model.servers.join(', ') || 'none declared'}`,
    `Security: ${Object.keys(plan.model.securitySchemes).join(', ') || 'none'}`,
    `Suggested qa-config entry api.environments.<env>.packs.${plan.name}: ${JSON.stringify(plan.packEntry)}`,
    ...credentialNotes(plan.auth).map((note) => `  ${note.replace(/`/g, '')}`),
    '',
    'Resources:',
    ...plan.resources.map(
      (r) =>
        `  ${r.resource.padEnd(20)} ${r.className.padEnd(24)} fixture ${r.fixture.padEnd(16)} ${String(r.methods.length).padStart(3)} ops  code ${r.code}`,
    ),
    '',
    `Smoke tests: ${plan.smoke.length} GET operation(s) without parameters; check that each is safe to call, and leave one out with --skip-smoke "GET /path":`,
    ...plan.smoke.map(({ method }) => `  ${method.operation.key}`),
    ...plan.skippedSmoke.map((entry) => `  left out: ${entry}`),
  ];
  if (plan.model.problems.length > 0) {
    lines.push('', 'Contract problems (reported, not fatal):');
    for (const problem of plan.model.problems) lines.push(`  ${problem.where}: ${problem.message}`);
  }
  lines.push('', 'Files:', ...[...plan.files.keys()].map((file) => `  ${file}`));
  return lines.join('\n');
}

/** Write the planned files. Refuses to touch an existing pack or skill. */
export function writePlan(plan, root = REPO_ROOT, { skillOnly = false } = {}) {
  if (skillOnly) {
    if (!existsSync(plan.packDir)) {
      throw new Error(
        `--skill-only needs an existing pack; services/${plan.name}/ does not exist.`,
      );
    }
    plan = {
      ...plan,
      packDir: null,
      files: new Map([...plan.files].filter(([file]) => file.startsWith('.claude/'))),
    };
  }
  for (const target of [plan.packDir, plan.skillFile].filter(Boolean)) {
    if (existsSync(target)) {
      throw new Error(
        `${relative(root, target).replace(/\\/g, '/')} already exists; a pack is never overwritten.`,
      );
    }
  }
  for (const [file, content] of plan.files) {
    const path = join(root, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
  return [...plan.files.keys()];
}

/** Run the contract tools for the new pack so its generated files and digest exist. */
export function generateContractFiles(name, root = REPO_ROOT) {
  for (const script of ['swagger-digest.mjs', 'derive-value-sets.mjs', 'derive-probe-matrix.mjs']) {
    const run = spawnSync(
      process.execPath,
      [join(REPO_ROOT, 'scripts', script), '--service', name, '--write'],
      {
        cwd: root,
        encoding: 'utf8',
      },
    );
    if (exitCodeOf(run) !== 0) {
      throw new Error(
        `${script} --service ${name} --write failed (${describeExit(run)}): ${(run.stderr || run.stdout || '').trim()}`,
      );
    }
  }
  const prettier = spawnSync(
    process.execPath,
    [
      join(REPO_ROOT, 'node_modules', 'prettier', 'bin', 'prettier.cjs'),
      '--write',
      join('services', name),
    ],
    {
      cwd: root,
      encoding: 'utf8',
    },
  );
  if (exitCodeOf(prettier) !== 0) {
    throw new Error(`prettier failed (${describeExit(prettier)}): ${prettier.stderr ?? ''}`);
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      name: { type: 'string' },
      spec: { type: 'string' },
      version: { type: 'string' },
      title: { type: 'string' },
      write: { type: 'boolean', default: false },
      'skill-only': { type: 'boolean', default: false },
      'skip-smoke': { type: 'string', multiple: true, default: [] },
    },
  });
  const plan = await planPack({ ...values, skipSmoke: values['skip-smoke'] });
  console.log(describePlan(plan));
  if (!values.write) {
    console.log('\nNothing written. Review the plan, then run again with --write.');
    return;
  }
  if (values['skill-only']) {
    const [skill] = writePlan(plan, REPO_ROOT, { skillOnly: true });
    console.log(`
Wrote ${skill}. Fill in its pending facts from the pack's docs.`);
    return;
  }
  const written = writePlan(plan);
  generateContractFiles(plan.name);
  console.log(`\nWrote ${written.length} files and the generated contract files.`);
  console.log(
    `Next: add api.environments.<env>.packs.${plan.name} (base_url and auth) to qa-config for every ` +
      `environment that runs it, then read services/${plan.name}/README.md.`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
