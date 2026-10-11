#!/usr/bin/env node
/**
 * Creates a service pack from an API description (PROC-06, ADR 0007). It runs in two steps so that
 * nothing is written before someone has looked at what was found:
 *
 *   node scripts/scaffold-service.mjs --name <pack> --spec <file|url> [--version v1] [--title t]
 *       reads the contract and prints the plan: resources, clients, suggested feature codes,
 *       security, the files it would write. Writes nothing.
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
import { REPO_ROOT } from './lib/cli.mjs';
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

/** The qa-config `api.auth` entry for the scheme most operations accept. */
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
    if (
      (scheme.type === 'http' && String(scheme.scheme).toLowerCase() === 'bearer') ||
      scheme.type === 'oauth2' ||
      scheme.type === 'openIdConnect'
    ) {
      return { type: 'bearer', env: `${prefix}_TOKEN` };
    }
  }
  return { type: 'none' };
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

/** GET operations a smoke test can call: no required parameter and a declared 2xx answer. */
export function smokeCandidates(resources) {
  return resources.flatMap((resource) =>
    resource.methods
      .filter(
        ({ operation }) =>
          operation.method === 'GET' &&
          !operation.parameters.some((p) => p.required) &&
          successCodes(operation).length > 0,
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

function fixturesSource(pack, title, resources) {
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
import { join } from 'node:path';
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
  /** The pack's clients bound to a named credential: \`default\`, \`anonymous\` or one of \`api.actors\`. */
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
      await use(createSchemaValidator(JSON.parse(readFileSync(file, 'utf8'))));
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

Suggested codes are confirmed at the first design gate and are permanent once a case is published.

## Next steps

1. Add an environment for this API to \`qa-config.json\` (\`api.environments\`) and set \`api.auth\`.
   The contract suggests: \`${JSON.stringify(plan.auth)}\`.
2. Run \`npx playwright test services/${plan.name}/specs\` to check configuration and credentials.
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
`;

function skillSource(plan, template) {
  const servers =
    plan.model.servers.length > 0 ? plan.model.servers.map((s) => `\`${s}\``).join(', ') : 'none';
  const schemes = Object.entries(plan.model.securitySchemes);
  const security =
    schemes.length > 0
      ? schemes
          .map(
            ([name, s]) =>
              `\`${name}\` (${s.type}${s.in ? `, ${s.in} \`${s.name}\`` : ''}${s.scheme ? `, ${s.scheme}` : ''})`,
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
export async function planPack({ name, spec, version, title, root = REPO_ROOT, now = new Date() }) {
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
    smoke: smokeCandidates(resources),
    packDir: join(root, 'services', name),
    skillFile: join(root, '.claude', 'skills', `${name}-api`, 'SKILL.md'),
  };
  plan.files = filesFor(plan, root);
  return plan;
}

function filesFor(plan, root) {
  const template = readFileSync(join(REPO_ROOT, 'docs', 'templates', 'service-skill.md'), 'utf8');
  const manifest = {
    name: plan.name,
    version: plan.version,
    title: plan.title,
    description: `Scaffolded from ${plan.spec}.`,
    identity_fields: [],
    spec: plan.specFile,
  };
  const files = new Map([
    ['service.json', `${JSON.stringify(manifest, null, 2)}\n`],
    [plan.specFile, plan.text],
    ['error-envelopes.json', `${JSON.stringify({ envelopes: {} }, null, 2)}\n`],
    ['README.md', readmeSource(plan)],
    ['docs/contract-notes.md', contractNotesSource(plan)],
    ['fixtures.ts', fixturesSource(plan.name, plan.title, plan.resources)],
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
    `Security: ${Object.keys(plan.model.securitySchemes).join(', ') || 'none'}; suggested api.auth ${JSON.stringify(plan.auth)}`,
    '',
    'Resources:',
    ...plan.resources.map(
      (r) =>
        `  ${r.resource.padEnd(20)} ${r.className.padEnd(24)} fixture ${r.fixture.padEnd(16)} ${String(r.methods.length).padStart(3)} ops  code ${r.code}`,
    ),
    '',
    `Smoke tests: ${plan.smoke.length} GET operation(s) without parameters`,
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
    },
  });
  const plan = await planPack(values);
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
    `Next: add an environment and api.auth to qa-config, then read services/${plan.name}/README.md.`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
