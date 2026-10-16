#!/usr/bin/env node
/**
 * Takes a later framework release into a copy of the framework (FUT-14): a repository created from
 * the template or with `npm create api-qa`, which shares no history with the framework, so the
 * release arrives as the difference between the release the copy is on and the new one, applied
 * with a three-way merge (docs/guides/adopt-the-template.md, step 5).
 *
 *   node scripts/framework-update.mjs --to v<x.y.z> [--from v<x.y.z>|<commit>] [--remote <url>]
 *                                     [--dry-run]
 *       (`npm run framework:update -- --to v<x.y.z>`)
 *
 * Where the copy starts from: --from, else the release `.framework-release` holds (each update
 * writes it and stages it with the changes), else the REPO-01 row of docs/backlog.md: the release
 * `npm create api-qa` unpacked, or the framework commit of a template copy. Without any, it asks
 * for --from. Other backlog rows are never read: an open row may name a release still to take.
 *
 * The repository: --remote, else the URL of the `framework` remote an earlier update added, else
 * the repository that packages/create-api-qa/package.json names. Its tags are fetched into
 * refs/framework/tags/, because the copy's own releases also start at v0.1.0.
 *
 * What is left out of the release, decided from the copy's own state:
 *   - docs/backlog.md and CHANGELOG.md, the copy's own since adoption (step 3 of the guide), and
 *     `.framework-release`;
 *   - the files of a pack the old release had and the copy does not (`packPaths` of
 *     remove-service: the pack's directory, its skill and its digest);
 *   - a changed or deleted file the copy no longer has, a file added under a directory the copy
 *     deleted, and a deleted file the copy has changed: `git apply` changes nothing at all when one
 *     patched file is missing or does not match.
 * Every other change goes into one patch for `git apply -3`, which merges into files the copy
 * changed too and leaves conflict markers where both sides changed the same lines. An added file
 * whose name points to a removed pack is applied and marked, for the adopter to decide on.
 *
 * Guards: --to must be a release tag later than where the copy starts, the working tree must be
 * clean, so that `git reset --hard` undoes the update, and no file the release adds may sit on disk
 * untracked (an ignored file), at its path or at one of its directories, which would make the apply
 * fail half done. Where the file system ignores case (core.ignorecase), a rename that changes only
 * the case of a path is refused too: git apply cannot make it there, in either order. --dry-run fetches into a
 * temporary repository and prints the plan: the copy, its refs and its remotes stay as they are. A
 * refusal after the fetch removes the remote and the tags the run added.
 *
 * Exit codes: 0 applied (or a dry run, or nothing to apply), 1 refused with nothing applied, or
 * `git apply` failed (the message says whether it left changes), 2 applied with conflicts left for
 * a person.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { readTextIfExists, REPO_ROOT, servicePacks } from './lib/cli.mjs';
import { gitEnv } from './lib/git.mjs';
import { describeExit, exitCodeOf } from './lib/spawn.mjs';
import { packPaths } from './remove-service.mjs';

export const USAGE =
  'Usage: npm run framework:update -- --to v<x.y.z> [--from v<x.y.z>|<commit>] [--remote <url>] [--dry-run]';
export const REMOTE = 'framework';
export const TAG_NAMESPACE = 'refs/framework/tags/';
/** The release the copy is on, written by each update; the next one starts from it. */
export const RECORD_FILE = '.framework-release';
/** The copy's own files (step 3 of the guide, and the record above): a release never replaces them. */
export const ADOPTED = ['CHANGELOG.md', 'docs/backlog.md', RECORD_FILE];
/** Where the framework names its own repository. A copy may delete it, and then needs --remote. */
export const URL_OWNER = 'packages/create-api-qa/package.json';
const BACKLOG = 'docs/backlog.md';

const VERSION = /^v(\d+)\.(\d+)\.(\d+)$/;
const COMMIT = /^[0-9a-f]{7,40}$/;
const REPO_01 = /^\|\s*REPO-01\s*\|/;
const RELEASE_RECORD = /`npm create api-qa` from release `(v\d+\.\d+\.\d+)`/g;
const COMMIT_RECORD = /\bframework commit `([0-9a-f]{7,40})`/g;

/** Orders release tags `v<x.y.z>` by version: negative, zero or positive. */
export function compareVersions(a, b) {
  const [x, y] = [VERSION.exec(a), VERSION.exec(b)];
  for (let i = 1; i <= 3; i += 1) if (x[i] !== y[i]) return Number(x[i]) - Number(y[i]);
  return 0;
}

/**
 * The framework release a copy started from, from the REPO-01 row of its backlog:
 * `{ kind: 'tag', tag }` for the release `npm create api-qa` unpacked, else `{ kind: 'commit',
 * commit }` for the framework commit a template copy records, else null. Other rows and prose are
 * never read.
 */
export function recordedRelease(backlog) {
  const rows = String(backlog ?? '')
    .split('\n')
    .filter((line) => REPO_01.test(line));
  const tags = rows.flatMap((row) => [...row.matchAll(RELEASE_RECORD)].map((m) => m[1]));
  if (tags.length > 0)
    return { kind: 'tag', tag: tags.sort(compareVersions).at(-1), source: BACKLOG };
  const commits = [
    ...new Set(rows.flatMap((row) => [...row.matchAll(COMMIT_RECORD)].map((m) => m[1]))),
  ];
  if (commits.length > 1) {
    throw new Error(
      `${BACKLOG} records several framework commits (${commits.join(', ')}); name the one this copy is on with --from.`,
    );
  }
  return commits.length === 1 ? { kind: 'commit', commit: commits[0], source: BACKLOG } : null;
}

/** The release `.framework-release` holds (`text`), or null when the file is missing. */
export function releaseInRecord(text) {
  if (text === null) return null;
  const tag = text.trim();
  if (!VERSION.test(tag)) {
    throw new Error(
      `${RECORD_FILE} must hold one release v<x.y.z>, and holds ${JSON.stringify(tag)}: fix it, or name the start with --from.`,
    );
  }
  return { kind: 'tag', tag, source: RECORD_FILE };
}

/** The framework repository named by packages/create-api-qa/package.json, or null. */
export function frameworkUrl(root = REPO_ROOT) {
  const text = readTextIfExists(join(root, URL_OWNER));
  if (text === null) return null;
  const { repository } = JSON.parse(text);
  const url = typeof repository === 'string' ? repository : repository?.url;
  return url ? url.replace(/^git\+/, '') : null;
}

/** A --remote that names a local directory, made absolute: the dry run fetches from elsewhere. */
export function remoteLocation(value) {
  const isUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) || /^[^/\\@]+@[^:/\\]+:/.test(value);
  return !isUrl && existsSync(value) ? resolve(value) : value;
}

/** Two spellings of one repository: separators, a trailing slash and `.git` aside. */
export const sameRepository = (a, b) => {
  const plain = (url) =>
    url
      .replace(/\\/g, '/')
      .replace(/\/+$/, '')
      .replace(/\.git$/, '');
  return plain(a) === plain(b);
};

// ---------------------------------------------------------------------------------------------
// git

// git works on the repository at `cwd`, never on one a calling hook exported (GATE-25).
const run = (cwd, args, options = {}) =>
  spawnSync('git', args, {
    cwd,
    env: gitEnv(),
    encoding: 'utf8',
    maxBuffer: 256 << 20,
    ...options,
  });

/** stdout of a git command that must succeed. */
function gitOk(cwd, args, options) {
  const result = run(cwd, args, options);
  if (exitCodeOf(result) !== 0) {
    const detail = String(result.stderr ?? '').trim();
    throw new Error(
      `git ${args[0]} failed (${describeExit(result)})${detail ? `: ${detail}` : ''}`,
    );
  }
  return result.stdout;
}

const nulSplit = (text) => text.split('\0').filter(Boolean);

function revParse(cwd, rev) {
  const result = run(cwd, ['rev-parse', '--verify', '--quiet', rev]);
  return exitCodeOf(result) === 0 ? result.stdout.trim() : null;
}

function remoteUrl(root) {
  const result = run(root, ['remote', 'get-url', REMOTE]);
  return exitCodeOf(result) === 0 ? result.stdout.trim() : null;
}

/**
 * Fetches the framework's tags into refs/framework/tags/ of the repository at `cwd`. A failure is
 * the framework repository not answering, or refusing: stop and say which.
 */
function fetchReleases(cwd, source, url) {
  const result = run(cwd, [
    'fetch',
    '--quiet',
    '--no-tags',
    source,
    `+refs/tags/*:${TAG_NAMESPACE}*`,
  ]);
  if (exitCodeOf(result) !== 0) {
    throw new Error(
      `Could not fetch the framework's releases from ${url} (${describeExit(result)}): ` +
        `${String(result.stderr ?? '').trim()}\nCheck the URL (--remote), the network or VPN and your access to the repository. Nothing changed.`,
    );
  }
}

/** The refs under refs/framework/tags/. */
const namespaceRefs = (cwd) =>
  nulSplit(gitOk(cwd, ['for-each-ref', '--format=%(refname)%00', TAG_NAMESPACE])).map((ref) =>
    ref.trim(),
  );

/** The release tags fetched, in version order. */
function releaseTags(cwd) {
  return namespaceRefs(cwd)
    .map((ref) => ref.slice(TAG_NAMESPACE.length))
    .filter((tag) => VERSION.test(tag))
    .sort(compareVersions);
}

/** `Map(path -> blob)` of a tree. */
function treeBlobs(cwd, ref) {
  const blobs = new Map();
  for (const entry of nulSplit(gitOk(cwd, ['ls-tree', '-r', '-z', ref]))) {
    const tab = entry.indexOf('\t');
    blobs.set(entry.slice(tab + 1), entry.slice(0, tab).split(' ')[2]);
  }
  return blobs;
}

/** `Map(path -> blob)` of the copy's index: what it tracks now. */
function indexBlobs(root) {
  const blobs = new Map();
  for (const entry of nulSplit(gitOk(root, ['ls-files', '-s', '-z']))) {
    const tab = entry.indexOf('\t');
    blobs.set(entry.slice(tab + 1), entry.slice(0, tab).split(' ')[1]);
  }
  return blobs;
}

/** `[{ status: 'A' | 'D' | 'M', path }]` between two framework commits, renames as delete + add. */
function changesBetween(cwd, from, to) {
  const fields = nulSplit(gitOk(cwd, ['diff', '--name-status', '--no-renames', '-z', from, to]));
  const changes = [];
  for (let i = 0; i < fields.length; i += 2) {
    changes.push({ status: fields[i] === 'T' ? 'M' : fields[i][0], path: fields[i + 1] });
  }
  return changes;
}

// ---------------------------------------------------------------------------------------------
// The plan

/** The packs of a tree: directories under services/ with a service.json, as `servicePacks` reads. */
export const packsIn = (paths) =>
  [...paths]
    .map((path) => /^services\/([^/]+)\/service\.json$/.exec(path)?.[1])
    .filter(Boolean)
    .sort();

/** The directories above `path`, outermost first. */
const ancestors = (path) => {
  const dirs = [];
  for (let i = path.indexOf('/'); i !== -1; i = path.indexOf('/', i + 1))
    dirs.push(path.slice(0, i));
  return dirs;
};
const directoriesOf = (paths) => new Set([...paths].flatMap(ancestors));

/**
 * The removed pack an added path is named for, where a pack name stands as a word in it. Longer
 * names are matched first and taken out of the path, so `vampi-admin/` never counts as `vampi`,
 * while `vampi-dast.yml` and `keycloak-vampi-diff.yml` name `vampi`.
 */
function packNamed(path, packs, removedPacks) {
  let rest = path;
  for (const pack of [...packs].sort((a, b) => b.length - a.length)) {
    const escaped = pack.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const word = new RegExp(`(^|[^a-z0-9])${escaped}(?=[^a-z0-9]|$)`, 'gi');
    if (!word.test(rest)) continue;
    if (removedPacks.includes(pack)) return pack;
    rest = rest.replace(word, '$1 ');
  }
  return undefined;
}

/**
 * Sorts each change of the release into `apply` (`{ status, path, yours, names? }`, where `yours`
 * says the copy changed or added the file too, so the merge may conflict, and `names` is the removed
 * pack an added file is named for) or `leftOut` (`{ status, path, reason, pack? }`). `oldBlobs` is
 * the tree the copy starts from, `copyBlobs` the copy's index, `packs` every pack of both releases.
 */
export function classify({ changes, oldBlobs, copyBlobs, removedPacks = [], packs = [] }) {
  const packOf = (path) =>
    removedPacks.find((pack) =>
      packPaths(pack).some((owned) =>
        owned.endsWith('/') ? path.startsWith(owned) : path === owned,
      ),
    );
  // A directory that held only removed packs' files (docs/discovery/ after removing every pack with
  // a digest) was emptied by the removal, not deleted: a new pack's files still go there.
  const oldDirs = directoriesOf([...oldBlobs.keys()].filter((path) => !packOf(path)));
  const copyDirs = directoriesOf(copyBlobs.keys());
  const inDeletedDirectory = (path) =>
    ancestors(path).some((dir) => oldDirs.has(dir) && !copyDirs.has(dir));
  const allPacks = [...new Set([...packs, ...removedPacks])];
  const apply = [];
  const leftOut = [];
  for (const { status, path } of changes) {
    const pack = packOf(path);
    const mine = copyBlobs.get(path);
    if (ADOPTED.includes(path)) leftOut.push({ status, path, reason: 'adopted' });
    else if (pack) leftOut.push({ status, path, reason: 'pack', pack });
    else if (status === 'A' ? inDeletedDirectory(path) : mine === undefined)
      leftOut.push({ status, path, reason: 'deleted' });
    else if (status === 'D' && mine !== oldBlobs.get(path))
      leftOut.push({ status, path, reason: 'changed' });
    else {
      const item = { status, path, yours: mine !== undefined && mine !== oldBlobs.get(path) };
      const named = status === 'A' ? packNamed(path, allPacks, removedPacks) : undefined;
      if (named) item.names = named;
      apply.push(item);
    }
  }
  return { apply, leftOut };
}

/** The start as a message names it. */
const startName = (from) =>
  from.source === '--from' ? `--from ${from.tag}` : `${from.tag} (recorded in ${from.source})`;

/**
 * The commits to diff: `{ fromRef, toRef }`, after checking that both are known and that `to` is
 * later. `from` is `{ kind: 'tag', tag }` or `{ kind: 'commit', commit }`.
 */
export function resolveRange(cwd, from, to) {
  const tags = releaseTags(cwd);
  const known = (tag, name) => {
    if (!tags.includes(tag)) {
      throw new Error(
        `${name} is not a framework release; the latest are ${tags.slice(-5).join(', ') || '(none)'}.`,
      );
    }
    return `${TAG_NAMESPACE}${tag}`;
  };
  const toRef = known(to, `--to ${to}`);
  if (from.kind === 'tag') {
    const fromRef = known(from.tag, startName(from));
    if (compareVersions(to, from.tag) <= 0)
      throw new Error(`--to ${to} is not later than ${from.tag}, the release this copy is on.`);
    return { fromRef, toRef };
  }
  const fromRef = revParse(cwd, `${from.commit}^{commit}`);
  if (!fromRef) {
    throw new Error(
      `Framework commit ${from.commit} is not in the history of the framework's releases; ` +
        'name the release this copy is on with --from v<x.y.z>.',
    );
  }
  const later = run(cwd, ['merge-base', '--is-ancestor', fromRef, toRef]);
  if (revParse(cwd, `${toRef}^{commit}`) === fromRef || exitCodeOf(later) !== 0)
    throw new Error(`--to ${to} is not later than framework commit ${from.commit}.`);
  return { fromRef, toRef };
}

/** Decides what the update does; changes nothing. `cwd` is the repository that holds the tags. */
export function planUpdate({ root = REPO_ROOT, cwd = root, from, to }) {
  const { fromRef, toRef } = resolveRange(cwd, from, to);
  const oldBlobs = treeBlobs(cwd, fromRef);
  const copyBlobs = indexBlobs(root);
  const copyPacks = servicePacks(root);
  const removedPacks = packsIn(oldBlobs.keys()).filter((pack) => !copyPacks.includes(pack));
  const sorted = classify({
    changes: changesBetween(cwd, fromRef, toRef),
    oldBlobs,
    copyBlobs,
    removedPacks,
    packs: [...packsIn(oldBlobs.keys()), ...packsIn(treeBlobs(cwd, toRef).keys())],
  });
  // An added file git apply cannot create: an untracked (or ignored) file at its path, or an
  // untracked file where one of its directories should be. The apply would fail on it after
  // changing other files. git decides what is untracked, so a case-only rename on a
  // case-insensitive file system is not taken for one.
  const added = sorted.apply
    .filter(({ status, path }) => status === 'A' && !copyBlobs.has(path))
    .map(({ path }) => path);
  const untracked = untrackedAmong(root, added);
  const isFile = (path) => statSync(join(root, path), { throwIfNoEntry: false })?.isFile() ?? false;
  const blocked = added.filter(
    (path) =>
      untracked.has(path) || ancestors(path).some((dir) => !copyBlobs.has(dir) && isFile(dir)),
  );
  const ignoresCase = run(root, ['config', '--bool', 'core.ignorecase']).stdout.trim() === 'true';
  return {
    from,
    to,
    fromRef,
    toRef,
    removedPacks,
    blocked,
    caseRenames: ignoresCase ? caseRenames(sorted.apply) : [],
    ...sorted,
  };
}

/**
 * The renames in `apply` that change only the case of a path (`{ from, to }`): a deletion and an
 * addition whose paths differ in case alone. git apply cannot make them where the file system
 * ignores case (core.ignorecase), in either order.
 */
export function caseRenames(apply) {
  const deleted = new Map(
    apply.filter(({ status }) => status === 'D').map(({ path }) => [path.toLowerCase(), path]),
  );
  return apply
    .filter(({ status, path }) => status === 'A' && deleted.has(path.toLowerCase()))
    .map(({ path }) => ({ from: deleted.get(path.toLowerCase()), to: path }));
}

/** Which of `paths` the copy has on disk without tracking them, ignored ones included. */
function untrackedAmong(root, paths) {
  const found = new Set();
  for (let i = 0; i < paths.length; i += 100) {
    const args = [
      '--literal-pathspecs',
      'ls-files',
      '-z',
      '--others',
      '--',
      ...paths.slice(i, i + 100),
    ];
    for (const path of nulSplit(gitOk(root, args))) found.add(path);
  }
  return found;
}

const VERB = { A: 'added   ', D: 'removed ', M: 'modified' };
const fromLabel = (from) => (from.kind === 'tag' ? from.tag : `framework commit ${from.commit}`);

export function describePlan(plan, { dryRun = false } = {}) {
  const start =
    plan.from.source === '--from' ? 'given with --from' : `recorded in ${plan.from.source}`;
  const out = [
    `Framework ${fromLabel(plan.from)} -> ${plan.to} (the start ${start})`,
    '',
    `${dryRun ? 'Would change' : 'Changes'} ${plan.apply.length} file(s):`,
  ];
  for (const { status, path, yours, names } of plan.apply) {
    const notes = [];
    if (yours) notes.push(status === 'A' ? 'this copy has its own' : 'changed here too');
    if (names) notes.push(`named for pack ${names}, removed from this copy`);
    out.push(`  ${VERB[status]}  ${path}${notes.length > 0 ? `  (${notes.join('; ')})` : ''}`);
  }
  if (plan.apply.length === 0) out.push('  nothing');
  if (plan.apply.some(({ yours }) => yours))
    out.push(
      '  A file this copy changed or has gets a three-way merge, which may leave conflicts.',
    );
  const groups = [
    ['adopted', () => `${ADOPTED.slice(0, -1).join(', ')} and ${ADOPTED.at(-1)}: this copy's own`],
    ['pack', (item) => `pack ${item.pack}, removed from this copy`],
    ['deleted', () => 'not in this copy any more'],
    [
      'changed',
      () => 'deleted by the release and changed in this copy: delete or keep each yourself',
    ],
  ];
  if (plan.leftOut.length > 0) out.push('', `Left out, ${plan.leftOut.length} file(s):`);
  for (const [reason, title] of groups) {
    const items = plan.leftOut.filter((item) => item.reason === reason);
    const heads = [...new Set(items.map(title))];
    for (const head of heads) {
      out.push(`  ${head}:`);
      for (const item of items.filter((i) => title(i) === head))
        out.push(`    ${VERB[item.status]}  ${item.path}`);
    }
  }
  if (plan.blocked.length > 0) {
    out.push(
      '',
      `Blocked, ${plan.blocked.length} file(s) the release adds that this copy has on disk without tracking them (ignored or untracked), at their path or where one of their directories goes: move or delete each before the update, since git apply would fail on it after changing other files.`,
      ...plan.blocked.map((path) => `    ${path}`),
    );
  }
  if (plan.caseRenames.length > 0) {
    out.push(
      '',
      `Blocked, ${plan.caseRenames.length} rename(s) that change only the case of a path, which git apply cannot make where the file system ignores case: rename each with \`git mv <old> <new>\`, commit, and run the update again.`,
      ...plan.caseRenames.map(({ from, to }) => `    ${from} -> ${to}`),
    );
  }
  return out.join('\n');
}

// ---------------------------------------------------------------------------------------------
// Applying

/** The release's patch for the files the plan applies, in chunks that keep command lines short. */
function buildPatch(root, plan) {
  const paths = plan.apply.map(({ path }) => path);
  const parts = [];
  for (let i = 0; i < paths.length; i += 100) {
    const args = [
      '--literal-pathspecs',
      'diff',
      '--binary',
      '--no-renames',
      '--no-color',
      '--no-ext-diff',
      '--no-textconv',
      '--no-relative',
      '--src-prefix=a/',
      '--dst-prefix=b/',
      plan.fromRef,
      plan.toRef,
      '--',
      ...paths.slice(i, i + 100),
    ];
    parts.push(gitOk(root, args, { encoding: 'buffer' }));
  }
  return Buffer.concat(parts);
}

/** `git apply -3` of the patch: `{ conflicts, failed, stderr }`. */
function applyPatch(root, patch) {
  const dir = mkdtempSync(join(tmpdir(), 'framework-update-patch-'));
  try {
    const file = join(dir, 'framework.patch');
    writeFileSync(file, patch);
    const result = run(root, ['apply', '-3', '--whitespace=nowarn', file]);
    const conflicts = nulSplit(gitOk(root, ['diff', '--name-only', '--diff-filter=U', '-z']));
    return { conflicts, failed: exitCodeOf(result) !== 0 && conflicts.length === 0, result };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Writes the release the copy is now on to `.framework-release` and stages it. */
function recordRelease(root, to) {
  writeFileSync(join(root, RECORD_FILE), `${to}\n`);
  gitOk(root, ['add', '--', RECORD_FILE]);
}

function nextSteps(plan, conflicts) {
  const steps = [];
  if (conflicts.length > 0) {
    steps.push(
      'Resolve the conflicts: edit each file listed above, then `git add` it. The tree was clean before, so `git reset --hard` undoes the whole update.',
    );
  }
  if (plan.leftOut.some(({ reason }) => reason === 'changed'))
    steps.push('Decide on each file the release deletes and this copy changed (listed above).');
  const named = [...new Set(plan.apply.map(({ names }) => names).filter(Boolean))];
  if (named.length > 0) {
    steps.push(
      `Decide on each added file named for a pack you removed (${named.join(', ')}; marked above): delete it if it serves only that pack.`,
    );
  }
  steps.push(
    'In package.json and package-lock.json keep your own name and version, then run `npm install --package-lock-only` and `npm ci`.',
    'Run `npm run gates`.',
    `Read what the release needs from you: \`git show ${TAG_NAMESPACE}${plan.to}:CHANGELOG.md\`.`,
    `Commit on a branch with a backlog id of your own. ${RECORD_FILE} now holds ${plan.to} and is staged: the next update starts from it.`,
  );
  return ['', 'Next:', ...steps.map((step, i) => `  ${i + 1}. ${step}`)].join('\n');
}

/** Runs the command on the copy at `root`; returns the exit code. */
export function frameworkUpdate(
  argv,
  { root = REPO_ROOT, log = console.log, warn = console.error } = {},
) {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        to: { type: 'string' },
        from: { type: 'string' },
        remote: { type: 'string' },
        'dry-run': { type: 'boolean', default: false },
      },
    }));
  } catch (error) {
    warn(`${error.message}\n${USAGE}`);
    return 1;
  }
  try {
    return update(values, root, log, warn);
  } catch (error) {
    warn(error.message);
    return 1;
  }
}

/** Where the copy starts: --from, else `.framework-release`, else the REPO-01 row. */
function startOf(root, fromFlag) {
  if (fromFlag !== undefined) {
    return VERSION.test(fromFlag)
      ? { kind: 'tag', tag: fromFlag, source: '--from' }
      : { kind: 'commit', commit: fromFlag, source: '--from' };
  }
  const start =
    releaseInRecord(readTextIfExists(join(root, RECORD_FILE))) ??
    recordedRelease(readTextIfExists(join(root, BACKLOG)));
  if (!start) {
    throw new Error(
      `Cannot tell which framework release this copy is on: there is no ${RECORD_FILE}, and the ` +
        `REPO-01 row of ${BACKLOG} names no release or framework commit. Name it with --from v<x.y.z>.`,
    );
  }
  return start;
}

function update(values, root, log, warn) {
  const { to, from: fromFlag } = values;
  const remote = values.remote === undefined ? undefined : remoteLocation(values.remote);
  const dryRun = values['dry-run'];
  if (!VERSION.test(to ?? ''))
    throw new Error(
      `Name the release to take with --to v<x.y.z> (got ${to ?? 'nothing'}).\n${USAGE}`,
    );
  if (fromFlag !== undefined && !VERSION.test(fromFlag) && !COMMIT.test(fromFlag))
    throw new Error(
      `--from takes a release v<x.y.z> or a framework commit hash (got ${fromFlag}).`,
    );
  gitOk(root, ['rev-parse', '--git-dir']);
  if (!dryRun) {
    const status = gitOk(root, ['status', '--porcelain']);
    if (status.trim()) {
      throw new Error(
        'The working tree has changes. Commit or remove them first, so that the update is the only ' +
          `change and \`git reset --hard\` undoes it:\n${status.trimEnd()}`,
      );
    }
  }
  const from = startOf(root, fromFlag);
  const existing = remoteUrl(root);
  const url = remote ?? existing ?? frameworkUrl(root);
  if (!url)
    throw new Error(
      `${URL_OWNER} is gone and there is no "${REMOTE}" remote: pass --remote <url>.`,
    );
  if (!dryRun && existing && remote && !sameRepository(remote, existing)) {
    throw new Error(
      `The "${REMOTE}" remote points to ${existing}, not ${remote}: change it with ` +
        `\`git remote set-url ${REMOTE} <url>\`, or leave out --remote.`,
    );
  }

  let temporary = null;
  try {
    let plan;
    if (dryRun) {
      temporary = mkdtempSync(join(tmpdir(), 'framework-update-'));
      gitOk(temporary, ['init', '--quiet', '--bare']);
      fetchReleases(temporary, url, url);
      plan = planUpdate({ root, cwd: temporary, from, to });
    } else {
      plan = planWithCleanup(root, { existing, url, from, to });
    }
    log(describePlan(plan, { dryRun }));
    if (dryRun) {
      log('\nDry run: nothing changed. Run again without --dry-run to apply it.');
      return 0;
    }
    if (plan.apply.length === 0) {
      recordRelease(root, to);
      log(`\nNothing to apply; ${RECORD_FILE} now holds ${to}.`);
      log(nextSteps(plan, []));
      return 0;
    }
    const { conflicts, failed, result } = applyPatch(root, buildPatch(root, plan));
    if (failed) {
      const left = gitOk(root, ['status', '--porcelain']).trim();
      throw new Error(
        `git apply failed (${describeExit(result)}): ${String(result.stderr ?? '').trim()}\n` +
          (left
            ? 'It left changes; review `git status`, or undo them with `git reset --hard`.'
            : 'Nothing was applied.'),
      );
    }
    recordRelease(root, to);
    if (conflicts.length > 0) {
      warn(`\nApplied with conflicts in ${conflicts.length} file(s), marked as git leaves them:`);
      for (const file of conflicts) warn(`  ${file}`);
    } else log(`\nApplied ${plan.to}; the changes are staged.`);
    log(nextSteps(plan, conflicts));
    return conflicts.length > 0 ? 2 : 0;
  } finally {
    if (temporary) rmSync(temporary, { recursive: true, force: true });
  }
}

/**
 * Fetches into the copy and plans. A refusal on the way (an unknown release, a blocked file) takes
 * back what the run added: the remote, when it added one, and the tags it fetched.
 */
function planWithCleanup(root, { existing, url, from, to }) {
  const refsBefore = new Set(namespaceRefs(root));
  if (!existing) gitOk(root, ['remote', 'add', '--no-tags', REMOTE, url]);
  try {
    fetchReleases(root, REMOTE, url);
    const plan = planUpdate({ root, from, to });
    if (plan.blocked.length > 0 || plan.caseRenames.length > 0) {
      throw new Error(
        `${describePlan(plan)}\n\nRefused: ${plan.blocked.length + plan.caseRenames.length} blocked change(s), listed above. Nothing changed.`,
      );
    }
    return plan;
  } catch (error) {
    if (!existing) run(root, ['remote', 'remove', REMOTE]);
    for (const ref of namespaceRefs(root))
      if (!refsBefore.has(ref)) run(root, ['update-ref', '-d', ref]);
    throw error;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exit(frameworkUpdate(process.argv.slice(2)));
}
