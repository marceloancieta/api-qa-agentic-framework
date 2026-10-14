// Documentation coherence (GATE-03). Prose drifts away from the repository it describes without
// anyone noticing: a file is renamed and the README still points at the old name, a lesson promises
// a guard that was never built, a backlog row loses a cell and every later column shifts (L-07..L-12).
// Each rule below turns one of those drifts into a finding with a file and a line.
//
// Scope: every tracked Markdown file (`git ls-files`; a directory that is not a git root, such as
// the self-test tree, is walked instead). Anything under `__fixtures__/` is linter input, not
// documentation, and is skipped. Fenced code blocks are skipped; HTML comments are blanked first.
//
// Rules:
//   dead-link          `[text](target)` whose target file is missing, or whose `#anchor` names no
//                      heading of the target (GitHub slugs: lower case, punctuation dropped, spaces
//                      to hyphens, `-1`, `-2` for repeats). URLs with a scheme are not checked.
//   dead-path          a code span that names a repository path that does not exist. A span is a
//                      path when it has no whitespace and either contains `/` with a first segment
//                      that is a top-level entry of the repository (or `./`, `../`), or ends in
//                      .md/.mjs/.cjs/.js/.ts/.mts/.json/.yaml/.yml. Not checked: templates
//                      (`<name>`, `{x}`, `*`, `$VAR`, `...`, `NNNN`/`XX` placeholders), flags,
//                      URLs, anything the root
//                      .gitignore ignores (outputs such as `allure-results/`, per-machine files),
//                      and planned paths (see below). A path resolves against the repository root,
//                      the document's folder and its service pack; a path whose first segment is not
//                      a top-level entry may also be the tail of any tracked path
//                      (`generated/enums.ts`).
//   orphan-doc         a Markdown file under docs/ or services/<pack>/docs/ that no other Markdown
//                      file links to (L-09). README.md files are the roots and never orphans.
//   backlog-row-shape  docs/backlog.md (L-12): each row has its header's cell count (checked first,
//                      a short row is not read further); ids are `PREFIX-NN` items (`GATE-03`,
//                      `A-B-01`) or, in Done only, stage ids (`E0`, `E0.5-a`); ids are unique in the
//                      file, so none is both open and done; open rows carry a status from the enum;
//                      Done rows are closed by one or more commit hashes in code spans.
//   closing-commit     each hash cited in a well-formed Done row names a commit in the history of
//                      HEAD, so a hash from a rewritten history or an unmerged branch is caught. A
//                      shallow clone cannot tell, and is one finding on the Done table until the full
//                      history is fetched. A history that holds none of the cited hashes (a copy
//                      created from the GitHub template) is one finding too, pointing to the
//                      adoption guide. Not checked when the root is not a git repository.
//   count-claim       numbers written in prose that can be recomputed (L-08): lessons are numbered
//                      L-01..L-N with no gap or repeat; every cited `L-NN` and `L-NN..L-MM` exists;
//                      every ADR of an `ADRs NNNN-NNNN` range exists; a "PREFIX-01 to PREFIX-NN ...
//                      Done" claim in the backlog matches the ids in Done exactly, with no open row
//                      of that prefix.
//   adr-index          each docs/adr/NNNN-title.md is listed in docs/adr/README.md and each listed
//                      number has a file; each ADR has a `**Status:**` line whose value is one of
//                      ADR_STATUSES and matches the index; every cited `ADR NNNN` exists.
//   lesson-guard       each artifact a lesson names in code spans after *Guarded by:* must exist once
//                      the work is due. An artifact takes the stages in the first parenthesis after it
//                      in its clause (clauses end at `;`), e.g. `knownGap()` (E1). It is due when it
//                      has no stage or every stage is complete (all of its backlog rows are in Done,
//                      or Done has a row with the stage id), and it is not planned (below). It
//                      exists when it is a path, an npm script (`npm run x`), the base
//                      name of a tracked file (`swagger-digest`, `evidence`), the folder of a
//                      SKILL.md (`qa-automate`), an exported symbol, or a quoted rule name or tag
//                      (`@destructive`) in scripts/ or .claude/.
//   registry-shape     problems reported by `loadRegistries` for services/<pack>/registry/*.md.
//   destructive-recovery  a case whose details tag it `@destructive` has no `**Recovery**` bullet
//                      saying how the service gets back to a usable state (L-59). The destructive
//                      lane runs its pack's recovery after it; the bullet says what that
//                      recovery must restore and how the case confirms it.
//
// "Planned" (dead-path and lesson-guard): a name that an open backlog row mentions in a code span (or,
// for a bare file name, whose stem an open row uses as a word: `CHANGELOG.md`), or, for dead-path,
// that is followed on the same line by a parenthesis citing a stage that is not complete
// (`.claude/rules/` (E5)), describes future work and is not required to exist yet. Because of
// these exemptions both rules are precise rather than exhaustive: a dead path that open work also
// names is not reported.
//
// Usage:
//   node scripts/lint-docs.mjs [--root <dir>]   exit 1 on any finding
//   node scripts/lint-docs.mjs --self-test      exact-set test over scripts/__fixtures__/lint-docs/,
//                                               with the git history of withFixtureHistory()

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { finding, report, selfTest } from './lib/lint.mjs';
import { loadRegistries } from './lib/registry.mjs';
import { DESTRUCTIVE_TAG } from './lib/tags.mjs';
import { parseCli, REPO_ROOT } from './lib/cli.mjs';

export const FIXTURE_DIR = join(import.meta.dirname, '__fixtures__', 'lint-docs');
export const STATUSES = ['todo', 'in-progress', 'blocked', 'wont-do'];
export const ADR_STATUSES = ['Proposed', 'Accepted', 'Rejected', 'Deprecated', 'Superseded'];

const BACKLOG = 'docs/backlog.md';
const LESSONS = 'docs/lessons-learned.md';
const ADR_DIR = 'docs/adr';
const ITEM_ID = /^[A-Z]+(?:-[A-Z0-9]+)*-\d{2}$/;
const STAGE_ID = /^E\d+(?:\.\d+)?(?:-[a-z])?$/;
const STAGE_TOKEN = /\bE\d+(?:\.\d+)?\b/g;
const CLOSING = /^`[0-9a-f]{7,40}`(?:\s*,\s*`[0-9a-f]{7,40}`)*$/;
const PATH_EXT = /\.(?:md|mjs|cjs|js|mts|ts|json|ya?ml)$/;
const CODE_EXT = /\.(?:mjs|cjs|js|mts|ts)$/;

// ---------------------------------------------------------------------------------------------
// Corpus: the files, and each Markdown file split into analysable lines.

function walk(root, dir = '') {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === '.git' || entry.name === 'node_modules') return [];
    const rel = dir ? `${dir}/${entry.name}` : entry.name;
    return entry.isDirectory() ? walk(root, rel) : [rel];
  });
}

function listFiles(root) {
  let files;
  if (existsSync(join(root, '.git'))) {
    files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
      .split('\0')
      .filter(Boolean);
  } else files = walk(root);
  return files
    .filter((file) => !file.split('/').includes('__fixtures__'))
    .filter((file) => existsSync(join(root, file)))
    .sort();
}

/** Lines with HTML comments blanked, a fence flag per line, and code spans located. */
function analyse(text) {
  const raw = text.replace(/<!--[\s\S]*?-->/g, (comment) => comment.replace(/[^\n]/g, ' '));
  const lines = raw.split(/\r?\n/);
  let fence = null;
  return lines.map((text) => {
    const marker = /^\s*(`{3,}|~{3,})/.exec(text);
    if (marker) {
      if (!fence) fence = marker[1][0];
      else if (marker[1][0] === fence) fence = null;
      return { text, code: true, spans: [], prose: '' };
    }
    if (fence) return { text, code: true, spans: [], prose: '' };
    const spans = [];
    const prose = text.replace(/`([^`]+)`/g, (whole, inner, index) => {
      spans.push({ text: inner, index });
      return ' '.repeat(whole.length);
    });
    return { text, code: false, spans, prose };
  });
}

export function loadCorpus(root) {
  const files = listFiles(root);
  const dirs = new Set();
  for (const file of files) {
    const parts = file.split('/');
    for (let i = 1; i < parts.length; i += 1) dirs.add(parts.slice(0, i).join('/'));
  }
  const docs = new Map();
  for (const file of files.filter((f) => f.endsWith('.md'))) {
    docs.set(file, analyse(readFileSync(join(root, file), 'utf8')));
  }
  return {
    root,
    files,
    fileSet: new Set(files),
    dirs,
    topLevel: new Set(files.map((file) => file.split('/')[0])),
    docs,
    ignore: gitignore(root),
  };
}

// ---------------------------------------------------------------------------------------------
// Small Markdown helpers.

export function slug(heading) {
  return heading
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

function anchorsOf(lines) {
  const seen = new Map();
  const anchors = new Set();
  for (const line of lines) {
    if (line.code) continue;
    const heading = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line.text);
    if (!heading) continue;
    const base = slug(heading[1]);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    anchors.add(count === 0 ? base : `${base}-${count}`);
  }
  return anchors;
}

function linksOf(lines) {
  const links = [];
  lines.forEach((line, index) => {
    if (line.code) return;
    for (const match of line.prose.matchAll(/\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) {
      links.push({ target: match[1], line: index + 1 });
    }
  });
  return links;
}

/** Split a table row into cells; `\|` stays inside its cell. */
function cells(line) {
  const inner = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return inner.split(/(?<!\\)\|/).map((cell) => cell.trim());
}

/** Tables of a document: header cells, body rows with line numbers, and the enclosing `##` heading. */
function tablesOf(lines) {
  const tables = [];
  let heading = '';
  for (let i = 0; i < lines.length; i += 1) {
    const { text, code } = lines[i];
    if (code) continue;
    const h2 = /^##\s+(.*?)\s*$/.exec(text);
    if (h2) heading = h2[1];
    if (!text.trim().startsWith('|') || !/^\s*\|?\s*:?-{3,}/.test(lines[i + 1]?.text ?? '')) {
      continue;
    }
    const table = { heading, header: cells(text), headerLine: i + 1, rows: [] };
    i += 2;
    for (; i < lines.length && lines[i].text.trim().startsWith('|'); i += 1) {
      table.rows.push({ cells: cells(lines[i].text), line: i + 1, text: lines[i].text });
    }
    tables.push(table);
  }
  return tables;
}

const parentDir = (file) => posix.dirname(file);
const packDir = (file) => /^(services\/[^/]+)\//.exec(file)?.[1] ?? null;

function normalizeRel(path) {
  const normal = posix.normalize(path).replace(/\/$/, '');
  return normal === '.' ? '' : normal;
}

// ---------------------------------------------------------------------------------------------
// .gitignore, reduced to what the repository uses: `*`, `**`, a leading or inner `/` anchoring the
// pattern, a trailing `/` for directories, and `!` negation (last match wins).

function gitignore(root) {
  const file = join(root, '.gitignore');
  if (!existsSync(file)) return () => false;
  const rules = readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const negate = line.startsWith('!');
      let pattern = negate ? line.slice(1) : line;
      pattern = pattern.replace(/\/$/, '');
      const anchored = pattern.includes('/');
      pattern = pattern.replace(/^\//, '');
      const body = pattern
        .split('**')
        .map((part) =>
          part
            .replace(/[.+^${}()|[\]\\]/g, '\\$&')
            .replace(/\*/g, '[^/]*')
            .replace(/\?/g, '[^/]'),
        )
        .join('.*');
      return { negate, regex: new RegExp(anchored ? `^${body}$` : `(?:^|/)${body}$`) };
    });
  return (path) => {
    const parts = normalizeRel(path).split('/');
    let ignored = false;
    for (let i = 1; i <= parts.length; i += 1) {
      const prefix = parts.slice(0, i).join('/');
      for (const rule of rules) if (rule.regex.test(prefix)) ignored = !rule.negate;
      if (ignored && i < parts.length) return true; // an ignored directory hides its contents
    }
    return ignored;
  };
}

// ---------------------------------------------------------------------------------------------
// Backlog model, shared by several rules.

export function readBacklog(corpus) {
  const lines = corpus.docs.get(BACKLOG);
  const model = {
    lines,
    tables: [],
    open: new Map(),
    done: new Map(),
    openSpans: new Set(),
    openText: '',
    stageSections: new Map(),
  };
  if (!lines) return model;
  model.tables = tablesOf(lines);
  for (const table of model.tables) {
    if (table.header[0] !== 'Id') continue;
    const isDone = table.heading === 'Done';
    for (const row of table.rows) {
      if (row.cells.length !== table.header.length) continue;
      const id = row.cells[0];
      (isDone ? model.done : model.open).set(id, row.line);
      if (!isDone) {
        for (const match of row.text.matchAll(/`([^`]+)`/g)) model.openSpans.add(match[1]);
        model.openText += `${row.text}\n`;
      }
    }
  }
  // Stage sections ("## E1 - ...", "## E6 / E7 / E8 - ...") and how many rows each still holds;
  // every row counts, malformed or not, so a broken row never makes a stage look complete.
  const stagesOf = (heading) => {
    const label = heading.split(' - ')[0];
    return /^E\d/.test(label) ? (label.match(STAGE_TOKEN) ?? []) : [];
  };
  for (const line of lines) {
    const h2 = /^##\s+(.*?)\s*$/.exec(line.code ? '' : line.text);
    for (const stage of h2 ? stagesOf(h2[1]) : []) model.stageSections.set(stage, 0);
  }
  for (const table of model.tables) {
    for (const stage of stagesOf(table.heading)) {
      model.stageSections.set(stage, model.stageSections.get(stage) + table.rows.length);
    }
  }
  return model;
}

function stageComplete(backlog, stage) {
  if ([...backlog.done.keys()].some((id) => id === stage || id.startsWith(`${stage}-`))) {
    return true;
  }
  return backlog.stageSections.has(stage) && backlog.stageSections.get(stage) === 0;
}

/**
 * Named by open work: an open backlog row has it in a code span or, for a bare file name such as
 * `CHANGELOG.md`, mentions its stem as a word ("CHANGELOG built from ...").
 */
function namedByOpenRow(backlog, name) {
  if (backlog.openSpans.has(name)) return true;
  const stem = name.replace(/\.[a-z]+$/, '');
  if (name.includes('/') || stem.length < 4 || !/^[\w-]+$/.test(stem)) return false;
  return new RegExp(`(?<![\\w-])${stem}(?![\\w-])`).test(backlog.openText);
}

/** Planned: an open backlog row names it, or a later parenthesis on its line cites an open stage. */
function planned(backlog, name, lineText, after) {
  if (namedByOpenRow(backlog, name)) return true;
  for (const paren of lineText.slice(after).matchAll(/\(([^()]*)\)/g)) {
    const stages = paren[1].match(STAGE_TOKEN) ?? [];
    if (stages.some((stage) => !stageComplete(backlog, stage))) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------------------------
// Rules.

function checkLinks(corpus, out) {
  const anchorCache = new Map();
  const anchorsFor = (file) => {
    if (!anchorCache.has(file)) {
      const lines = corpus.docs.get(file) ?? analyse(readFileSync(join(corpus.root, file), 'utf8'));
      anchorCache.set(file, anchorsOf(lines));
    }
    return anchorCache.get(file);
  };
  const inbound = new Map();
  for (const [file, lines] of corpus.docs) {
    for (const { target, line } of linksOf(lines)) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//')) continue;
      const [rawPath, anchor] = target.split('#');
      const path = decodeURI(rawPath);
      const rel = path
        ? normalizeRel(path.startsWith('/') ? path.slice(1) : posix.join(parentDir(file), path))
        : file;
      if (rel.startsWith('..')) {
        out.push(finding('dead-link', file, line, `${target} points outside the repository`));
        continue;
      }
      if (!existsSync(join(corpus.root, rel))) {
        out.push(finding('dead-link', file, line, `${target}: ${rel} does not exist`));
        continue;
      }
      if (rel !== file) inbound.set(rel, (inbound.get(rel) ?? 0) + 1);
      if (anchor && rel.endsWith('.md') && statSync(join(corpus.root, rel)).isFile()) {
        if (!anchorsFor(rel).has(anchor)) {
          out.push(finding('dead-link', file, line, `${target}: no heading #${anchor} in ${rel}`));
        }
      }
    }
  }
  return inbound;
}

function checkOrphans(corpus, inbound, out) {
  for (const file of corpus.docs.keys()) {
    const inDocs = file.startsWith('docs/') || /^services\/[^/]+\/docs\//.test(file);
    if (!inDocs || posix.basename(file) === 'README.md') continue;
    if (!inbound.has(file)) {
      out.push(finding('orphan-doc', file, 1, 'no other Markdown file links to this document'));
    }
  }
}

/** A code span as a path to check, or null when it is not one (see the header). */
export function pathCandidate(span, topLevel) {
  if (/\s/.test(span) || /^[-@#!]/.test(span) || span.includes('://')) return null;
  if (/[<>{}*$|=(),:;?'"\\[\]]/.test(span) || span.includes('...')) return null;
  if (/(?:^|[^A-Za-z])(?:N{2,}|X{2,})(?:[^A-Za-z]|$)/.test(span)) return null; // NNNN-title.md
  const path = span.replace(/^\.\//, '');
  const relative = path.startsWith('../');
  const anchored = relative || (path.includes('/') && topLevel.has(path.split('/')[0]));
  if (!anchored && !PATH_EXT.test(path.replace(/\/$/, ''))) return null;
  return { path, anchored };
}

function pathExists(corpus, file, { path, anchored }) {
  const bases = path.startsWith('../') ? [] : [''];
  bases.push(parentDir(file));
  const pack = packDir(file);
  if (pack) bases.push(pack);
  for (const base of bases) {
    const rel = normalizeRel(posix.join(base, path));
    if (!rel.startsWith('..') && existsSync(join(corpus.root, rel))) return true;
  }
  if (anchored) return false;
  const tail = normalizeRel(path);
  const endsWith = (entry) => entry === tail || entry.endsWith(`/${tail}`);
  return corpus.files.some(endsWith) || [...corpus.dirs].some(endsWith);
}

function checkPaths(corpus, backlog, out) {
  for (const [file, lines] of corpus.docs) {
    lines.forEach((line, index) => {
      for (const span of line.spans) {
        const candidate = pathCandidate(span.text, corpus.topLevel);
        if (!candidate) continue;
        const local = normalizeRel(posix.join(parentDir(file), candidate.path));
        if (corpus.ignore(candidate.path) || corpus.ignore(local)) continue;
        if (planned(backlog, span.text, line.text, span.index + span.text.length + 2)) continue;
        if (!pathExists(corpus, file, candidate)) {
          out.push(finding('dead-path', file, index + 1, `\`${span.text}\` does not exist`));
        }
      }
    });
  }
}

function checkBacklog(backlog, out) {
  if (!backlog.lines) return;
  const seen = new Map();
  for (const table of backlog.tables) {
    if (table.header[0] !== 'Id') continue;
    const isDone = table.heading === 'Done';
    const status = table.header.indexOf('Status');
    if (!isDone && status === -1) {
      out.push(
        finding('backlog-row-shape', BACKLOG, table.headerLine, 'open table has no Status column'),
      );
    }
    for (const row of table.rows) {
      const add = (message) => out.push(finding('backlog-row-shape', BACKLOG, row.line, message));
      if (row.cells.length !== table.header.length) {
        add(
          `row has ${row.cells.length} cells, the header has ${table.header.length}; row skipped`,
        );
        continue;
      }
      const [id] = row.cells;
      if (!ITEM_ID.test(id) && !(isDone && STAGE_ID.test(id))) {
        add(`id "${id}" is neither PREFIX-NN${isDone ? ' nor a stage id (E0, E0.5-a)' : ''}`);
      }
      const earlier = seen.get(id);
      if (earlier) {
        const where = earlier.done === isDone ? 'repeats' : isDone ? 'is open at' : 'is in Done at';
        add(`id ${id} ${where} line ${earlier.line}`);
      } else seen.set(id, { line: row.line, done: isDone });
      if (!row.cells[1]) add(`${id}: item text is empty`);
      if (isDone) {
        const closing = row.cells[row.cells.length - 1];
        if (!CLOSING.test(closing)) add(`${id}: "${closing}" is not a closing commit reference`);
      } else if (status !== -1 && !STATUSES.includes(row.cells[status])) {
        add(`${id}: status "${row.cells[status]}" is not one of ${STATUSES.join(', ')}`);
      }
    }
  }
}

/**
 * Git run in `dir`. The GIT_* variables of a calling hook (`GIT_DIR`, `GIT_INDEX_FILE`) are left out,
 * so they cannot point it at another repository.
 */
function gitIn(dir) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_')),
  );
  return (args, { input, extraEnv = {} } = {}) =>
    execFileSync('git', args, {
      cwd: dir,
      encoding: 'utf8',
      input,
      env: { ...env, ...extraEnv },
    }).trim();
}

function checkClosingCommits(backlog, gitDir, out) {
  if (!backlog.lines || !existsSync(join(gitDir, '.git'))) return;
  const done = backlog.tables.filter(
    (table) => table.heading === 'Done' && table.header[0] === 'Id',
  );
  if (done.length === 0) return;
  const git = gitIn(gitDir);
  if (git(['rev-parse', '--is-shallow-repository']) === 'true') {
    out.push(
      finding(
        'closing-commit',
        BACKLOG,
        done[0].headerLine,
        'the clone is shallow, so closing commits cannot be checked; fetch the full history',
      ),
    );
    return;
  }
  const history = git(['rev-list', 'HEAD']).split('\n');
  const rows = [];
  let cited = 0;
  let missing = 0;
  for (const table of done) {
    for (const row of table.rows) {
      const closing = row.cells[row.cells.length - 1];
      // A short row or a malformed reference is backlog-row-shape's finding, not this one.
      if (row.cells.length !== table.header.length || !CLOSING.test(closing)) continue;
      const hashes = [...closing.matchAll(/`([0-9a-f]+)`/g)].map((match) => match[1]);
      cited += hashes.length;
      const absent = hashes.filter((hash) => !history.some((commit) => commit.startsWith(hash)));
      missing += absent.length;
      if (absent.length > 0) {
        const names = absent.map((hash) => `\`${hash}\``).join(', ');
        rows.push(
          finding(
            'closing-commit',
            BACKLOG,
            row.line,
            `${row.cells[0]}: ${names} is not a commit in the history of HEAD`,
          ),
        );
      }
    }
  }
  // Not one cited hash is known: the history is another repository's, as in a copy created from
  // the GitHub template, which starts with a single commit. One finding says so.
  if (cited > 0 && missing === cited) {
    out.push(
      finding(
        'closing-commit',
        BACKLOG,
        done[0].headerLine,
        'no closing commit is in the history of HEAD; a repository created from the template starts its own backlog (docs/guides/adopt-the-template.md)',
      ),
    );
    return;
  }
  out.push(...rows);
}

/**
 * Run `use(dir)` over the self-test's own git history (GATE-15), then delete it. The repository is
 * built with plumbing from fixed identities, dates and messages and an empty tree, so its hashes are
 * the same on every machine and the fixture backlog can cite them: `main` (HEAD) holds `first` and
 * `second`; `side` branches from `first` and is never merged, so its commit exists without being in
 * the history of HEAD. Messages are passed as arguments, so no line ending of the checkout reaches
 * an object.
 */
export function withFixtureHistory(use) {
  const dir = mkdtempSync(join(tmpdir(), 'lint-docs-history-'));
  try {
    const git = gitIn(dir);
    git(['init', '-q', '--object-format=sha1', '--initial-branch=main']);
    const tree = git(['mktree'], { input: '' });
    const commit = (message, seconds, parent) => {
      const identity = {
        name: 'Fixture',
        email: 'fixture@example.invalid',
        date: `${seconds} +0000`,
      };
      return git(
        [
          '-c',
          'commit.gpgSign=false',
          '-c',
          'i18n.commitEncoding=UTF-8',
          'commit-tree',
          tree,
          ...(parent ? ['-p', parent] : []),
          '-m',
          message,
        ],
        {
          extraEnv: {
            GIT_AUTHOR_NAME: identity.name,
            GIT_AUTHOR_EMAIL: identity.email,
            GIT_AUTHOR_DATE: identity.date,
            GIT_COMMITTER_NAME: identity.name,
            GIT_COMMITTER_EMAIL: identity.email,
            GIT_COMMITTER_DATE: identity.date,
          },
        },
      );
    };
    const first = commit('fixture: first', 1767225600);
    const second = commit('fixture: second', 1767229200, first);
    const side = commit('fixture: side, never merged', 1767232800, first);
    git(['update-ref', 'refs/heads/main', second]);
    git(['update-ref', 'refs/heads/side', side]);
    return use(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The integers first..last inclusive (empty when first > last). */
const span = (first, last) =>
  Array.from({ length: Math.max(0, last - first + 1) }, (_, offset) => first + offset);

function lessonIds(corpus) {
  const lines = corpus.docs.get(LESSONS);
  if (!lines) return null;
  const ids = [];
  lines.forEach((line, index) => {
    const match = /^\*\*L-(\d{2,3}) - /.exec(line.code ? '' : line.text);
    if (match) ids.push({ number: Number(match[1]), line: index + 1 });
  });
  return ids;
}

function adrNumbers(corpus) {
  const numbers = new Map();
  for (const file of corpus.files) {
    const match = /^docs\/adr\/(\d{4})-[a-z0-9-]+\.md$/.exec(file);
    if (match) numbers.set(match[1], file);
  }
  return numbers;
}

function checkCounts(corpus, backlog, out) {
  const lessons = lessonIds(corpus);
  if (lessons) {
    lessons.forEach(({ number, line }, i) => {
      // Compared with the previous lesson, so one gap is reported once, not on every later entry.
      const want = i === 0 ? 1 : lessons[i - 1].number + 1;
      if (number !== want) {
        const expected = `L-${String(want).padStart(2, '0')}`;
        out.push(
          finding('count-claim', LESSONS, line, `lesson numbered ${number}, expected ${expected}`),
        );
      }
    });
    const defined = new Set(lessons.map((l) => l.number));
    for (const [file, lines] of corpus.docs) {
      lines.forEach((line, index) => {
        if (line.code) return;
        for (const match of line.text.matchAll(/\bL-(\d{2,3})(?:\.\.L-(\d{2,3}))?\b/g)) {
          const low = Number(match[1]);
          const high = Number(match[2] ?? match[1]);
          if (low > high || span(low, high).some((n) => !defined.has(n))) {
            out.push(
              finding(
                'count-claim',
                file,
                index + 1,
                `${match[0]} cites lessons that do not exist`,
              ),
            );
          }
        }
      });
    }
  }
  const adrs = adrNumbers(corpus);
  for (const [file, lines] of corpus.docs) {
    lines.forEach((line, index) => {
      if (line.code) return;
      for (const match of line.text.matchAll(/\bADRs (\d{4})\s*[-–]\s*(\d{4})\b/g)) {
        const [first, last] = [Number(match[1]), Number(match[2])];
        const absent = span(first, last).filter((n) => !adrs.has(String(n).padStart(4, '0')));
        if (first > last || absent.length) {
          out.push(
            finding(
              'count-claim',
              file,
              index + 1,
              `${match[0]}: not every ADR in the range exists`,
            ),
          );
        }
      }
    });
  }
  if (!backlog.lines) return;
  backlog.lines.forEach((line, index) => {
    if (line.code || !/\bDone\b/.test(line.text)) return;
    for (const match of line.text.matchAll(/\b([A-Z]+)-(\d{2}) to \1-(\d{2})\b/g)) {
      const [, prefix, from, to] = match;
      const id = (n) => `${prefix}-${String(n).padStart(2, '0')}`;
      const problems = [];
      for (const claimed of span(Number(from), Number(to)).map(id)) {
        if (!backlog.done.has(claimed)) problems.push(`${claimed} is not in Done`);
      }
      const ofPrefix = (key) => key.startsWith(`${prefix}-`) && ITEM_ID.test(key);
      for (const key of [...backlog.done.keys()].filter(ofPrefix)) {
        const n = Number(key.slice(prefix.length + 1));
        if (n < Number(from) || n > Number(to))
          problems.push(`${key} is in Done outside the range`);
      }
      for (const key of [...backlog.open.keys()].filter(ofPrefix)) problems.push(`${key} is open`);
      if (problems.length) {
        out.push(finding('count-claim', BACKLOG, index + 1, `${match[0]}: ${problems.join('; ')}`));
      }
    }
  });
}

function checkAdrs(corpus, out) {
  const adrs = adrNumbers(corpus);
  const index = `${ADR_DIR}/README.md`;
  const add = (file, line, message) => out.push(finding('adr-index', file, line, message));
  for (const file of corpus.files) {
    if (file.startsWith(`${ADR_DIR}/`) && file.endsWith('.md') && file !== index) {
      if (!/^docs\/adr\/\d{4}-[a-z0-9-]+\.md$/.test(file))
        add(file, 1, 'ADR file name is not NNNN-title.md');
    }
  }
  const statuses = new Map();
  for (const [number, file] of adrs) {
    const lines = corpus.docs.get(file) ?? [];
    const at = lines.findIndex((line) => !line.code && /^\*\*Status:\*\*/.test(line.text));
    if (at === -1) {
      add(file, 1, 'no **Status:** line');
      continue;
    }
    const value = /^\*\*Status:\*\*\s*([A-Za-z]+)/.exec(lines[at].text)?.[1] ?? '';
    statuses.set(number, value);
    if (!ADR_STATUSES.includes(value)) {
      add(file, at + 1, `status "${value}" is not one of ${ADR_STATUSES.join(', ')}`);
    }
  }
  const indexLines = corpus.docs.get(index);
  if (indexLines && adrs.size) {
    const listed = new Set();
    for (const table of tablesOf(indexLines)) {
      const statusColumn = table.header.indexOf('Status');
      for (const row of table.rows) {
        const number = /^\[?(\d{4})\]?/.exec(row.cells[0] ?? '')?.[1];
        if (!number) continue;
        listed.add(number);
        if (!adrs.has(number)) {
          add(index, row.line, `ADR ${number} is listed but has no file`);
          continue;
        }
        const listedStatus = /^[A-Za-z]+/.exec(row.cells[statusColumn] ?? '')?.[0];
        if (statusColumn !== -1 && statuses.has(number) && listedStatus !== statuses.get(number)) {
          add(
            index,
            row.line,
            `ADR ${number} is "${listedStatus}" here but "${statuses.get(number)}" in its file`,
          );
        }
      }
    }
    for (const [number, file] of adrs) {
      if (!listed.has(number)) add(file, 1, `ADR ${number} is not listed in ${index}`);
    }
  } else if (adrs.size) {
    add(ADR_DIR, 1, `ADRs exist but ${index} does not`);
  }
  for (const [file, lines] of corpus.docs) {
    lines.forEach((line, i) => {
      if (line.code) return;
      for (const match of line.text.matchAll(/\bADR (\d{4})\b/g)) {
        if (!adrs.has(match[1])) add(file, i + 1, `ADR ${match[1]} does not exist`);
      }
    });
  }
}

/**
 * Names an artifact may exist under: file base names, skill folders, exports, npm scripts, quoted
 * rule names and quoted tags.
 */
function artifactIndex(corpus) {
  const names = new Set();
  for (const file of corpus.files) {
    const base = posix.basename(file);
    names.add(base.replace(/\.[^.]+$/, ''));
    if (base === 'SKILL.md') names.add(posix.basename(posix.dirname(file)));
    if (!CODE_EXT.test(file)) continue;
    const text = readFileSync(join(corpus.root, file), 'utf8');
    for (const match of text.matchAll(
      /export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/g,
    )) {
      names.add(match[1]);
    }
    if (/^(?:scripts|\.claude)\//.test(file)) {
      for (const match of text.matchAll(/['"](@?[a-z][a-z0-9]*(?:-[a-z0-9]+)+|@[a-z]+)['"]/g)) {
        names.add(match[1]);
      }
    }
  }
  const scripts = new Set();
  const pkg = join(corpus.root, 'package.json');
  if (existsSync(pkg)) {
    for (const name of Object.keys(JSON.parse(readFileSync(pkg, 'utf8'))['scripts'] ?? {})) {
      scripts.add(name);
    }
  }
  return { names, scripts };
}

function artifactExists(corpus, index, span) {
  const npm = /^npm run (\S+)/.exec(span);
  if (npm) return index.scripts.has(npm[1]);
  const name = span.split(/\s+/)[0].replace(/\(\)$/, '');
  if (name.includes('/') || name.startsWith('.') || PATH_EXT.test(name)) {
    const rel = normalizeRel(name);
    return existsSync(join(corpus.root, rel)) || corpus.files.some((f) => f.endsWith(`/${rel}`));
  }
  return index.names.has(name) || index.scripts.has(name);
}

/** Artifacts named after "*Guarded by:*", each with the stages of its clause. */
export function guardedArtifacts(lines) {
  const artifacts = [];
  for (let i = 0; i < lines.length; i += 1) {
    const lesson = /^\*\*(L-\d{2,3}) - /.exec(lines[i].code ? '' : lines[i].text);
    if (!lesson) continue;
    const paragraph = [];
    for (let j = i; j < lines.length && lines[j].text.trim() !== ''; j += 1) {
      paragraph.push({ text: lines[j].text, line: j + 1 });
    }
    const joined = paragraph.map((p) => p.text).join('\n');
    const start = joined.indexOf('*Guarded by:*');
    if (start === -1) continue;
    const lineAt = (offset) => paragraph[joined.slice(0, offset).split('\n').length - 1].line;
    let pending = [];
    const flush = (stages) => {
      for (const artifact of pending) artifacts.push({ ...artifact, stages });
      pending = [];
    };
    for (const match of joined.slice(start).matchAll(/`([^`]+)`|\(([^()]*)\)|;/g)) {
      if (match[1] !== undefined) {
        pending.push({ lesson: lesson[1], name: match[1], line: lineAt(start + match.index) });
      } else if (match[2] !== undefined) {
        const stages = match[2].match(STAGE_TOKEN);
        if (stages) flush(stages);
      } else flush([]);
    }
    flush([]);
  }
  return artifacts;
}

function checkGuards(corpus, backlog, out) {
  const lines = corpus.docs.get(LESSONS);
  if (!lines) return;
  const index = artifactIndex(corpus);
  for (const artifact of guardedArtifacts(lines)) {
    if (artifact.name.startsWith('-')) continue; // a flag, not an artifact
    if (!artifact.stages.every((stage) => stageComplete(backlog, stage))) continue;
    if (namedByOpenRow(backlog, artifact.name)) continue;
    if (!artifactExists(corpus, index, artifact.name)) {
      const due = artifact.stages.length ? ` (${artifact.stages.join(', ')} complete)` : '';
      out.push(
        finding(
          'lesson-guard',
          LESSONS,
          artifact.line,
          `${artifact.lesson} is guarded by \`${artifact.name}\`${due}, but no file, export, npm script or rule has that name`,
        ),
      );
    }
  }
}

function checkRegistries(corpus, out) {
  for (const registry of loadRegistries(corpus.root)) {
    for (const problem of registry.problems) {
      out.push(finding('registry-shape', problem.file, problem.line, problem.message));
    }
    for (const detail of registry.details ?? []) {
      const tags = detail.fields['Tags'] ?? '';
      if (!tags.includes(DESTRUCTIVE_TAG) || detail.fields['Recovery']?.trim()) continue;
      out.push(
        finding(
          'destructive-recovery',
          registry.file,
          detail.line,
          `${detail.id} is ${DESTRUCTIVE_TAG} but its details have no **Recovery** bullet`,
        ),
      );
    }
  }
}

/**
 * Every finding for the repository (or fixture tree) at `root`. `git` is the repository whose
 * history the closing commits are checked against: the root itself unless given.
 */
export function lintDocs(root = REPO_ROOT, { git = root } = {}) {
  const corpus = loadCorpus(root);
  const backlog = readBacklog(corpus);
  const out = [];
  const inbound = checkLinks(corpus, out);
  checkOrphans(corpus, inbound, out);
  checkPaths(corpus, backlog, out);
  checkBacklog(backlog, out);
  checkClosingCommits(backlog, git, out);
  checkCounts(corpus, backlog, out);
  checkAdrs(corpus, out);
  checkGuards(corpus, backlog, out);
  checkRegistries(corpus, out);
  return out;
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const args = parseCli({
    'self-test': { type: 'boolean', default: false },
    root: { type: 'string' },
  });
  if (args['self-test']) {
    process.exitCode = withFixtureHistory((git) =>
      selfTest('lint-docs', FIXTURE_DIR, lintDocs(FIXTURE_DIR, { git })),
    );
  } else {
    process.exitCode = report('lint-docs', lintDocs(resolve(args['root'] ?? REPO_ROOT)));
  }
}
