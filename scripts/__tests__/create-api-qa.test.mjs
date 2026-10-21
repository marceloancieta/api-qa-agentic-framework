import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { gitEnv } from '../lib/git.mjs';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { parse } from 'yaml';
import { REPO_ROOT } from '../lib/cli.mjs';
import { buildPackage, PACKAGE_DIR } from '../build-create-package.mjs';
import {
  adoptBacklog,
  changelogHeader,
  createProject,
  main,
  projectName,
  renamePackage,
} from '../../packages/create-api-qa/lib/create.mjs';
import { paxRecords, readTar, safePath } from '../../packages/create-api-qa/lib/tar.mjs';
import { publishProblems } from '../../packages/create-api-qa/lib/prepublish.mjs';

const temporary = [];
const tempDir = (prefix) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temporary.push(dir);
  return dir;
};
after(() => {
  for (const dir of temporary) rmSync(dir, { recursive: true, force: true });
});

const git = (...args) =>
  spawnSync('git', args, {
    cwd: REPO_ROOT,
    env: gitEnv(),
    encoding: 'buffer',
    maxBuffer: 256 << 20,
  }).stdout;
const HEAD = git('rev-parse', 'HEAD').toString('utf8').trim();
const ROOT = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
const IN_FRAMEWORK = ROOT.name === 'api-qa-agentic-framework';
const PACKAGE_VERSION = JSON.parse(readFileSync(join(PACKAGE_DIR, 'package.json'), 'utf8')).version;

// A tar entry written by hand, for shapes `git archive` does not produce here.
function tarEntry(name, body, type = '0') {
  const header = Buffer.alloc(512);
  header.write(name.slice(0, 100), 0);
  header.write('0000644\0', 100);
  header.write(`${body.length.toString(8).padStart(11, '0')}\0`, 124);
  header.write('00000000000\0', 136);
  header.write(type, 156);
  header.write('ustar\0' + '00', 257);
  header.fill(0x20, 148, 156);
  let sum = 0;
  for (const byte of header) sum += byte;
  header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148);
  const padded = Buffer.alloc(Math.ceil(body.length / 512) * 512);
  body.copy(padded);
  return Buffer.concat([header, padded]);
}
const pax = (key, value) => {
  const record = ` ${key}=${value}\n`;
  let length = record.length + 1;
  while (String(length).length + record.length !== length) length += 1;
  return Buffer.from(`${length}${record}`);
};
const tar = (...entries) => Buffer.concat([...entries, Buffer.alloc(1024)]);

test('the tar reader reads a git archive: every tracked file, and the commit as its comment', () => {
  const { entries, comment } = readTar(git('archive', '--format=tar.gz', 'HEAD'));
  assert.equal(comment, HEAD);
  const files = entries.filter((entry) => entry.type === 'file').map((entry) => entry.path);
  const tracked = git('ls-tree', '-r', '-z', '--name-only', 'HEAD')
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
  assert.deepEqual(files.sort(), tracked.sort());
  const pkg = entries.find((entry) => entry.path === 'package.json');
  assert.deepEqual(pkg.data, git('show', 'HEAD:package.json'));
});

test('the tar reader takes pax paths, ustar prefixes and plain tar, and refuses what it cannot write', () => {
  const long = `${'a'.repeat(90)}/${'b'.repeat(40)}.txt`;
  const prefixed = Buffer.from(tarEntry('name.txt', Buffer.from('p')));
  prefixed.write('some/prefix', 345);
  // Recompute the checksum after writing the prefix.
  prefixed.fill(0x20, 148, 156);
  let sum = 0;
  for (const byte of prefixed.subarray(0, 512)) sum += byte;
  prefixed.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148);
  const archive = tar(
    tarEntry('pax_global_header', pax('comment', 'abc123'), 'g'),
    tarEntry('PaxHeader', pax('path', long), 'x'),
    tarEntry('ignored-short-name', Buffer.from('long')),
    prefixed,
    tarEntry('dir/', Buffer.alloc(0), '5'),
  );
  for (const input of [archive, gzipSync(archive)]) {
    const { entries, comment } = readTar(input);
    assert.equal(comment, 'abc123');
    assert.deepEqual(
      entries.map((entry) => [entry.path, entry.type, entry.data?.toString('utf8')]),
      [
        [long, 'file', 'long'],
        ['some/prefix/name.txt', 'file', 'p'],
        ['dir', 'directory', undefined],
      ],
    );
  }
  assert.throws(() => readTar(tar(tarEntry('link', Buffer.alloc(0), '2'))), /type "2"/);
  const corrupt = tar(tarEntry('x.txt', Buffer.from('x')));
  corrupt[0] = 0x79;
  assert.throws(() => readTar(corrupt), /bad checksum/);
  assert.deepEqual(paxRecords(pax('path', 'a=b')), { path: 'a=b' });
  for (const path of ['a/b.txt', '.github/ci.yml', 'x..y/z'])
    assert.ok(safePath(path), `${path} is safe`);
  for (const path of ['', '/etc/passwd', '../x', 'a/../../x', 'C:/x', 'a\\b'])
    assert.ok(!safePath(path), `${path} is refused`);
});

test('a project name comes from the directory, and the adoption edits follow the guide', () => {
  assert.equal(projectName('/work/My API Tests'), 'my-api-tests');
  assert.equal(projectName('./.hidden_dir'), 'hidden_dir');
  assert.throws(() => projectName('/work/!!!'), /pass --name/);

  const template = readFileSync(join(REPO_ROOT, 'docs', 'templates', 'backlog.md'), 'utf8');
  const backlog = adoptBacklog(template, { version: '9.9.9', commit: 'abc1234' });
  assert.match(
    backlog,
    /\| REPO-01 \| Adopt the framework with `npm create api-qa` from release `v9\.9\.9`, framework commit `abc1234`/,
  );
  assert.ok(!backlog.includes('<commit>'));
  assert.throws(() => adoptBacklog('# Backlog\n', { version: '1', commit: 'x' }), /REPO-01/);

  assert.equal(
    changelogHeader('# Changelog\n\nIntro.\n\n## [1.0.0] - x\n\n- a\n'),
    '# Changelog\n\nIntro.\n',
  );
  assert.equal(changelogHeader('# Changelog\n'), '# Changelog\n');

  const { pkg, lock } = renamePackage(
    { name: 'fw', version: '1.2.3', private: true, description: 'd', author: 'Framework Author' },
    {
      name: 'fw',
      version: '1.2.3',
      lockfileVersion: 3,
      packages: { '': { name: 'fw', version: '1.2.3', x: 1 } },
    },
    { name: 'mine', author: '' },
  );
  assert.deepEqual(Object.keys(pkg), ['name', 'version', 'private', 'description']);
  assert.deepEqual([pkg.name, pkg.version, pkg.private], ['mine', '0.0.0', true]);
  assert.deepEqual(
    [lock.name, lock.version, lock.packages[''].name, lock.packages[''].x],
    ['mine', '0.0.0', 'mine', 1],
  );
  assert.equal(
    renamePackage({ author: 'A' }, { packages: {} }, { name: 'm', author: 'Me' }).pkg.author,
    'Me',
  );
});

/**
 * A one-commit repository standing in for a framework release, at `version`: the files a build and
 * a creation read, copied from this repository. It keeps the test independent of this
 * repository's own version, which is `0.0.0` in a project created from the template.
 */
function releaseRepository(version) {
  const root = tempDir('create-release-');
  const files = [
    // Its eol=lf keeps `git archive` from writing CRLF where git is set to core.autocrlf.
    '.gitattributes',
    'LICENSE',
    'NOTICE',
    'CHANGELOG.md',
    'package-lock.json',
    'docs/templates/backlog.md',
    'services/petstore/service.json',
  ];
  for (const file of files) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), readFileSync(join(REPO_ROOT, file)));
  }
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
  writeFileSync(join(root, 'package.json'), `${JSON.stringify({ ...pkg, version }, null, 2)}\n`);
  const inRoot = (...args) =>
    spawnSync('git', args, { cwd: root, env: gitEnv(), encoding: 'utf8' });
  inRoot('init', '-q');
  inRoot('add', '-A');
  inRoot('-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-q', '-m', 'x');
  return { root, commit: inRoot('rev-parse', 'HEAD').stdout.trim() };
}

test('the package is built from a release with its own version, and creates a project from it', () => {
  const out = tempDir('create-pkg-');
  const source = releaseRepository(PACKAGE_VERSION);
  const release = buildPackage({ ref: 'HEAD', out, root: source.root });
  assert.deepEqual(release, { version: PACKAGE_VERSION, ref: 'HEAD', commit: source.commit });
  assert.deepEqual(JSON.parse(readFileSync(join(out, 'framework.json'), 'utf8')), release);
  assert.deepEqual(readFileSync(join(out, 'LICENSE')), readFileSync(join(REPO_ROOT, 'LICENSE')));
  // A release whose framework version differs from the package's is refused.
  assert.throws(
    () => buildPackage({ ref: 'HEAD', out, root: releaseRepository('0.0.1').root }),
    new RegExp(`create-api-qa is ${PACKAGE_VERSION}, but the framework at HEAD is 0\\.0\\.1`),
  );

  const target = join(tempDir('create-project-'), 'Shop API Tests');
  const lines = [];
  const done = createProject(target, {
    archive: readFileSync(join(out, 'framework.tar.gz')),
    release,
    git: false,
    install: false,
    log: (line) => lines.push(line),
  });
  assert.deepEqual([done.name, done.committed, done.installed], ['shop-api-tests', false, false]);
  const read = (file) => readFileSync(join(target, file), 'utf8');
  assert.match(
    read('docs/backlog.md'),
    new RegExp(`release \`v${PACKAGE_VERSION}\`, framework commit \`${source.commit}\``),
  );
  assert.doesNotMatch(read('docs/backlog.md'), /\| GATE-\d+ \|/, 'the framework backlog is gone');
  assert.doesNotMatch(read('CHANGELOG.md'), /^## \[/m);
  assert.equal(JSON.parse(read('package.json')).name, 'shop-api-tests');
  assert.equal(JSON.parse(read('package-lock.json')).packages[''].version, '0.0.0');
  assert.deepEqual(
    readFileSync(join(target, 'services', 'petstore', 'service.json')),
    readFileSync(join(source.root, 'services', 'petstore', 'service.json')),
  );
  assert.ok(lines[0].startsWith(`Unpacked the framework ${PACKAGE_VERSION}`));

  // A target that is not empty is refused before anything is written; so is a bad name.
  assert.throws(
    () => createProject(target, { archive: Buffer.alloc(0), release, git: false, install: false }),
    /exists and is not empty/,
  );
  const empty = join(tempDir('create-name-'), 'x');
  assert.throws(
    () =>
      createProject(empty, {
        archive: Buffer.alloc(0),
        release,
        name: 'Bad Name',
        git: false,
        install: false,
      }),
    /not a package name npm accepts/,
  );
});

test('the CLI prints its usage without one directory, and the package version follows the framework', () => {
  const lines = [];
  assert.equal(main([], { packageDir: PACKAGE_DIR, log: (line) => lines.push(line) }), 2);
  assert.equal(main(['--help'], { packageDir: PACKAGE_DIR, log: (line) => lines.push(line) }), 0);
  assert.match(lines[0], /^Usage: npm create api-qa <directory>/);
});

test('publishing refuses a package without its release files or built from another tag', () => {
  const dir = tempDir('create-publish-');
  writeFileSync(join(dir, 'package.json'), '{ "version": "1.2.3" }\n');
  assert.deepEqual(publishProblems(dir), [
    'missing framework.tar.gz, framework.json, LICENSE, NOTICE: run npm run create:build from the release tag',
  ]);
  for (const file of ['framework.tar.gz', 'LICENSE', 'NOTICE']) writeFileSync(join(dir, file), 'x');
  const release = (version, ref) =>
    writeFileSync(join(dir, 'framework.json'), JSON.stringify({ version, ref, commit: 'c' }));
  release('1.2.3', 'HEAD');
  assert.deepEqual(publishProblems(dir), [
    'framework.json was built from HEAD, not from the tag v1.2.3',
  ]);
  release('1.2.2', 'v1.2.2');
  assert.equal(publishProblems(dir).length, 2);
  release('1.2.3', 'v1.2.3');
  assert.deepEqual(publishProblems(dir), []);
  const pkg = JSON.parse(readFileSync(join(PACKAGE_DIR, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts.prepublishOnly, 'node lib/prepublish.mjs');
});

// CI-10: the package is published by .github/workflows/publish.yml, with the OIDC token of that
// workflow alone. A copy keeps the file, and the repository guard skips the job there.
test('the package is published from a release tag of its own repository, with no stored token', () => {
  const workflowDir = join(REPO_ROOT, '.github', 'workflows');
  const text = readFileSync(join(workflowDir, 'publish.yml'), 'utf8');
  const workflow = parse(text);
  assert.deepEqual(workflow.on, { push: { tags: ['v[0-9]+.[0-9]+.[0-9]+'] } });
  assert.deepEqual(workflow.permissions, {});
  const jobs = Object.values(workflow.jobs);
  assert.equal(jobs.length, 1);
  const [job] = jobs;
  const { repository } = JSON.parse(readFileSync(join(PACKAGE_DIR, 'package.json'), 'utf8'));
  const [, slug] = repository.url.match(/github\.com\/(.+?)(?:\.git)?$/);
  assert.equal(job.if, `\${{ github.repository == '${slug}' }}`);
  assert.equal(job.environment, 'npm');
  assert.deepEqual(job.permissions, { contents: 'read', 'id-token': 'write' });
  assert.doesNotMatch(text, /secrets\.|NODE_AUTH_TOKEN|NPM_TOKEN/);

  const runs = job.steps.map((step) => step.run ?? '');
  const installs = runs.join('\n').match(/npm (?:ci|install|i)\b.*/g);
  assert.deepEqual(installs, ['npm install --global npm@11.21.0']);
  assert.ok(runs.some((run) => run.includes('build-create-package.mjs --ref "$TAG"')));
  assert.ok(runs.some((run) => /^npm publish --access public --provenance$/m.test(run)));

  // No other workflow can mint the token npm trusts.
  for (const file of readdirSync(workflowDir).filter((name) => name !== 'publish.yml')) {
    assert.doesNotMatch(
      readFileSync(join(workflowDir, file), 'utf8'),
      /id-token:\s*write/,
      `${file} grants id-token: write`,
    );
  }
});

// CI-13: for v0.6.0 the registry showed the version about five minutes after the publish, and the
// read-back gave up after two. A failed read-back follows a good publish, which a re-run cannot
// repeat, so its errors say to read the version back by hand instead.
test('the read-back waits for the registry and tells a failed read-back from a failed publish', () => {
  const workflow = parse(
    readFileSync(join(REPO_ROOT, '.github', 'workflows', 'publish.yml'), 'utf8'),
  );
  const [job] = Object.values(workflow.jobs);
  const steps = job.steps.map((step) => step.name);
  const step = job.steps.at(-1);
  assert.equal(step.name, 'Read the published version back');
  assert.ok(steps.indexOf('Publish with provenance') < steps.indexOf(step.name));

  const minutes = step.env.READBACK_MINUTES;
  assert.ok(Number.isInteger(minutes) && minutes >= 10, `waits ${minutes} minutes`);
  assert.ok(job['timeout-minutes'] >= minutes + 10, 'the job outlasts the wait');
  assert.match(step.run, /deadline=\$\(\(SECONDS \+ READBACK_MINUTES \* 60\)\)/);
  assert.match(step.run, /npm view "create-api-qa@\$\{version\}" version/);

  const byHand = step.run.match(/^by_hand="(.+)"$/m)?.[1] ?? '';
  assert.match(byHand, /was published \(the publish step succeeded\)/);
  assert.match(byHand, /a re-run cannot publish it again/);
  assert.match(byHand, /npm view create-api-qa@\$\{version\} version/);
  assert.match(byHand, /by hand outside the repository/);
  assert.match(byHand, /npm create api-qa@\$\{version\} readback -- --skip-install --skip-git/);
  const errors = step.run.match(/::error::.*/g);
  assert.equal(errors.length, 2);
  for (const error of errors) assert.match(error, /\$\{by_hand\}"$/);
});

// Released together: `npm version` at the root and in the package (CONTRIBUTING, releases). Only
// in the framework's own repository: a project created from it has its own name and version.
test('the package version follows the framework version', { skip: !IN_FRAMEWORK }, () => {
  assert.equal(PACKAGE_VERSION, ROOT.version);
});
