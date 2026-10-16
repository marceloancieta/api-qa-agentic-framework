// remove-service (FUT-12): what belongs to a pack is decided from structure, each edit is checked on
// a fixture that holds the pack, its look-alikes and the framework's own items, then the plan runs
// on a temporary repository and on a copy of this one. The pack removed in the fixtures is `pet`;
// `petstore` (a longer name), `pet-admin` (a name that starts with `pet-`) and everything of the
// framework must survive.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { REPO_ROOT, servicePacks } from '../lib/cli.mjs';
import { checkNamesOf } from '../lib/workflow.mjs';
import {
  applyRemoval,
  bracketsBalanced,
  closingBrace,
  composeServicesIn,
  describeRemoval,
  editCompose,
  editGitleaksIgnore,
  editJenkinsfile,
  editNotice,
  editPackageJson,
  editQaConfig,
  editRuleset,
  editRulesetTest,
  editVariables,
  editWorkflow,
  localConfigNotes,
  packContext,
  packModel,
  planRemoval,
  removeJson,
  repositoryModel,
  scopeFor,
} from '../remove-service.mjs';

const temporary = [];
const tempDir = (prefix) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temporary.push(dir);
  return dir;
};
after(() => {
  for (const dir of temporary) rmSync(dir, { recursive: true, force: true });
});

const PACKS = ['pet', 'petstore', 'pet-admin'];
const text = (...lines) => `${lines.join('\n')}\n`;

const SCRIPTS = {
  lint: 'eslint .',
  'pet:up': 'docker compose up -d --wait pet pet-db && node services/pet/create-db.mjs',
  'pet:down': 'docker compose rm --stop --force pet pet-db',
  seed: 'node services/pet/seed.mjs',
  'petstore:up': 'docker compose up -d --wait petstore',
  'pet-admin:up': 'docker compose up -d pet-admin',
  'all:up': 'npm run pet:up && npm run petstore:up',
  both: 'node services/pet/a.mjs services/petstore/b.mjs',
};

const CONFIG = {
  api: {
    default_environment: 'local',
    environments: {
      local: {
        packs: {
          pet: {
            base_url: 'http://x',
            auth: { type: 'api_key', env: 'PET_TOKEN' },
            actors: { other: { type: 'bearer', env: 'SHARED_TOKEN' } },
          },
          petstore: { base_url: 'http://y', auth: { type: 'bearer', env: 'SHARED_TOKEN' } },
          'pet-admin': { base_url: 'http://z', auth: { type: 'bearer', env: 'PET_ADMIN_TOKEN' } },
        },
      },
      'local-pet': {
        packs: { pet: { base_url: 'http://w', auth: { type: 'bearer', env: 'QA_ENV' } } },
      },
      public: { packs: { petstore: { base_url: 'https://v' } } },
    },
  },
  quality_gate: {
    dast: { source: 'reports/dast/pet.json' },
    p95_latency: { source: 'reports/perf/petstore.json' },
  },
};

const COMPOSE = text(
  '# Local systems under test.',
  '#',
  '# The pet pack: one container.',
  '#   docker compose up -d pet',
  '#',
  '# The petstore pack and the pet-admin pack.',
  '#   docker compose up -d petstore pet-admin',
  '#',
  '# Tools of every pack, and the pet example in prose only.',
  'x-pet: &pet',
  '  image: example/pet:1',
  '',
  'x-petstore: &petstore',
  '  image: example/petstore:1',
  '',
  'services:',
  '  pet:',
  '    <<: *pet',
  "    ports: ['${PET_PORT:-8080}:8080']",
  '    volumes:',
  '      - pet-data:/data',
  '  # The reference release of the pet pack.',
  '  pet-reference:',
  '    <<: *pet',
  '    profiles: [diff]',
  '  pet-db:',
  '    image: example/db:1',
  '  db:',
  '    image: example/db:1',
  '  node:',
  '    image: example/node:1',
  '  create:',
  '    image: example/create:1',
  '  petstore:',
  '    <<: *petstore',
  '  pet-admin:',
  '    image: example/admin:1',
  '    volumes:',
  '      - shared:/data',
  '',
  'volumes:',
  '  pet-data:',
  '  shared:',
);

const modelOf = ({ scripts = SCRIPTS, compose = COMPOSE, config = CONFIG, packs = PACKS } = {}) =>
  packModel({
    packs,
    scripts,
    compose: parseYaml(compose, { merge: true }),
    config,
    framework: new Set(['QA_ENV', 'QA_TM_PROVIDER']),
  });
const scope = scopeFor('pet', modelOf());

test('names: a service or script of the pack, never one of a longer pack', () => {
  const ctx = packContext('pet', PACKS);
  assert.ok(ctx.ownsName('pet') && ctx.ownsName('pet-reference') && ctx.ownsName('pet:up', ':'));
  assert.ok(
    !ctx.ownsName('petstore') && !ctx.ownsName('pet-admin') && !ctx.ownsName('pet-admin-db'),
  );
  assert.ok(ctx.mentions('The Pet pack') && !ctx.mentions('services/petstore/'));
  assert.ok(!ctx.mentions('pet-admin') && !ctx.mentions('carpet'));
});

test('compose services come only from the arguments of a docker compose command', () => {
  const services = ['vampi-secure', 'vampi-vulnerable', 'db', 'node', 'create', 'services', 'zap'];
  assert.deepEqual(
    composeServicesIn(
      'docker compose up -d --wait vampi-secure vampi-vulnerable && node services/vampi/create-db.mjs',
      services,
    ),
    ['vampi-secure', 'vampi-vulnerable'],
  );
  assert.deepEqual(composeServicesIn('docker compose --profile diff up -d --wait db', services), [
    'db',
  ]);
  assert.deepEqual(composeServicesIn('docker compose run --rm zap zap-api-scan.py db', services), [
    'zap',
  ]);
  assert.deepEqual(composeServicesIn('echo docker compose up db; node create', services), []);
});

test('the model: scripts, services and variables of the pack, decided from structure', () => {
  assert.deepEqual(scope.scripts, ['pet:up', 'pet:down', 'seed']);
  assert.deepEqual(scope.sharedScripts, ['both']);
  assert.deepEqual(scope.services, ['pet', 'pet-reference', 'pet-db']);
  // QA_ENV is the framework's, SHARED_TOKEN another pack's; PET_PORT is read by its service.
  assert.deepEqual(scope.variables.sort(), [
    'PET_PORT',
    'PET_TOKEN',
    'QA_PET_BASE_URL',
    'QA_PET_SPEC_URL',
  ]);
});

test('markers: the pack is named by structure, not by its name in free text', () => {
  for (const marked of [
    'npm run pet:up',
    '--service pet',
    'npx playwright test --project=api-pet',
    'name: e2e (pet)',
    'name: dast (pet ${{ matrix.mode }})',
    'docker compose logs pet-db > x.log',
    'cat services/pet/README.md',
    'PET_TOKEN: ${{ secrets.X }}',
  ]) {
    assert.ok(scope.has(marked), marked);
  }
  for (const unmarked of [
    'npm run petstore:up',
    '--service petstore',
    'name: e2e (petstore)',
    'the pet example, reports/pet.log',
    '${{ github.ref }} GITHUB_TOKEN QA_ENV',
    'docker compose logs db node create',
  ]) {
    assert.ok(!scope.has(unmarked), unmarked);
  }
  assert.ok(scope.owns('npm run pet:up') && !scope.owns('npm run pet:up && npm run petstore:up'));
});

test('removeJson takes out one member or element with its comma, and keeps the rest as written', () => {
  const source = text(
    '{',
    '  "a": { "x": 1 },',
    '  "b": [1, 2, 3],',
    '  "c": { "keep": "as written" }',
    '}',
  );
  assert.equal(
    removeJson(source, ['a']),
    text('{', '  "b": [1, 2, 3],', '  "c": { "keep": "as written" }', '}'),
  );
  assert.equal(removeJson(source, ['c']), text('{', '  "a": { "x": 1 },', '  "b": [1, 2, 3]', '}'));
  assert.equal(removeJson(source, ['b', 2]).split('\n')[2], '  "b": [1, 2],');
  assert.equal(removeJson(source, ['a', 'x']).split('\n')[1], '  "a": {},');
  assert.throws(() => removeJson(source, ['missing']), /no such entry/);
});

test('package.json loses the pack scripts; a script shared with another pack is a note', () => {
  const result = editPackageJson(`${JSON.stringify({ scripts: SCRIPTS }, null, 2)}\n`, scope);
  assert.deepEqual(Object.keys(JSON.parse(result.text).scripts), [
    'lint',
    'petstore:up',
    'pet-admin:up',
    'all:up',
    'both',
  ]);
  assert.deepEqual(result.notes, [
    'package.json: script both runs files of pet and of another pack; edit it by hand.',
    'package.json: script all:up runs the removed pet:up.',
  ]);
});

test('qa-config loses the pack entry in each environment, and the environments only it used', () => {
  const result = editQaConfig(`${JSON.stringify(CONFIG, null, 2)}\n`, scope);
  const config = JSON.parse(result.text);
  assert.deepEqual(Object.keys(config.api.environments), ['local', 'public']);
  assert.deepEqual(Object.keys(config.api.environments.local.packs), ['petstore', 'pet-admin']);
  assert.equal(result.notes.length, 1);
  assert.match(result.notes[0], /quality_gate\.dast\.source is reports\/dast\/pet\.json/);
  assert.deepEqual(result.errors, []);
});

test('qa-config: a default environment that runs only the pack is an error, not a deletion', () => {
  const config = structuredClone(CONFIG);
  config.api.default_environment = 'local-pet';
  const result = editQaConfig(JSON.stringify(config, null, 2), scope);
  assert.match(result.errors[0], /default_environment "local-pet" runs only pet/);
});

test('a local qa-config.json is reported, never edited', () => {
  const notes = localConfigNotes(JSON.stringify(CONFIG), 'pet');
  assert.match(notes[0], /not edited.*api\.environments\.local, api\.environments\.local-pet/);
  assert.deepEqual(localConfigNotes(JSON.stringify({ api: { environments: {} } }), 'pet'), []);
});

test('compose loses the pack services, extension, volume and header paragraph; db, node and create stay', () => {
  const result = editCompose(COMPOSE, scope);
  const compose = parseYaml(result.text, { merge: true });
  assert.deepEqual(Object.keys(compose.services), [
    'db',
    'node',
    'create',
    'petstore',
    'pet-admin',
  ]);
  assert.deepEqual(Object.keys(compose.volumes), ['shared']);
  assert.ok(!('x-pet' in compose) && 'x-petstore' in compose);
  assert.ok(!result.text.includes('The pet pack: one container'));
  assert.ok(!result.text.includes('reference release of the pet pack'));
  assert.ok(result.text.includes('the pet example in prose only'), 'prose without a marker stays');
});

test('compose refuses to remove a service a kept one depends on', () => {
  const dependent = COMPOSE.replace(
    '  db:\n    image: example/db:1',
    '  db:\n    image: example/db:1\n    depends_on: [pet-db]',
  );
  assert.throws(() => editCompose(dependent, scopeFor('pet', modelOf({ compose: dependent }))), {
    message: /db needs pet-db/,
  });
});

test('compose keeps an extension another pack still merges', () => {
  const shared = COMPOSE.replace('    <<: *petstore', '    <<: *pet');
  const result = editCompose(shared, scopeFor('pet', modelOf({ compose: shared })));
  assert.ok(parseYaml(result.text, { merge: true })['x-pet']);
});

const WORKFLOW = text(
  'name: ci',
  'on:',
  '  pull_request:',
  '    paths:',
  "      - 'services/*/service.json'",
  "      - 'services/pet/seed.mjs'",
  "      - 'services/petstore/seed.mjs'",
  'jobs:',
  '  title:',
  '    name: title',
  '    if: ${{ github.event_name == "pull_request" }}',
  '    steps:',
  '      - run: echo "$GITHUB_TOKEN" | wc -c',
  '',
  '  # The pet pack end to end.',
  '  e2e-pet:',
  '    name: e2e (pet)',
  '    needs: title',
  '    steps:',
  '      - run: npm run pet:up',
  '',
  '  e2e-petstore:',
  '    name: e2e (petstore)',
  '    steps:',
  '      - run: npm run petstore:up',
  '',
  '  perf:',
  '    strategy:',
  '      matrix:',
  '        pack: [petstore, pet, pet-admin]',
  '        mode:',
  '          - pet',
  '          - petstore',
  '    steps:',
  '      - run: npm run lanes:perf -- --service ${{ matrix.pack }}',
  '',
  '  dast:',
  '    strategy:',
  '      matrix:',
  '        include:',
  '          - pack: pet',
  '            args: [--service, pet]',
  '          - pack: petstore',
  '            args: [--service, petstore]',
  '    steps:',
  '      - run: npm run lanes:dast -- ${{ join(matrix.args, " ") }}',
);

test('a workflow loses the pack jobs, its matrix entries and path filters; nothing else', () => {
  const result = editWorkflow(WORKFLOW, scope, 'ci.yml');
  const before = parseYaml(WORKFLOW);
  const after = parseYaml(result.text);
  assert.deepEqual(Object.keys(after.jobs), ['title', 'e2e-petstore', 'perf', 'dast']);
  assert.deepEqual(after.jobs.title, before.jobs.title);
  assert.deepEqual(after.jobs['e2e-petstore'], before.jobs['e2e-petstore']);
  assert.deepEqual(after.jobs.perf.strategy.matrix, {
    pack: ['petstore', 'pet-admin'],
    mode: ['petstore'],
  });
  assert.deepEqual(after.jobs.dast, before.jobs.dast, 'an include list is never edited');
  assert.deepEqual(after.on.pull_request.paths, [
    'services/*/service.json',
    'services/petstore/seed.mjs',
  ]);
  assert.deepEqual(result.removedJobs, [
    { id: 'e2e-pet', name: 'e2e (pet)', checks: ['e2e (pet)'] },
  ]);
  assert.ok(!result.text.includes('The pet pack end to end'));
  assert.ok(result.notes.some((note) => /job dast names pet in a matrix include/.test(note)));
});

test('a workflow indented by four spaces is read at its own indentation', () => {
  // Without the include job, whose list items do not survive doubling every indentation.
  const narrow = WORKFLOW.slice(0, WORKFLOW.indexOf('\n  dast:') + 1);
  const wide = narrow.replace(/^( +)/gm, (spaces) => spaces.repeat(2));
  const result = editWorkflow(wide, scope, 'ci.yml');
  assert.deepEqual(Object.keys(parseYaml(result.text).jobs), ['title', 'e2e-petstore', 'perf']);
  assert.deepEqual(parseYaml(result.text).jobs.perf.strategy.matrix.pack, [
    'petstore',
    'pet-admin',
  ]);
});

test('a workflow whose every job is the pack is deleted; a job that needs one stops the edit', () => {
  const only = text(
    'name: pet',
    'on: push',
    'jobs:',
    '  run:',
    '    name: run (pet)',
    '    steps:',
    '      - run: npm run pet:up',
  );
  assert.equal(editWorkflow(only, scope).text, null);
  const needy = WORKFLOW.replace(
    '    name: e2e (petstore)\n',
    '    name: e2e (petstore)\n    needs: e2e-pet\n',
  );
  assert.throws(() => editWorkflow(needy, scope, 'ci.yml'), /job e2e-petstore needs a job of pet/);
});

const JENKINSFILE = text(
  'import groovy.transform.Field',
  '',
  '@Field boolean ran = false',
  '',
  'pipeline {',
  '  parameters {',
  "    string(name: 'PET_HOST', defaultValue: '', description: 'Host of the pet container.')",
  "    string(name: 'PET_LONG',",
  "      defaultValue: '', description: 'Declared on two lines.')",
  "    string(name: 'PETSTORE_HOST', defaultValue: '', description: 'Reads PET_HOST too.')",
  '  }',
  '  stages {',
  "    stage('Gates') {",
  '      steps {',
  "        shell 'npm run gates'",
  '      }',
  '    }',
  '',
  '    // The pet pack, with a brace in a string: "{".',
  "    stage('e2e (pet)') {",
  '      steps {',
  '        script {',
  '          withPetUsers {',
  "            shell 'npm run pet:up'",
  '            ran = true',
  "            echo '} not a brace'",
  '          }',
  '        }',
  '      }',
  '    }',
  '',
  "    stage('e2e (petstore)') {",
  '      steps {',
  '        shell "npm run petstore:up ${params.PETSTORE_HOST}"',
  '      }',
  '    }',
  '  }',
  '  post {',
  '    cleanup {',
  "      shell(returnStatus: true, 'npm run pet:down')",
  "      shell(returnStatus: true, 'npm run petstore:down')",
  '      if (ran)',
  "        shell 'npm run pet:down'",
  '      shell(returnStatus: true, "docker compose logs pet petstore > ${nativePath(\'x.log\')}")',
  '    }',
  '  }',
  '}',
  '',
  '// Users of the pet pack.',
  'def withPetUsers(Closure body) {',
  '  withEnv(["PET_TOKEN=${params.PET_HOST}${params.PET_LONG}"]) {',
  '    body()',
  '  }',
  '}',
  '',
  '// Shared by every stage.',
  'def nativePath(String path) {',
  '  return path',
  '}',
);

test('a Jenkinsfile loses the stage, its functions, parameters and statements, and stays balanced', () => {
  const result = editJenkinsfile(
    JENKINSFILE,
    scope,
    { removedScripts: scope.scripts, removedServices: scope.services },
    'Jenkinsfile',
  );
  const out = result.text;
  assert.ok(!out.includes("stage('e2e (pet)')") && out.includes("stage('e2e (petstore)')"));
  assert.ok(!out.includes('withPetUsers') && out.includes('def nativePath'));
  assert.ok(!out.includes("'PET_HOST'") && out.includes("'PETSTORE_HOST'"));
  assert.ok(out.includes("string(name: 'PET_LONG',"), 'a parameter on two lines is left');
  assert.equal((out.match(/npm run pet:down/g) ?? []).length, 1, 'the braceless if body stays');
  assert.ok(out.includes('docker compose logs pet petstore'), 'a line of both packs stays');
  assert.ok(bracketsBalanced(out));
  assert.ok(!/\n\n {2}\}/.test(out));
  assert.deepEqual(result.changes, [
    "stage 'e2e (pet)'",
    'def withPetUsers',
    'parameters PET_HOST',
    '1 line(s) that ran a removed script or service',
  ]);
  // Notes carry the line numbers of the file as it was.
  assert.ok(
    result.notes.includes('Jenkinsfile:8 parameter PET_LONG is no longer read; remove it by hand.'),
  );
  assert.ok(
    result.notes.some((note) =>
      note.startsWith(
        "Jenkinsfile:43 runs a removed script or service; edit it by hand: shell 'npm run pet:down'",
      ),
    ),
  );
  assert.ok(result.notes.some((note) => note.startsWith('Jenkinsfile:44 runs a removed script')));
  assert.ok(result.notes.some((note) => /ran was set only in what was removed/.test(note)));
});

test('a statement that may be a braceless body is noted, whatever follows its condition', () => {
  const cleanup = (...body) =>
    text('pipeline {', '  post {', '    cleanup {', ...body, "      echo 'A'", '    }', '  }', '}');
  const run = "        shell 'npm run pet:down'";
  const shapes = {
    'a condition followed by a line comment': ['      if (params.X) // only then', run],
    'a condition followed by a block comment': ['      if (params.X) /* only then */', run],
    'a condition over two lines': ['      if (params.X &&', '          params.Y)', run],
    'a one-line if before it': ["      if (params.X) echo 'x'", run],
    'an else on its own line': ['      if (params.X) {', "        echo 'x'", '      } else', run],
  };
  for (const [shape, body] of Object.entries(shapes)) {
    const result = editJenkinsfile(cleanup(...body), scope, { removedScripts: scope.scripts });
    assert.ok(result.text.includes('npm run pet:down'), `${shape}: the statement stays`);
    assert.ok(
      result.notes.some((note) => /runs a removed script or service/.test(note)),
      `${shape}: it is noted`,
    );
  }
  // After a complete statement, a block opening or a `;` it is removed.
  for (const before of ["      echo 'before'", '      script {', "      echo 'before';"]) {
    const body = before.endsWith('{') ? [before, run, '      }'] : [before, run];
    const result = editJenkinsfile(cleanup(...body), scope, { removedScripts: scope.scripts });
    assert.ok(!result.text.includes('npm run pet:down'), `after ${before.trim()}: removed`);
  }
});

test('brackets: closingBrace and bracketsBalanced skip strings and comments', () => {
  const source = 'a { b(\'}\') // }\n /* } */ "{" }';
  assert.equal(closingBrace(source, 2), source.length - 1);
  assert.equal(closingBrace('{ unclosed', 0), -1);
  assert.ok(bracketsBalanced("f(a[1], { b: ')' })"));
  assert.ok(!bracketsBalanced('f(a[1)]') && !bracketsBalanced("string(name: 'X',"));
});

test('.gitleaksignore loses the entries of removed files, with or without a commit', () => {
  const source = text(
    '# Header.',
    '',
    '# Why the pet digest is not a secret.',
    'docs/discovery/pet-digest.json:generic-api-key:16',
    `${'a'.repeat(40)}:services/pet/openapi.yaml:generic-api-key:3`,
    '',
    '# Mixed paragraph.',
    'services/pet/openapi.yaml:generic-api-key:3',
    'services/petstore/openapi.json:generic-api-key:9',
  );
  const removed = (file) =>
    file === 'docs/discovery/pet-digest.json' || file.startsWith('services/pet/');
  const result = editGitleaksIgnore(source, removed);
  assert.equal(
    result.text,
    text('# Header.', '', '# Mixed paragraph.', 'services/petstore/openapi.json:generic-api-key:9'),
  );
  assert.equal(result.changes.length, 3);
});

test('NOTICE loses the notice that covers only files of the pack, with its licence text', () => {
  const source = text(
    'Framework',
    '',
    'The petstore pack includes services/petstore/openapi.json, licensed under Apache-2.0.',
    '',
    'The pet pack includes services/pet/openapi.yaml, from the example/pet project, under MIT:',
    '',
    '    MIT License',
    '',
    '    Permission is hereby granted.',
    '',
    'The pet-admin pack includes services/pet-admin/openapi.json.',
  );
  const removed = (file) => file.startsWith('services/pet/');
  assert.equal(
    editNotice(source, 'pet', removed).text,
    text(
      'Framework',
      '',
      'The petstore pack includes services/petstore/openapi.json, licensed under Apache-2.0.',
      '',
      'The pet-admin pack includes services/pet-admin/openapi.json.',
    ),
  );
  const shared = editNotice(
    text('For services/pet/openapi.json and scripts/x/pet.json.'),
    'pet',
    removed,
  );
  assert.deepEqual(shared.changes, []);
  assert.match(shared.notes[0], /together with files that stay/);
});

test('.env.example and .actrc lose only the pack variables, never the framework ones', () => {
  const env = text(
    '# Which environment.',
    'QA_ENV=local',
    '',
    '# Override one pack URL: QA_<PACK>_BASE_URL.',
    'QA_PET_BASE_URL=',
    '# QA_PET_SPEC_URL=',
    'QA_PETSTORE_BASE_URL=',
    '# QA_TM_PROVIDER=allure-testops',
    '',
    '# The pet pack (services/pet): its users.',
    'PET_TOKEN=',
    '',
    '# Shared between packs.',
    'SHARED_TOKEN=',
    'PET_ADMIN_TOKEN=',
    '',
    '# Ports.',
    '# PET_PORT=8080',
    '# PETSTORE_PORT=8090',
  );
  assert.equal(
    editVariables(env, scope).text,
    text(
      '# Which environment.',
      'QA_ENV=local',
      '',
      '# Override one pack URL: QA_<PACK>_BASE_URL.',
      'QA_PETSTORE_BASE_URL=',
      '# QA_TM_PROVIDER=allure-testops',
      '',
      '# Shared between packs.',
      'SHARED_TOKEN=',
      'PET_ADMIN_TOKEN=',
      '',
      '# Ports.',
      '# PETSTORE_PORT=8090',
    ),
  );
  const actrc = text('-P ubuntu-24.04=image', '--env QA_PET_BASE_URL=http://h', '--env QA_ENV=ci');
  assert.equal(editVariables(actrc, scope).text, text('-P ubuntu-24.04=image', '--env QA_ENV=ci'));
});

test('a required check that named a removed job leaves the ruleset and the expected list', () => {
  const ruleset = JSON.stringify(
    {
      rules: [
        { type: 'deletion' },
        {
          type: 'required_status_checks',
          parameters: {
            required_status_checks: [
              { context: 'gates' },
              { context: 'e2e (pet)' },
              { context: 'e2e (petstore)' },
            ],
          },
        },
      ],
    },
    null,
    2,
  );
  const result = editRuleset(ruleset, ['e2e (pet)']);
  assert.deepEqual(result.removed, ['e2e (pet)']);
  assert.deepEqual(
    JSON.parse(result.text).rules[1].parameters.required_status_checks.map((c) => c.context),
    ['gates', 'e2e (petstore)'],
  );
  const testSource = "assert.deepEqual(names, ['title', 'gates', 'e2e (pet)', 'e2e (petstore)']);";
  assert.deepEqual(editRulesetTest(testSource, ['e2e (pet)']), {
    text: "assert.deepEqual(names, ['title', 'gates', 'e2e (petstore)']);",
    missing: [],
  });
  assert.deepEqual(editRulesetTest(testSource, ['e2e (other)']).missing, ['e2e (other)']);
  // A name with a quote or a backslash is matched as the JS literal that holds it.
  const escaped = String.raw`assert.deepEqual(names, ['title', 'it\'s a\\b', 'gates']);`;
  assert.deepEqual(editRulesetTest(escaped, [String.raw`it's a\b`]), {
    text: "assert.deepEqual(names, ['title', 'gates']);",
    missing: [],
  });
});

/** A repository with the packs and the files a removal reads. */
function fixtureRepo(
  packs = PACKS,
  { workflow = WORKFLOW, scripts = SCRIPTS, config = CONFIG } = {},
) {
  const root = tempDir('remove-service-');
  const write = (file, content) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), content);
  };
  for (const pack of packs) {
    write(`services/${pack}/service.json`, JSON.stringify({ name: pack, version: 'v1' }));
    write(`.claude/skills/${pack}-api/SKILL.md`, `# ${pack}\n`);
    write(`docs/discovery/${pack}-digest.json`, '{}\n');
  }
  write('package.json', `${JSON.stringify({ scripts }, null, 2)}\n`);
  write('qa-config.example.json', `${JSON.stringify(config, null, 2)}\n`);
  write('docker-compose.yml', COMPOSE);
  write('.github/workflows/ci.yml', workflow);
  write(
    '.github/workflows/codeql.yml',
    text(
      'name: codeql',
      'on: push',
      'jobs:',
      '  analyze:',
      '    steps:',
      '      - run: echo ${{ github.ref }}',
    ),
  );
  write(
    '.github/rulesets/main.json',
    `${JSON.stringify({ rules: [{ type: 'required_status_checks', parameters: { required_status_checks: [{ context: 'title' }, { context: 'e2e (pet)' }] } }] }, null, 2)}\n`,
  );
  write(
    '.env.example',
    text(
      'QA_ENV=local',
      'QA_TM_PROVIDER=',
      'GITHUB_TOKEN=',
      'QA_PETSTORE_BASE_URL=',
      'QA_PET_BASE_URL=',
    ),
  );
  write('.actrc', text('--env QA_PETSTORE_BASE_URL=http://h', '--env QA_ENV=ci'));
  write('CHANGELOG.md', '# Changelog\n\n- Added the pet pack.\n');
  write('docs/backlog.md', '| PET-01 | the pet pack |\n');
  return root;
}

test('the plan deletes and edits what belongs to the pack, never a history file, and changes nothing', () => {
  const root = fixtureRepo();
  const plan = planRemoval({ name: 'pet', root });
  assert.deepEqual(plan.deletions, [
    'services/pet/',
    '.claude/skills/pet-api/',
    'docs/discovery/pet-digest.json',
  ]);
  assert.deepEqual([...plan.edits.keys()].sort(), [
    '.env.example',
    '.github/rulesets/main.json',
    '.github/workflows/ci.yml',
    'docker-compose.yml',
    'package.json',
    'qa-config.example.json',
  ]);
  assert.ok(!plan.edits.has('.actrc'), 'QA_ENV and another pack override stay');
  assert.deepEqual(plan.removedChecks, ['e2e (pet)']);
  assert.ok(existsSync(join(root, 'services/pet/service.json')), 'planning writes nothing');

  applyRemoval(plan, root);
  assert.ok(!existsSync(join(root, 'services/pet')) && existsSync(join(root, 'services/petstore')));
  assert.equal(
    readFileSync(join(root, 'CHANGELOG.md'), 'utf8'),
    '# Changelog\n\n- Added the pet pack.\n',
  );
  assert.equal(
    readFileSync(join(root, '.env.example'), 'utf8'),
    text('QA_ENV=local', 'QA_TM_PROVIDER=', 'GITHUB_TOKEN=', 'QA_PETSTORE_BASE_URL='),
  );
});

test('a required check of a matrix job goes by the names the job reports, not by its written name', () => {
  const root = fixtureRepo();
  writeFileSync(
    join(root, '.github/workflows/scan.yml'),
    text(
      'name: scan',
      'on: pull_request',
      'jobs:',
      '  scan-pet:',
      '    name: scan (pet ${{ matrix.mode }})',
      '    strategy:',
      '      matrix:',
      '        mode: [secure, vulnerable]',
      '    steps:',
      '      - run: npm run pet:up',
      '  scan-petstore:',
      '    name: scan (petstore ${{ matrix.mode }})',
      '    strategy:',
      '      matrix:',
      '        mode: [secure]',
      '    steps:',
      '      - run: npm run petstore:up',
    ),
  );
  const checks = ['title', 'scan (pet secure)', 'scan (pet vulnerable)', 'scan (petstore secure)'];
  writeFileSync(
    join(root, '.github/rulesets/main.json'),
    `${JSON.stringify({ rules: [{ type: 'required_status_checks', parameters: { required_status_checks: checks.map((context) => ({ context })) } }] }, null, 2)}\n`,
  );
  const plan = planRemoval({ name: 'pet', root });
  assert.deepEqual(plan.removedChecks, ['scan (pet secure)', 'scan (pet vulnerable)']);
  applyRemoval(plan, root);
  assert.deepEqual(
    JSON.parse(
      readFileSync(join(root, '.github/rulesets/main.json'), 'utf8'),
    ).rules[0].parameters.required_status_checks.map((check) => check.context),
    ['title', 'scan (petstore secure)'],
  );
});

test('a workflow with CRLF line endings is edited and keeps them', () => {
  const root = fixtureRepo(PACKS, { workflow: WORKFLOW.replace(/\n/g, '\r\n') });
  const plan = planRemoval({ name: 'pet', root });
  const edited = plan.edits.get('.github/workflows/ci.yml');
  assert.ok(edited.includes('\r\n') && !/[^\r]\n/.test(edited));
  assert.deepEqual(Object.keys(parseYaml(edited).jobs), ['title', 'e2e-petstore', 'perf', 'dast']);
});

test('the plan refuses a bad name, a missing pack, the last pack and a reserved name', () => {
  const root = fixtureRepo();
  assert.throws(() => planRemoval({ name: 'Pet', root }), /Name the pack/);
  assert.throws(() => planRemoval({ name: undefined, root }), /Name the pack/);
  assert.throws(() => planRemoval({ name: 'shop', root }), /No service pack "shop"/);
  assert.throws(
    () => planRemoval({ name: 'pet', root: fixtureRepo(['pet']) }),
    /pet is the only pack/,
  );
  const reserved = fixtureRepo(['github', 'qa', 'lint', 'petstore']);
  for (const name of ['github', 'qa', 'lint']) {
    assert.throws(
      () => planRemoval({ name, root: reserved }),
      /is also a word of the framework/,
      name,
    );
  }
});

test('a pack named like framework vocabulary touches nothing of the framework, even unguarded', () => {
  const config = {
    api: {
      default_environment: 'local',
      environments: {
        local: {
          packs: {
            github: { base_url: 'http://g', auth: { type: 'bearer', env: 'GITHUB_TOKEN' } },
            qa: { base_url: 'http://q', auth: { type: 'bearer', env: 'QA_SECRET' } },
            petstore: { base_url: 'http://p', auth: { type: 'bearer', env: 'GITHUB_TOKEN' } },
          },
        },
      },
    },
  };
  const root = fixtureRepo(['github', 'qa', 'petstore'], {
    config,
    scripts: { 'petstore:up': 'docker compose up -d petstore' },
  });
  for (const name of ['github', 'qa']) {
    const plan = planRemoval({ name, root, reserved: [] });
    assert.ok(!plan.edits.has('.github/workflows/codeql.yml'), `${name}: codeql.yml`);
    assert.ok(!plan.edits.has('.github/rulesets/main.json'), `${name}: the ruleset`);
    const ci = plan.edits.get('.github/workflows/ci.yml');
    if (ci !== undefined) assert.ok('title' in parseYaml(ci).jobs, `${name}: the title job`);
    const env = plan.edits.get('.env.example') ?? readFileSync(join(root, '.env.example'), 'utf8');
    for (const variable of [
      'QA_ENV=',
      'QA_TM_PROVIDER=',
      'GITHUB_TOKEN=',
      'QA_PETSTORE_BASE_URL=',
    ]) {
      assert.ok(env.includes(variable), `${name}: ${variable}`);
    }
    assert.ok(!plan.edits.has('.actrc'), `${name}: .actrc`);
  }
});

test('a plan with an error is not applied', () => {
  const root = fixtureRepo();
  const config = structuredClone(CONFIG);
  config.api.default_environment = 'local-pet';
  writeFileSync(join(root, 'qa-config.example.json'), JSON.stringify(config, null, 2));
  const plan = planRemoval({ name: 'pet', root });
  assert.match(describeRemoval(plan), /Cannot remove:/);
  assert.throws(() => applyRemoval(plan, root), /nothing removed/);
  assert.ok(existsSync(join(root, 'services/pet/service.json')));
});

test('a compose edit that would leave a dependency dangling is not made, and is listed', () => {
  const root = fixtureRepo();
  const compose = COMPOSE.replace(
    '  db:\n    image: example/db:1',
    '  db:\n    image: example/db:1\n    depends_on: [pet-db]',
  );
  writeFileSync(join(root, 'docker-compose.yml'), compose);
  const plan = planRemoval({ name: 'pet', root });
  assert.ok(!plan.edits.has('docker-compose.yml'));
  assert.ok(
    plan.notes.some((note) =>
      /docker-compose\.yml: not edited \(a kept service needs a removed one \(db needs pet-db\)\)/.test(
        note,
      ),
    ),
  );
});

test('untracked and ignored files under the deleted paths are named before they are lost', () => {
  const root = fixtureRepo();
  const git = (...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (git('init', '-q').status !== 0) return;
  git('add', '.');
  writeFileSync(join(root, 'services/pet/local-notes.md'), 'mine\n');
  const plan = planRemoval({ name: 'pet', root });
  assert.ok(
    plan.notes.some((note) =>
      /1 untracked or ignored file\(s\).*services\/pet\/local-notes\.md/.test(note),
    ),
  );
});

// This repository, on a copy of the files a removal reads: every pack it holds (both example packs,
// until an adopter removes one) can be removed by the command, each edit parses back, nothing that
// runs the pack is left, everything of the other packs and of the framework survives, and a
// required check that was its job leaves the ruleset and its test. With one pack left, the command
// refuses it.
const PACKS_HERE = servicePacks(REPO_ROOT);
const SHARED = [
  'package.json',
  'qa-config.example.json',
  'docker-compose.yml',
  '.github',
  'Jenkinsfile',
  'Jenkinsfile.drift',
  'scripts/__tests__/ruleset.test.mjs',
  '.gitleaksignore',
  'NOTICE',
  '.env.example',
  '.actrc',
  'docs/discovery',
  'helpers',
  'fixtures',
  'playwright.config.ts',
];

function copyOfRepository() {
  const root = tempDir('remove-service-real-');
  const paths = [
    ...SHARED,
    ...PACKS_HERE.flatMap((pack) => [
      `services/${pack}/service.json`,
      `.claude/skills/${pack}-api`,
    ]),
  ];
  for (const path of paths.filter((p) => existsSync(join(REPO_ROOT, p)))) {
    cpSync(join(REPO_ROOT, path), join(root, path), { recursive: true });
  }
  for (const dir of ['scripts', '.claude/hooks']) {
    const from = join(REPO_ROOT, dir);
    cpSync(from, join(root, dir), {
      recursive: true,
      filter: (source) =>
        !/[\\/](__tests__|__fixtures__|__live__)([\\/]|$)/.test(source.slice(from.length)),
    });
  }
  return root;
}

/** Every job of every workflow, `file:id` to the job. */
const jobsOf = (root) => {
  const dir = join(root, '.github', 'workflows');
  return new Map(
    readdirSync(dir).flatMap((file) =>
      Object.entries(parseYaml(readFileSync(join(dir, file), 'utf8')).jobs ?? {}).map(
        ([id, job]) => [`${file}:${id}`, job],
      ),
    ),
  );
};
const requiredOf = (root) =>
  JSON.parse(readFileSync(join(root, '.github/rulesets/main.json'), 'utf8'))
    .rules.flatMap((rule) => rule.parameters?.required_status_checks ?? [])
    .map((check) => check.context);
const stagesOf = (root, file) =>
  existsSync(join(root, file))
    ? [...readFileSync(join(root, file), 'utf8').matchAll(/stage\('([^']+)'\)/g)].map(([, n]) => n)
    : [];

for (const pack of PACKS_HERE) {
  test(`this repository: removing ${pack} leaves nothing of it and everything else`, () => {
    const root = copyOfRepository();
    if (PACKS_HERE.length < 2) {
      assert.throws(() => planRemoval({ name: pack, root }), /is the only pack/);
      return;
    }
    const model = repositoryModel(root, PACKS_HERE);
    const here = scopeFor(pack, model);
    const others = PACKS_HERE.filter((p) => p !== pack);
    const read = (file) => readFileSync(join(root, file), 'utf8');
    const config = JSON.parse(read('qa-config.example.json'));
    const jobsBefore = jobsOf(root);
    const requiredBefore = requiredOf(root);
    const stagesBefore = ['Jenkinsfile', 'Jenkinsfile.drift'].map((file) => stagesOf(root, file));
    const envBefore = read('.env.example');

    const plan = planRemoval({ name: pack, root });
    assert.deepEqual(plan.errors, []);
    assert.deepEqual(
      plan.notes.filter((note) => /not edited/.test(note)),
      [],
    );
    applyRemoval(plan, root);

    // Nothing of the pack is left.
    const scripts = JSON.parse(read('package.json')).scripts;
    assert.deepEqual(
      Object.keys(scripts).filter((name) => here.scripts.includes(name)),
      [],
    );
    const configAfter = JSON.parse(read('qa-config.example.json'));
    for (const entry of Object.values(configAfter.api.environments))
      assert.ok(!(pack in entry.packs));
    const compose = parseYaml(read('docker-compose.yml'), { merge: true });
    assert.deepEqual(
      Object.keys(compose.services).filter((name) => here.services.includes(name)),
      [],
    );
    const jobsAfter = jobsOf(root);
    for (const [key, job] of jobsAfter)
      assert.ok(!here.owns(JSON.stringify(job)), `${key} runs only ${pack}`);

    // Everything of the other packs and of the framework survives.
    for (const other of others) {
      for (const script of model[other].scripts) assert.ok(script in scripts, `script ${script}`);
      for (const service of model[other].services)
        assert.ok(service in compose.services, `service ${service}`);
      for (const [env, entry] of Object.entries(config.api.environments)) {
        if (other in (entry.packs ?? {}))
          assert.ok(other in configAfter.api.environments[env].packs, `${env}.${other}`);
      }
      for (const variable of model[other].variables) {
        if (envBefore.includes(`${variable}=`))
          assert.ok(read('.env.example').includes(`${variable}=`), variable);
      }
    }
    for (const [key, job] of jobsBefore) {
      if (!here.has(JSON.stringify(job))) assert.ok(jobsAfter.has(key), `${key} survives`);
      if (here.hasOther(JSON.stringify(job)))
        assert.ok(jobsAfter.has(key), `${key} of another pack survives`);
    }
    ['Jenkinsfile', 'Jenkinsfile.drift'].forEach((file, n) => {
      const kept = stagesOf(root, file);
      for (const stage of stagesBefore[n]) {
        if (!stage.includes(`(${pack})`))
          assert.ok(kept.includes(stage), `${file}: stage ${stage}`);
      }
    });
    const requiredAfter = requiredOf(root);
    assert.deepEqual(
      requiredAfter,
      requiredBefore.filter((check) => !plan.removedChecks.includes(check)),
    );

    // A required check whose job is gone left the ruleset, its test and the notes.
    const names = (jobs) =>
      [...jobs].flatMap(([key, job]) => checkNamesOf(key.slice(key.indexOf(':') + 1), job));
    const gone = requiredBefore.filter(
      (c) => names(jobsBefore).includes(c) && !names(jobsAfter).includes(c),
    );
    assert.deepEqual(plan.removedChecks, gone);
    for (const check of gone) {
      assert.ok(!read('scripts/__tests__/ruleset.test.mjs').includes(`'${check}'`));
      assert.ok(
        plan.notes.some((note) => /GitHub still requires/.test(note) && note.includes(check)),
        `a note names ${check}`,
      );
    }
  });
}

// The example packs' required checks, by name: VAmPI's DAST job is a matrix job, so its checks are
// the names it reports, not its written name.
const PACK_CHECKS = {
  petstore: ['e2e (petstore)', 'dast (petstore)'],
  vampi: ['e2e (vampi)', 'dast (vampi secure)', 'dast (vampi vulnerable)'],
};
for (const [pack, checks] of Object.entries(PACK_CHECKS)) {
  test(
    `this repository: removing ${pack} drops its required checks and keeps the others`,
    {
      skip:
        (!PACKS_HERE.includes(pack) || PACKS_HERE.length < 2) &&
        `needs the ${pack} pack and another one`,
    },
    () => {
      const root = copyOfRepository();
      const required = requiredOf(root);
      const plan = planRemoval({ name: pack, root });
      assert.deepEqual(
        plan.removedChecks,
        required.filter((check) => checks.includes(check)),
      );
      applyRemoval(plan, root);
      assert.deepEqual(
        requiredOf(root),
        required.filter((check) => !checks.includes(check)),
      );
    },
  );
}
