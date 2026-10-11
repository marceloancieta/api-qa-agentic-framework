#!/usr/bin/env node
/**
 * Builds a CHANGELOG.md section for one version from the commit history (ADR 0008). Each commit
 * follows `type(scope): <BACKLOG-ID>... summary`: one or more backlog ids after the colon, scope
 * optional, `!` after the type or scope or a `BREAKING CHANGE:` footer for a breaking change.
 *
 * Range: from the latest `vX.Y.Z` tag reachable from `--to` (default HEAD) to `--to`, or the whole
 * history when there is no such tag; `--from <ref>` overrides the start. Merge commits are skipped:
 * with squash merges each change already has its own commit on `main`.
 *
 * Groups, in this order (empty groups are left out):
 *   Breaking changes   every breaking commit, whatever its type (listed here only)
 *   Features           feat
 *   Fixes              fix
 *   Performance        perf
 *   Other              docs, test, ci, build, refactor, style, chore, revert: kept, because a
 *                      backlog item may be delivered by any type, labelled with their type
 *   Not conventional   commits that do not follow the convention, with the reason; also logged to
 *                      stderr, never dropped
 * Within a group entries are ordered by scope (unscoped first), then oldest first.
 *
 * Version: `--version X.Y.Z`, or `--next` to propose one from the latest tag:
 *   no tag                     0.1.0
 *   1.0.0 or later             breaking -> major, feat -> minor, anything else -> patch
 *   0.y.z (initial development) breaking or feat -> minor, anything else -> patch; semver leaves
 *                              0.x open to any change, and 1.0.0 is a deliberate `--version`
 *
 * The repository is the one the command runs in. Output: the section on stdout; with `--write` it
 * is added on top of the version list in CHANGELOG.md at the repository's top level (`--file` to
 * choose another file), which is created with a short header when missing.
 * A version already present is refused. `--date YYYY-MM-DD` fixes the date (default: today, UTC).
 * Exit codes: 0 done, 1 refused (version already present, no commits in the range), 2 usage or git
 * error.
 *
 *   node scripts/changelog.mjs (--next | --version X.Y.Z) [--from ref] [--to ref] [--date YYYY-MM-DD]
 *                              [--write] [--file path]
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT } from './lib/cli.mjs';
import { createLogger } from './lib/log.mjs';
import { describeExit, spawnFailure } from './lib/spawn.mjs';

export const COMMIT_TYPES = [
  'feat',
  'fix',
  'perf',
  'docs',
  'test',
  'ci',
  'build',
  'refactor',
  'style',
  'chore',
  'revert',
];

/** A backlog id such as `CI-01`, or a range written as `PROC-01..05`. */
export const BACKLOG_ID = /^[A-Z][A-Z0-9]*-\d+(?:\.\.\d+)?$/;

const HEADER = /^(?<type>[a-z]+)(?:\((?<scope>[\w./-]+)\))?(?<bang>!)?: (?<rest>.*)$/;
const BREAKING_FOOTER = /^BREAKING[ -]CHANGE: ?(.*)$/;
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const GROUPS = [
  { key: 'breaking', title: 'Breaking changes' },
  { key: 'feat', title: 'Features' },
  { key: 'fix', title: 'Fixes' },
  { key: 'perf', title: 'Performance' },
  { key: 'other', title: 'Other' },
  { key: 'unconventional', title: 'Not conventional' },
];

const CHANGELOG_HEADER = `# Changelog

All notable changes to this project are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html), and each section is generated from the
commit history by \`scripts/changelog.mjs\`.
`;

/** An error for a request the tool declines (exit 1), as opposed to a usage or git error (exit 2). */
function refusal(message) {
  return Object.assign(new Error(message), { refused: true });
}

/** The text after a `BREAKING CHANGE:` footer up to the next blank line, or null. */
function breakingNote(bodyLines) {
  const start = bodyLines.findIndex((line) => BREAKING_FOOTER.test(line));
  if (start === -1) return null;
  const lines = [BREAKING_FOOTER.exec(bodyLines[start])[1]];
  for (const line of bodyLines.slice(start + 1)) {
    if (line.trim() === '') break;
    lines.push(line.trim());
  }
  return lines.join(' ').trim();
}

/**
 * One commit message read against the convention. A conforming commit gives
 * `{ conforming: true, type, scope, breaking, note, ids, summary, subject }`; any other gives
 * `{ conforming: false, subject, reason }`.
 */
export function parseCommit(message, idPattern = BACKLOG_ID) {
  const lines = message.replace(/\r\n/g, '\n').trim().split('\n');
  const subject = lines[0].trim();
  const fail = (reason) => ({ conforming: false, subject, reason });
  const header = HEADER.exec(subject);
  if (!header) return fail('subject is not `type(scope): summary`');
  const { type, scope, bang, rest } = header.groups;
  if (!COMMIT_TYPES.includes(type)) return fail(`unknown type "${type}"`);

  const words = rest.trim().split(/\s+/);
  const ids = [];
  while (words.length > 0 && idPattern.test(words[0])) ids.push(words.shift());
  if (ids.length === 0) return fail('no backlog id after the colon');
  const summary = words.join(' ');
  if (summary === '') return fail('no summary after the backlog ids');

  const note = breakingNote(lines.slice(1));
  return {
    conforming: true,
    type,
    scope: scope ?? null,
    breaking: Boolean(bang) || note !== null,
    note: note || null,
    ids,
    summary,
    subject,
  };
}

/** The group a parsed commit belongs to (see GROUPS). */
export function groupOf(commit) {
  if (!commit.conforming) return 'unconventional';
  if (commit.breaking) return 'breaking';
  return ['feat', 'fix', 'perf'].includes(commit.type) ? commit.type : 'other';
}

/** The label an entry starts with: the scope inside a type group, `type(scope)` elsewhere. */
function labelOf(commit, group) {
  if (['feat', 'fix', 'perf'].includes(group)) return commit.scope;
  return commit.scope ? `${commit.type}(${commit.scope})` : commit.type;
}

/**
 * Parsed commits (each with `short`, newest first as `git log` lists them) in their groups:
 * `[{ key, title, commits }]` in GROUPS order, empty groups left out. Within a group the order is
 * by label (unlabelled first), then oldest first.
 */
export function groupCommits(commits) {
  const oldestFirst = [...commits].reverse();
  return GROUPS.map(({ key, title }) => {
    const members = oldestFirst.filter((commit) => groupOf(commit) === key);
    if (key !== 'unconventional') {
      // Array.prototype.sort is stable, so equal labels keep the oldest-first order.
      members.sort((a, b) => (labelOf(a, key) ?? '').localeCompare(labelOf(b, key) ?? ''));
    }
    return { key, title, commits: members };
  }).filter((group) => group.commits.length > 0);
}

/** One Markdown list item (with a nested note for a breaking-change footer). */
export function renderEntry(commit, group) {
  const hash = `\`${commit.short}\``;
  if (!commit.conforming) return `- ${commit.subject} ${hash} (${commit.reason})`;
  const label = labelOf(commit, group);
  const lead = label ? `**${label}:** ` : '';
  const entry = `- ${lead}${commit.summary} (${commit.ids.join(', ')}) ${hash}`;
  return commit.note ? `${entry}\n  - BREAKING CHANGE: ${commit.note}` : entry;
}

/** The Markdown section for one version, ending with a newline. */
export function renderSection({ version, date, commits }) {
  const parts = [`## [${version}] - ${date}`];
  for (const group of groupCommits(commits)) {
    parts.push(`### ${group.title}`);
    parts.push(group.commits.map((commit) => renderEntry(commit, group.key)).join('\n'));
  }
  return `${parts.join('\n\n')}\n`;
}

export function parseVersion(text) {
  const match = SEMVER.exec(String(text ?? '').replace(/^v/, ''));
  return match ? match.slice(1, 4).map(Number) : null;
}

const compareVersions = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/** The highest `vX.Y.Z` tag among `tags`, or null. Other tags are ignored. */
export function latestVersionTag(tags) {
  const versions = tags
    .filter((tag) => /^v\d+\.\d+\.\d+$/.test(tag))
    .map((tag) => ({ tag, version: parseVersion(tag) }))
    .sort((a, b) => compareVersions(b.version, a.version));
  return versions[0]?.tag ?? null;
}

/**
 * The next version after the `latest` tag (null when there is none) for the parsed `commits`:
 * `{ version, bump, reason }`. See the header comment for the policy.
 */
export function nextVersion(latest, commits) {
  if (!latest) return { version: '0.1.0', bump: 'initial', reason: 'no version tag yet' };
  const current = parseVersion(latest);
  if (!current) throw new Error(`"${latest}" is not a vX.Y.Z version.`);
  const [major, minor, patch] = current;
  const breaking = commits.some((c) => c.conforming && c.breaking);
  const feature = commits.some((c) => c.conforming && c.type === 'feat');
  if (major === 0) {
    if (breaking || feature) {
      const why = breaking ? 'a breaking change (0.x: minor)' : 'a feature';
      return { version: `0.${minor + 1}.0`, bump: 'minor', reason: why };
    }
    return { version: `0.${minor}.${patch + 1}`, bump: 'patch', reason: 'no feature' };
  }
  if (breaking) return { version: `${major + 1}.0.0`, bump: 'major', reason: 'a breaking change' };
  if (feature) return { version: `${major}.${minor + 1}.0`, bump: 'minor', reason: 'a feature' };
  return { version: `${major}.${minor}.${patch + 1}`, bump: 'patch', reason: 'no feature' };
}

/**
 * `existing` changelog text (null when the file does not exist) with `section` added above the
 * first version heading, after the header and any Unreleased section. Throws when `version` is
 * already there.
 */
export function insertSection(existing, section, version) {
  const text = existing ?? CHANGELOG_HEADER;
  const escaped = version.replace(/\./g, '\\.');
  if (new RegExp(`^## \\[${escaped}\\]`, 'm').test(text)) {
    throw refusal(`Version ${version} is already in the changelog; nothing was written.`);
  }
  const first = /^## \[(?!Unreleased\])/im.exec(text);
  if (!first) return `${text.trimEnd()}\n\n${section}`;
  const before = text.slice(0, first.index).trimEnd();
  return `${before}\n\n${section}\n${text.slice(first.index)}`;
}

function git(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (spawnFailure(result) || result.status !== 0) {
    const detail = (result.stderr ?? '').trim() || describeExit(result);
    throw new Error(`git ${args.join(' ')} failed: ${detail}`);
  }
  return result.stdout;
}

/** The highest `vX.Y.Z` tag reachable from `to`, or null. */
export function latestTag({ cwd = REPO_ROOT, to = 'HEAD' } = {}) {
  const tags = git(['tag', '--merged', to, '--list', 'v*'], cwd).split('\n').filter(Boolean);
  return latestVersionTag(tags);
}

/** Commits in `from..to` (all of `to` when `from` is null), newest first, merges skipped. */
export function readCommits({ cwd = REPO_ROOT, from = null, to = 'HEAD' } = {}) {
  const range = from ? `${from}..${to}` : to;
  const out = git(['log', '--no-merges', '--format=%H%x1f%h%x1f%B%x1e', range, '--'], cwd);
  return out
    .split('\x1e')
    .map((record) => record.replace(/^\n+/, ''))
    .filter((record) => record.trim() !== '')
    .map((record) => {
      const [hash, short, message] = record.split('\x1f');
      return { hash, short, message: message.trim() };
    });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Builds the section: `{ section, version, bump, from, to, commits, unconventional, written }`.
 * Logs every commit that does not follow the convention, and writes only when `write` is set.
 */
export function changelog(options) {
  const { cwd = REPO_ROOT, to = 'HEAD', date = today(), write = false, log } = options;
  if (Boolean(options.version) === Boolean(options.next)) {
    throw new Error('Pass exactly one of --version X.Y.Z and --next.');
  }
  if (options.version && !parseVersion(options.version)) {
    throw new Error(`--version "${options.version}" is not X.Y.Z.`);
  }
  if (!DATE.test(date)) throw new Error(`--date "${date}" is not YYYY-MM-DD.`);

  const tag = latestTag({ cwd, to });
  const from = options.from ?? tag;
  const commits = readCommits({ cwd, from, to }).map((raw) => ({
    ...raw,
    ...parseCommit(raw.message),
  }));
  if (commits.length === 0) {
    throw refusal(`No commits in ${from ? `${from}..${to}` : to}: nothing to release.`);
  }

  const unconventional = commits.filter((commit) => !commit.conforming);
  for (const commit of unconventional) {
    log.warn('commit does not follow the convention', {
      commit: commit.short,
      reason: commit.reason,
      subject: commit.subject,
    });
  }

  const proposal = options.next ? nextVersion(tag, commits) : null;
  const version = options.version ? parseVersion(options.version).join('.') : proposal.version;
  const section = renderSection({ version, date, commits });
  log.info('section built', {
    version,
    bump: proposal ? `${proposal.bump} (${proposal.reason})` : 'explicit',
    from: from ?? 'start',
    to,
    commits: commits.length,
    unconventional: unconventional.length,
  });

  if (write) {
    const file =
      options.file ?? join(git(['rev-parse', '--show-toplevel'], cwd).trim(), 'CHANGELOG.md');
    const existing = existsSync(file) ? readFileSync(file, 'utf8') : null;
    writeFileSync(file, insertSection(existing, section, version));
    log.info('changelog written', { file, version });
  }
  return {
    section,
    version,
    bump: proposal?.bump ?? 'explicit',
    from,
    to,
    commits,
    unconventional,
    written: write,
  };
}

function main() {
  const { values } = parseArgs({
    options: {
      version: { type: 'string' },
      next: { type: 'boolean', default: false },
      from: { type: 'string' },
      to: { type: 'string', default: 'HEAD' },
      date: { type: 'string' },
      write: { type: 'boolean', default: false },
      file: { type: 'string' },
    },
    allowPositionals: false,
  });
  // stdout carries the Markdown section, so the log goes to stderr.
  const log = createLogger('changelog', { out: { log: (line) => console.error(line) } });
  const outcome = changelog({
    ...values,
    cwd: process.cwd(),
    file: values.file ? resolve(values.file) : undefined,
    log,
  });
  if (!outcome.written) process.stdout.write(outcome.section);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(error.refused ? 1 : 2);
  }
}
