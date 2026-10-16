// `npm create api-qa <dir>`: a new project from the framework release this package carries, with the
// adoption steps of docs/guides/adopt-the-template.md (step 3) already applied: its own backlog with
// REPO-01, its own changelog, its own name and version. Then a first commit and `npm ci`, unless
// skipped. The repository settings of step 2 stay with the person: they need a GitHub repository.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { readTar, safePath } from './tar.mjs';

// npm keeps the flags before `--` for itself, so the package's own flags come after it.
export const USAGE =
  'Usage: npm create api-qa <directory> -- [--name <package-name>] [--skip-git] [--skip-install]';

// npm's rule for a package name, scoped or not.
const NAME = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

/** A package name npm accepts, from a directory name: lowercase, URL-safe, at most 214 characters. */
export function projectName(directory) {
  const name = basename(resolve(directory))
    .toLowerCase()
    .replace(/[^a-z0-9._~-]+/g, '-')
    .replace(/^[._-]+|[-]+$/g, '')
    .slice(0, 214);
  if (!name) throw new Error(`Cannot make a package name from "${directory}"; pass --name.`);
  return name;
}

const REPO_01 = /from its template, starting from framework commit `<commit>`/;

/** The backlog template with REPO-01 naming the release and commit the project starts from. */
export function adoptBacklog(template, { version, commit }) {
  if (!REPO_01.test(template))
    throw new Error('docs/templates/backlog.md has no REPO-01 row with a `<commit>` placeholder.');
  return template.replace(
    REPO_01,
    `with \`npm create api-qa\` from release \`v${version}\`, framework commit \`${commit}\``,
  );
}

/** The changelog's header: everything before the first release section. */
export function changelogHeader(changelog) {
  const first = changelog.search(/^## \[/m);
  return first < 0 ? changelog : `${changelog.slice(0, first).trimEnd()}\n`;
}

/** package.json and package-lock.json renamed for the new project, at version 0.0.0. */
export function renamePackage(pkg, lock, { name, author }) {
  // The framework's author is not the project's: the git user replaces it, or it goes.
  const renamed = {
    ...pkg,
    name,
    version: '0.0.0',
    description: 'API tests built on the API QA agentic framework.',
    author,
  };
  if (!author) delete renamed.author;
  const lockRoot = lock.packages?.[''] ?? {};
  const renamedLock = {
    ...lock,
    name,
    version: '0.0.0',
    packages: { ...lock.packages, '': { ...lockRoot, name, version: '0.0.0' } },
  };
  return { pkg: renamed, lock: renamedLock };
}

function emptyOrMissing(dir) {
  return !existsSync(dir) || readdirSync(dir).length === 0;
}

// git's own variables (GIT_DIR, GIT_INDEX_FILE, ...), which a calling git hook exports, would point
// every git command at that repository instead of the project being created (GATE-25).
const withoutGit = (env) =>
  Object.fromEntries(Object.entries(env).filter(([name]) => !/^GIT_/i.test(name)));

const run = (command, args, cwd, options = {}) =>
  spawnSync(command, args, { cwd, encoding: 'utf8', env: withoutGit(process.env), ...options });

const gitConfig = (key) => {
  const result = run('git', ['config', '--get', key], process.cwd());
  return result.status === 0 ? result.stdout.trim() : '';
};

/**
 * Creates the project in `target` from `archive` (the framework release as a tar.gz) and `release`
 * (`{ version, commit }`). Returns what it did; throws before writing anything when it cannot.
 */
export function createProject(
  target,
  { archive, release, name = projectName(target), git = true, install = true, log = () => {} },
) {
  const dir = resolve(target);
  if (!emptyOrMissing(dir)) throw new Error(`${dir} exists and is not empty.`);
  if (!NAME.test(name))
    throw new Error(
      `"${name}" is not a package name npm accepts (lowercase, URL-safe, no spaces).`,
    );
  const { entries } = readTar(archive);
  const unsafe = entries.filter((entry) => !safePath(entry.path));
  if (unsafe.length > 0) throw new Error(`The archive holds unsafe paths: ${unsafe[0].path}`);

  mkdirSync(dir, { recursive: true });
  for (const entry of entries) {
    const path = join(dir, ...entry.path.split('/'));
    if (entry.type === 'directory') mkdirSync(path, { recursive: true });
    else {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, entry.data, { mode: entry.mode & 0o777 || 0o644 });
    }
  }
  log(`Unpacked the framework ${release.version} (${release.commit.slice(0, 7)}) into ${dir}.`);

  // Adoption, step 3: own backlog, own changelog, own name.
  const read = (file) => readFileSync(join(dir, file), 'utf8');
  const write = (file, content) => writeFileSync(join(dir, file), content);
  write('docs/backlog.md', adoptBacklog(read('docs/templates/backlog.md'), release));
  write('CHANGELOG.md', changelogHeader(read('CHANGELOG.md')));
  const renamed = renamePackage(
    JSON.parse(read('package.json')),
    JSON.parse(read('package-lock.json')),
    {
      name,
      author: git ? gitConfig('user.name') : '',
    },
  );
  write('package.json', `${JSON.stringify(renamed.pkg, null, 2)}\n`);
  write('package-lock.json', `${JSON.stringify(renamed.lock, null, 2)}\n`);
  log(`Started your own backlog (REPO-01) and changelog; the package is ${name}@0.0.0.`);

  const done = { dir, name, committed: false, installed: false };
  if (git) {
    if (!gitConfig('user.email')) {
      log(
        'git has no user.email, so there is no repository yet: set it, then run `git init -b main`, `git add -A` and commit.',
      );
    } else {
      const steps = [
        ['init', '-b', 'main'],
        ['add', '-A'],
        [
          'commit',
          '-q',
          '-m',
          `chore(repo): REPO-01 start from the framework release v${release.version}`,
        ],
      ];
      for (const args of steps) {
        const result = run('git', args, dir);
        if (result.status !== 0) {
          log(`git ${args[0]} failed: ${(result.stderr || result.stdout).trim()}`);
          return done;
        }
      }
      done.committed = true;
      log('Committed the files on main.');
    }
  }
  if (install) {
    log('Installing the dependencies (npm ci)...');
    const result = run('npm', ['ci'], dir, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    done.installed = result.status === 0;
    if (!done.installed) log('npm ci failed; run it again in the project.');
  }
  return done;
}

export function nextSteps({ dir, installed }) {
  return [
    '',
    'Next:',
    `  cd "${dir}"`,
    ...(installed ? [] : ['  npm ci']),
    '  cp .env.example .env            # then fill in what your packs need',
    '  npm run gates                   # passes before you change anything',
    '  gh repo create <owner>/<name> --private --source . --push',
    '',
    'Then set up the GitHub repository (rules, squash merges, required checks) as in',
    'docs/guides/adopt-the-template.md, step 2, and add your first pack with',
    '`npm run scaffold:service` (docs/guides/add-a-service-pack.md).',
  ].join('\n');
}

export function main(argv, { packageDir, log = console.log }) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      name: { type: 'string' },
      'skip-git': { type: 'boolean' },
      'skip-install': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help || positionals.length !== 1) {
    log(USAGE);
    return values.help ? 0 : 2;
  }
  const release = JSON.parse(readFileSync(join(packageDir, 'framework.json'), 'utf8'));
  const archive = readFileSync(join(packageDir, 'framework.tar.gz'));
  const done = createProject(positionals[0], {
    archive,
    release,
    name: values.name ?? projectName(positionals[0]),
    git: !values['skip-git'],
    install: !values['skip-install'],
    log,
  });
  log(nextSteps(done));
  return 0;
}
