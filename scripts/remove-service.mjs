#!/usr/bin/env node
/**
 * Removes a service pack from the repository (FUT-12): the counterpart of scaffold-service for a
 * repository created from the template that does not want an example pack.
 *
 *   node scripts/remove-service.mjs --name <pack> [--dry-run] [--force]
 *       (`npm run remove:service -- --name <pack>`; the name may also be given without --name)
 *
 * What belongs to a pack is decided from structure, never from its name appearing in free text:
 *   - its scripts: `<pack>` and `<pack>:*`, and those that run a file of services/<pack>/ and of no
 *     other pack;
 *   - its compose services: named `<pack>` or `<pack>-*`, or named as arguments of a
 *     `docker compose` command that only its scripts run;
 *   - its variables: the `env` names of its qa-config entries (auth and actors), the `${VAR}` its
 *     compose services read, and `QA_<PACK>_BASE_URL`/`_SPEC_URL`; never a variable the core code
 *     names, nor one another pack uses;
 *   - its markers in CI text: `services/<pack>`, `--service <pack>`, `api-<pack>`,
 *     `preflight-<pack>`, a name with `(<pack>)`, `npm run` of its scripts, its variables, its
 *     compose services in a `docker compose` line, and its entry in a `strategy.matrix` list.
 * A workflow job or a Jenkinsfile stage belongs to the pack when it carries the pack's markers and
 * no other pack's. A pack whose name is framework vocabulary (github, qa, api, ...) is refused.
 *
 * It deletes services/<pack>/, .claude/skills/<pack>-api/ and docs/discovery/<pack>-digest.json,
 * and edits: package.json (its scripts), qa-config.example.json (its entries, and the environments
 * only it used), docker-compose.yml (its services, its `x-<pack>` extension, volumes and networks
 * only they used, header paragraphs with its markers), the workflows (its jobs, a workflow left
 * without jobs, its entry in a shared matrix list, path filters into services/<pack>/), the
 * Jenkinsfiles (its stages, the functions and parameters only they used, single statements that run
 * its scripts or services), the required checks that were the names of its removed jobs (in
 * .github/rulesets and scripts/__tests__/ruleset.test.mjs), .gitleaksignore entries for removed
 * files, the NOTICE paragraph that covers only its files, and its variables in .env.example and
 * .actrc. Every YAML and JSON edit is parsed back and compared with a document built independently
 * of the text edit; a Jenkinsfile edit must keep (), [] and {} balanced. An edit that fails these
 * checks is not made and the file is listed for a person.
 *
 * Then it lists what is left: the notes of the plan, the mentions of the pack outside the history
 * files, and what blocks `npm run gates` now (lint-docs findings and the failing tests of each test
 * file that names the pack). It never touches the history files (CHANGELOG.md, docs/backlog.md,
 * docs/adr/) nor a local qa-config.json, which it reports instead.
 *
 * Guards: it refuses the last pack, an unknown or reserved name, a default environment that would
 * lose its only pack, and a working tree with changes unless --force. --dry-run prints the plan and
 * changes nothing.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual, parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { packVariable, REPO_ROOT, servicePacks } from './lib/cli.mjs';
import { describeExit, exitCodeOf } from './lib/spawn.mjs';

const NAME = /^[a-z][a-z0-9-]*$/;
/** Files that record what happened; a removal never edits them. */
export const HISTORY = ['CHANGELOG.md', 'docs/backlog.md', 'docs/adr/'];
const isHistory = (file) =>
  HISTORY.some((entry) => (entry.endsWith('/') ? file.startsWith(entry) : file === entry));

/**
 * Names a pack must not have here: words the framework, its CI and its tools use, so markers such
 * as `(github)` or variables such as `QA_*` would not be the pack's. The namespaces of the
 * package.json scripts that belong to no pack are added from the repository.
 */
export const RESERVED = [
  'allure',
  'anthropic',
  'api',
  'ci',
  'claude',
  'compose',
  'config',
  'dast',
  'default',
  'diff',
  'docker',
  'docs',
  'drift',
  'env',
  'fixtures',
  'gates',
  'git',
  'github',
  'helpers',
  'jenkins',
  'jira',
  'k6',
  'local',
  'node',
  'npm',
  'perf',
  'playwright',
  'preflight',
  'public',
  'qa',
  'reference',
  'reports',
  'schemas',
  'scripts',
  'services',
  'title',
  'tm',
  'tracker',
  'unit',
  'zap',
];

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const token = (name, flags = 'i') =>
  new RegExp(`(?<![A-Za-z0-9])${escape(name)}(?![A-Za-z0-9])`, flags);
const variableToken = (name) => new RegExp(`(?<![A-Za-z0-9_])${escape(name)}(?![A-Za-z0-9_])`);
const blank = (line) => line.trim() === '';
const posix = (path) => path.replace(/\\/g, '/');
const indentOf = (line) => /^ */.exec(line)[0].length;

/**
 * Names: `ownsName` tells a compose service or script of the pack (`<pack>`, `<pack>-*`,
 * `<pack>:*`) from one of a longer pack (`pet-admin` when `pet` is removed); `mentions` finds the
 * pack's name as a word, for the list of mentions a person reads, never to decide ownership.
 */
export function packContext(pack, packs = []) {
  const all = [...new Set([...packs, pack])];
  const others = all.filter((name) => name !== pack);
  const longer = others.filter((other) => token(pack).test(other));
  return {
    pack,
    mentions: (text) => {
      let masked = String(text);
      for (const other of longer)
        masked = masked.replace(token(other, 'gi'), (m) => '\0'.repeat(m.length));
      return token(pack).test(masked);
    },
    ownsName: (name, separator = '-') =>
      (name === pack || name.startsWith(`${pack}${separator}`)) &&
      !others.some(
        (other) =>
          other.startsWith(`${pack}${separator}`) &&
          (name === other || name.startsWith(`${other}${separator}`)),
      ),
  };
}

// ---------------------------------------------------------------------------------------------
// What belongs to each pack

const VALUED_GLOBAL = new Set([
  '-f',
  '--file',
  '-p',
  '--project-name',
  '--profile',
  '--env-file',
  '--project-directory',
  '--ansi',
  '--progress',
  '--parallel',
]);
const VALUED_COMMAND = new Set([
  '-t',
  '--timeout',
  '--scale',
  '--wait-timeout',
  '-e',
  '--env',
  '-u',
  '--user',
  '-w',
  '--workdir',
  '--name',
  '--entrypoint',
  '-l',
  '--label',
  '-p',
  '--publish',
  '-v',
  '--volume',
  '--index',
  '--tail',
  '--since',
  '--until',
  '--pull',
  '--signal',
  '-s',
]);

/** The compose services a command names as arguments of `docker compose <command>`, nothing else. */
export function composeServicesIn(command, services) {
  const found = new Set();
  for (const segment of String(command ?? '').split(/&&|\|\||;|\|/)) {
    const words = segment.trim().split(/\s+/);
    let i =
      words[0] === 'docker' && words[1] === 'compose' ? 2 : words[0] === 'docker-compose' ? 1 : -1;
    if (i < 0) continue;
    while (i < words.length && words[i].startsWith('-')) i += VALUED_GLOBAL.has(words[i]) ? 2 : 1;
    const subcommand = words[i];
    for (i += 1; i < words.length;) {
      const word = words[i];
      if (word.startsWith('-')) {
        i += VALUED_COMMAND.has(word) ? 2 : 1;
        continue;
      }
      if (services.includes(word)) found.add(word);
      i += 1;
      if (subcommand === 'run' || subcommand === 'exec') break;
    }
  }
  return [...found];
}

/** Every `env` or `*_env` string under a value. */
const envNames = (value) =>
  value && typeof value === 'object'
    ? Object.entries(value).flatMap(([key, inner]) =>
        typeof inner === 'string' && (key === 'env' || key.endsWith('_env'))
          ? [inner]
          : envNames(inner),
      )
    : [];

/**
 * Per pack: `scripts`, `services`, `variables`, the scripts it shares with another pack, and `has`,
 * which tells whether a text carries one of its markers.
 */
export function packModel({
  packs,
  scripts = {},
  compose = null,
  config = null,
  framework = new Set(),
}) {
  const keys = Object.keys(compose?.services ?? {});
  const model = {};
  const usesFiles = (command, pack) => new RegExp(`services/${escape(pack)}/`).test(command);
  for (const pack of packs) {
    const ctx = packContext(pack, packs);
    const own = [];
    const shared = [];
    for (const [name, command] of Object.entries(scripts)) {
      if (ctx.ownsName(name, ':')) own.push(name);
      else if (usesFiles(command, pack)) {
        (packs.some((other) => other !== pack && usesFiles(command, other)) ? shared : own).push(
          name,
        );
      }
    }
    model[pack] = { pack, ctx, scripts: own, sharedScripts: shared };
  }
  const named = (names) => new Set(names.flatMap((name) => composeServicesIn(scripts[name], keys)));
  for (const pack of packs) {
    const mine = named(model[pack].scripts);
    const theirs = named(
      Object.keys(scripts).filter((name) => !model[pack].scripts.includes(name)),
    );
    model[pack].services = keys.filter(
      (key) => model[pack].ctx.ownsName(key) || (mine.has(key) && !theirs.has(key)),
    );
  }
  const raw = {};
  for (const pack of packs) {
    const fromConfig = Object.values(config?.api?.environments ?? {}).flatMap((env) =>
      envNames(env?.packs?.[pack]),
    );
    const fromCompose = model[pack].services.flatMap((key) =>
      [...JSON.stringify(compose.services[key]).matchAll(/\$\{([A-Z_][A-Z0-9_]*)/g)].map(
        (m) => m[1],
      ),
    );
    // QA_* is the framework's namespace, apart from the overrides it derives for each pack.
    raw[pack] = new Set(
      [...fromConfig, ...fromCompose].filter((name) => !framework.has(name) && !/^QA_/.test(name)),
    );
  }
  for (const pack of packs) {
    const others = new Set(packs.filter((p) => p !== pack).flatMap((p) => [...raw[p]]));
    model[pack].variables = [
      ...new Set([
        ...[...raw[pack]].filter((name) => !others.has(name)),
        packVariable(pack, 'BASE_URL'),
        packVariable(pack, 'SPEC_URL'),
      ]),
    ];
    model[pack].has = markerTest(model[pack]);
  }
  return model;
}

function markerTest({ pack, scripts, services, variables }) {
  const p = escape(pack);
  const patterns = [
    new RegExp(`services/${p}(?![\\w-])`),
    new RegExp(`--service[= ]${p}(?![\\w-])`),
    new RegExp(`(?<![\\w-])(?:api|preflight)-${p}(?![\\w-])`),
    new RegExp(`\\(${p}(?=[\\s)])`),
    new RegExp(`skills/${p}-api(?![\\w-])`),
    new RegExp(`(?<![\\w-])${p}-digest\\.json`),
    ...scripts.map((script) => new RegExp(`npm run ${escape(script)}(?![\\w:-])`)),
    ...variables.map(variableToken),
  ];
  const service = services.map((name) => new RegExp(`(?<![\\w.-])${escape(name)}(?![\\w.-])`));
  return (text) =>
    patterns.some((pattern) => pattern.test(text)) ||
    String(text)
      .split('\n')
      .some((line) => /docker[ -]compose/.test(line) && service.some((s) => s.test(line)));
}

/** The pack's view of the model, with the other packs' markers. */
export function scopeFor(pack, model) {
  const others = Object.keys(model).filter((name) => name !== pack);
  const hasOther = (text) => others.some((other) => model[other].has(text));
  return {
    ...model[pack],
    others,
    hasOther,
    owns: (text) => model[pack].has(text) && !hasOther(text),
  };
}

// ---------------------------------------------------------------------------------------------
// Lines

const lines = (text) => text.split('\n');

/**
 * `source` without the ranges [start, end): where the cut leaves two blank lines, or a blank line
 * before a closing bracket, the blank line goes too. `text` reads an item's line.
 */
function cutRanges(source, ranges, text = (item) => item) {
  const out = [...source];
  const closing = (item) => /^\s*[}\])]/.test(text(item));
  const empty = (item) => blank(text(item));
  for (const [start, end] of [...ranges].sort((a, b) => b[0] - a[0])) {
    out.splice(start, end - start);
    let seam = start;
    while (
      seam > 0 &&
      seam < out.length &&
      empty(out[seam - 1]) &&
      (empty(out[seam]) || closing(out[seam]))
    ) {
      out.splice(seam - 1, 1);
      seam -= 1;
    }
    if (seam === 0) while (out.length > 1 && empty(out[0])) out.shift();
  }
  return out;
}

/** Blank-line separated groups of lines: `[start, end)` each. */
function paragraphs(source) {
  const groups = [];
  let start = null;
  source.forEach((line, i) => {
    if (blank(line)) {
      if (start !== null) groups.push([start, i]);
      start = null;
    } else if (start === null) start = i;
  });
  if (start !== null) groups.push([start, source.length]);
  return groups;
}

// ---------------------------------------------------------------------------------------------
// JSON: remove a member or an element and keep the rest of the text as it was written

function scanJson(text) {
  let i = 0;
  const fail = () => {
    throw new Error(`not JSON at offset ${i}`);
  };
  const space = () => {
    while (i < text.length && /\s/.test(text[i])) i += 1;
  };
  const string = () => {
    if (text[i] !== '"') fail();
    const start = i;
    for (i += 1; text[i] !== '"'; i += 1) {
      if (text[i] === '\\') i += 1;
      if (i >= text.length) fail();
    }
    i += 1;
    return JSON.parse(text.slice(start, i));
  };
  const value = () => {
    space();
    const start = i;
    if (text[i] === '{' || text[i] === '[') {
      const object = text[i] === '{';
      const close = object ? '}' : ']';
      const items = [];
      i += 1;
      space();
      if (text[i] === close) {
        i += 1;
        return { type: object ? 'object' : 'array', start, end: i, items };
      }
      for (;;) {
        space();
        const itemStart = i;
        let key;
        if (object) {
          key = string();
          space();
          if (text[i] !== ':') fail();
          i += 1;
        }
        const node = value();
        items.push({ key, start: itemStart, end: node.end, node });
        space();
        if (text[i] === ',') {
          i += 1;
          continue;
        }
        if (text[i] !== close) fail();
        i += 1;
        return { type: object ? 'object' : 'array', start, end: i, items };
      }
    }
    if (text[i] === '"') {
      string();
      return { type: 'string', start, end: i };
    }
    const literal = /^(?:-?\d[\d.eE+-]*|true|false|null)/.exec(text.slice(i));
    if (!literal) fail();
    i += literal[0].length;
    return { type: 'literal', start, end: i };
  };
  return value();
}

const deleteAt = (document, path) => {
  const parent = path.slice(0, -1).reduce((node, step) => node[step], document);
  const last = path.at(-1);
  if (Array.isArray(parent)) parent.splice(last, 1);
  else delete parent[last];
};

/**
 * `text` without the member or element at `path` (keys and indexes), its comma and its line; the
 * rest stays as written. Checked: the result parses to the document without that entry.
 */
export function removeJson(text, path) {
  let node = scanJson(text);
  let parent = null;
  let index = -1;
  for (const step of path) {
    if (node.type !== 'object' && node.type !== 'array')
      throw new Error(`${path.join('.')}: no such entry`);
    parent = node;
    index = node.type === 'object' ? node.items.findIndex((item) => item.key === step) : step;
    if (index < 0 || !node.items[index]) throw new Error(`${path.join('.')}: no such entry`);
    node = node.items[index].node;
  }
  const { items } = parent;
  let from;
  let to;
  if (index > 0) [from, to] = [items[index - 1].end, items[index].end];
  else if (items.length > 1) [from, to] = [items[0].start, items[1].start];
  else [from, to] = [parent.start + 1, parent.end - 1];
  const result = text.slice(0, from) + text.slice(to);
  const expected = JSON.parse(text);
  deleteAt(expected, path);
  if (!isDeepStrictEqual(JSON.parse(result), expected)) {
    throw new Error(`${path.join('.')}: the edit did not parse back as expected`);
  }
  return result;
}

// ---------------------------------------------------------------------------------------------
// package.json and qa-config

/** The pack's scripts; a note for a script that runs files of this pack and of another. */
export function editPackageJson(text, scope) {
  const scripts = JSON.parse(text).scripts ?? {};
  let out = text;
  for (const name of scope.scripts) out = removeJson(out, ['scripts', name]);
  const notes = scope.sharedScripts.map(
    (name) =>
      `package.json: script ${name} runs files of ${scope.pack} and of another pack; edit it by hand.`,
  );
  for (const [name, command] of Object.entries(scripts)) {
    if (scope.scripts.includes(name)) continue;
    for (const [, target] of command.matchAll(/\bnpm run (\S+)/g)) {
      if (scope.scripts.includes(target))
        notes.push(`package.json: script ${name} runs the removed ${target}.`);
    }
  }
  return {
    text: out,
    changes: scope.scripts.length > 0 ? [`scripts ${scope.scripts.join(', ')}`] : [],
    notes,
  };
}

/** The pack's entry in every environment, and each environment that ran only this pack. */
export function editQaConfig(text, scope, file = 'qa-config.example.json') {
  const { pack } = scope;
  const config = JSON.parse(text);
  const changes = [];
  const notes = [];
  const errors = [];
  let out = text;
  for (const [env, entry] of Object.entries(config.api?.environments ?? {})) {
    if (!entry?.packs || !Object.hasOwn(entry.packs, pack)) continue;
    const rest = Object.keys(entry.packs).filter((name) => name !== pack);
    if (rest.length > 0) {
      out = removeJson(out, ['api', 'environments', env, 'packs', pack]);
      changes.push(`api.environments.${env}.packs.${pack}`);
    } else if (config.api.default_environment === env) {
      errors.push(
        `${file}: api.default_environment "${env}" runs only ${pack}; make an environment that ` +
          'runs another pack the default first.',
      );
    } else {
      out = removeJson(out, ['api', 'environments', env]);
      changes.push(`api.environments.${env} (it ran only ${pack})`);
    }
  }
  const report = new RegExp(`(^|/)${escape(pack)}(\\.[a-z]+$|/)`);
  for (const [check, settings] of Object.entries(config.quality_gate ?? {})) {
    if (typeof settings?.source === 'string' && report.test(settings.source)) {
      notes.push(
        `${file}: quality_gate.${check}.source is ${settings.source}, a report of this pack; ` +
          'point it at another pack or remove the check (a missing source is SKIPPED).',
      );
    }
  }
  return { text: out, changes, notes, errors };
}

/** What a local qa-config.json still says about the pack: reported, never edited. */
export function localConfigNotes(text, pack, file = 'qa-config.json') {
  let config;
  try {
    config = JSON.parse(text);
  } catch {
    return [`${file} is not valid JSON; check it for ${pack} by hand.`];
  }
  const envs = Object.entries(config.api?.environments ?? {})
    .filter(([, entry]) => entry?.packs && Object.hasOwn(entry.packs, pack))
    .map(([env]) => env);
  return envs.length > 0
    ? [
        `${file} (yours, untracked, not edited) still configures ${pack} in ` +
          `${envs.map((env) => `api.environments.${env}`).join(', ')}; remove those entries.`,
      ]
    : [];
}

// ---------------------------------------------------------------------------------------------
// YAML by blocks of indentation, checked by parsing

/** Index after the last line of the top-level section that starts at `keyLine`. */
function sectionEnd(source, keyLine) {
  let end = source.findIndex((line, i) => i > keyLine && /^[^\s#]/.test(line));
  if (end < 0) return source.length;
  while (end - 1 > keyLine && /^#/.test(source[end - 1])) end -= 1;
  return end;
}

/** The indentation of the first key under `from`, or null when the section is empty. */
function childIndent(source, from, to) {
  for (let i = from; i < to; i += 1) {
    if (!blank(source[i]) && !/^\s*#/.test(source[i])) return indentOf(source[i]);
  }
  return null;
}

/** The keys at `indent` between `from` and `to`, each with its lines (and its leading comments). */
function yamlBlocks(source, from, to, indent, { comments = true } = {}) {
  const key = new RegExp(`^ {${indent}}([A-Za-z0-9_.-]+):(?:\\s|$)`);
  const comment = new RegExp(`^ {${indent}}#`);
  const found = [];
  for (let i = from; i < to; i += 1) {
    const match = key.exec(source[i]);
    if (match) found.push({ key: match[1], line: i });
  }
  for (const block of found) {
    block.start = block.line;
    if (comments)
      while (block.start - 1 >= from && comment.test(source[block.start - 1])) block.start -= 1;
  }
  return found.map((block, n) => ({
    ...block,
    end: n + 1 < found.length ? found[n + 1].start : to,
  }));
}

/** The children of the top-level `name:`, at the indentation the file uses. */
function sectionBlocks(source, name) {
  const at = source.findIndex((line) => new RegExp(`^${escape(name)}:(\\s|$)`).test(line));
  if (at < 0) return null;
  const end = sectionEnd(source, at);
  const indent = childIndent(source, at + 1, end);
  return { at, end, blocks: indent === null ? [] : yamlBlocks(source, at + 1, end, indent) };
}

const parseYamlText = (text) => parseYaml(text, { merge: true });
const unquote = (entry) => entry.trim().replace(/^(['"])(.*)\1$/, '$2');

/**
 * The scalar lists of a job's `strategy.matrix`: `{ key, items, lines }` per key, where `lines` are
 * the lines that hold each item (one line for a flow list), plus `other` for include/exclude and
 * lists of mappings, which are never edited.
 */
function matrixLists(source, from, to) {
  const strategy = source.slice(from, to).findIndex((line) => /^\s+strategy:\s*(#.*)?$/.test(line));
  if (strategy < 0) return { lists: [], other: '' };
  const s = from + strategy;
  let m = s + 1;
  while (
    m < to &&
    (blank(source[m]) ||
      (indentOf(source[m]) > indentOf(source[s]) && !/^\s+matrix:\s*(#.*)?$/.test(source[m])))
  )
    m += 1;
  if (
    m >= to ||
    !/^\s+matrix:\s*(#.*)?$/.test(source[m]) ||
    indentOf(source[m]) <= indentOf(source[s])
  ) {
    return { lists: [], other: '' };
  }
  let end = m + 1;
  while (end < to && (blank(source[end]) || indentOf(source[end]) > indentOf(source[m]))) end += 1;
  const indent = childIndent(source, m + 1, end);
  const lists = [];
  let other = '';
  for (const block of indent === null
    ? []
    : yamlBlocks(source, m + 1, end, indent, { comments: false })) {
    const head = source[block.line];
    const flow = /^\s*[\w-]+:\s*\[([^\]]*)\]\s*(#.*)?$/.exec(head);
    const body = source
      .slice(block.line + 1, block.end)
      .filter((line) => !blank(line) && !/^\s*#/.test(line));
    const scalar = /^\s*-\s*(['"]?)([^'"#\s:]+)\1\s*(#.*)?$/;
    if (flow && body.length === 0) {
      lists.push({
        key: block.key,
        items: flow[1].split(',').map(unquote).filter(Boolean),
        lines: [block.line],
      });
    } else if (
      /^\s*[\w-]+:\s*(#.*)?$/.test(head) &&
      body.length > 0 &&
      body.every((line) => scalar.test(line))
    ) {
      const itemLines = [];
      for (let i = block.line + 1; i < block.end; i += 1)
        if (scalar.test(source[i])) itemLines.push(i);
      lists.push({
        key: block.key,
        items: itemLines.map((i) => scalar.exec(source[i])[2]),
        lines: itemLines,
      });
    } else {
      other += `${source.slice(block.line, block.end).join('\n')}\n`;
    }
  }
  return { lists, other };
}

/** A workflow without the jobs of the pack, its entry in shared matrices, and its path filters. */
export function editWorkflow(text, scope, file = 'workflow') {
  const { pack } = scope;
  const source = lines(text);
  const changes = [];
  const notes = [];
  const section = sectionBlocks(source, 'jobs');
  if (!section) return { text, changes, notes, removedJobs: [] };
  const before = parseYamlText(text);
  if (section.blocks.length !== Object.keys(before.jobs ?? {}).length) {
    throw new Error(`${file}: the jobs could not be told apart by their indentation`);
  }
  const owned = [];
  const shared = [];
  const valueIs = (name) => new RegExp(`:\\s*['"]?${escape(name)}['"]?\\s*(#.*)?$`, 'm');
  for (const job of section.blocks) {
    const body = source.slice(job.line, job.end).join('\n');
    const matrix = matrixLists(source, job.line, job.end);
    const inMatrix = (name) =>
      matrix.lists.some((list) => list.items.includes(name)) || valueIs(name).test(matrix.other);
    const mine = scope.has(body) || inMatrix(pack);
    const other = scope.hasOther(body) || scope.others.some(inMatrix);
    if (mine && !other) owned.push(job);
    else if (mine) shared.push({ job, matrix });
  }
  const removedJobs = owned.map((job) => ({
    id: job.key,
    name: before.jobs?.[job.key]?.name ?? job.key,
  }));
  if (owned.length > 0 && owned.length === section.blocks.length) {
    return {
      text: null,
      changes: [`the whole workflow: every job ran only ${pack}`],
      notes,
      removedJobs,
    };
  }
  const out = [...source];
  const ranges = owned.map((job) => [job.start, job.end]);
  const expected = structuredClone(before);
  for (const job of owned) delete expected.jobs[job.key];
  for (const { job, matrix } of shared) {
    for (const list of matrix.lists) {
      if (!list.items.includes(pack)) continue;
      if (list.items.length < 2) {
        notes.push(
          `${file}: job ${job.key} has only ${pack} in matrix.${list.key}; edit it by hand.`,
        );
        continue;
      }
      if (list.lines.length === 1 && list.items.length > 1 && /\[/.test(out[list.lines[0]])) {
        const rest = list.items.filter((item) => item !== pack);
        out[list.lines[0]] = out[list.lines[0]].replace(/\[[^\]]*\]/, `[${rest.join(', ')}]`);
      } else {
        list.lines.forEach((line, n) => {
          if (list.items[n] === pack) ranges.push([line, line + 1]);
        });
      }
      const target = expected.jobs[job.key]?.strategy?.matrix;
      if (Array.isArray(target?.[list.key]))
        target[list.key] = target[list.key].filter((item) => String(item) !== pack);
      changes.push(`${pack} from strategy.matrix.${list.key} of job ${job.key}`);
    }
    if (valueIs(pack).test(matrix.other)) {
      notes.push(
        `${file}: job ${job.key} names ${pack} in a matrix include or exclude; edit it by hand.`,
      );
    }
    notes.push(
      `${file}: job ${job.key} also runs other packs; read what it still says about ${pack}.`,
    );
  }
  const filters = new RegExp(`^\\s*-\\s*['"]?services/${escape(pack)}/`);
  out.forEach((line, i) => {
    if (filters.test(line)) {
      ranges.push([i, i + 1]);
      changes.push(`path filter ${line.trim().replace(/^-\s*/, '')}`);
    }
  });
  for (const trigger of Object.values(expected.on ?? {})) {
    if (Array.isArray(trigger?.paths)) {
      trigger.paths = trigger.paths.filter((path) => !String(path).startsWith(`services/${pack}/`));
    }
  }
  changes.unshift(...removedJobs.map((job) => `job ${job.id} (${job.name})`));
  const result = cutRanges(out, ranges).join('\n');
  if (!isDeepStrictEqual(parseYamlText(result), expected)) {
    throw new Error(`${file}: the edit did not parse back as expected`);
  }
  const removedIds = new Set(owned.map((job) => job.key));
  for (const [id, job] of Object.entries(expected.jobs ?? {})) {
    if ([job?.needs ?? []].flat().some((need) => removedIds.has(need))) {
      throw new Error(`${file}: job ${id} needs a job of ${pack}`);
    }
  }
  return { text: result, changes, notes, removedJobs };
}

/** What a kept compose service needs from another: depends_on, links, extends, volumes_from, network_mode. */
const needsOf = (service) => {
  const depends = service?.depends_on;
  return [
    ...(Array.isArray(depends) ? depends : Object.keys(depends ?? {})),
    ...(service?.links ?? []).map((link) => String(link).split(':')[0]),
    ...(service?.extends?.service ? [service.extends.service] : []),
    ...(service?.volumes_from ?? []).map((from) => String(from).split(':')[0]),
    ...(/^service:(.+)$/.exec(service?.network_mode ?? '')?.slice(1) ?? []),
  ];
};

/** docker-compose without the pack's services, extension, volumes, networks and header paragraphs. */
export function editCompose(text, scope) {
  const source = lines(text);
  const changes = [];
  const section = sectionBlocks(source, 'services');
  if (!section) return { text, changes, notes: [], removedServices: [] };
  const before = parseYamlText(text);
  const owned = section.blocks.filter((block) => scope.services.includes(block.key));
  const removedServices = owned.map((block) => block.key);
  const dangling = Object.entries(before.services ?? {})
    .filter(([name]) => !removedServices.includes(name))
    .flatMap(([name, service]) =>
      needsOf(service)
        .filter((need) => removedServices.includes(need))
        .map((need) => `${name} needs ${need}`),
    );
  if (dangling.length > 0)
    throw new Error(`a kept service needs a removed one (${dangling.join(', ')})`);
  const ranges = owned.map((block) => [block.start, block.end]);
  if (removedServices.length > 0) changes.push(`services ${removedServices.join(', ')}`);
  const removedText = owned
    .map((block) => source.slice(block.line, block.end).join('\n'))
    .join('\n');
  const serviceRanges = [...ranges];
  const kept = (i, more = []) => ![...serviceRanges, ...more].some(([s, e]) => i >= s && i < e);
  const keptText = source.filter((_, i) => kept(i)).join('\n');

  const removedTop = [];
  for (const block of yamlBlocks(source, 0, source.length, 0, { comments: false })) {
    if (!/^x-/.test(block.key) || !scope.ctx.ownsName(block.key.slice(2))) continue;
    const anchor = /&([\w-]+)/.exec(source[block.line])?.[1];
    if (anchor && new RegExp(`\\*${escape(anchor)}(?![\\w-])`).test(keptText)) continue;
    ranges.push([block.line, block.end]);
    removedTop.push(block.key);
    changes.push(block.key);
  }
  const removedNamed = {};
  for (const name of ['volumes', 'networks']) {
    const top = sectionBlocks(source, name);
    if (!top || top.blocks.length === 0) continue;
    const outside = source.filter((_, i) => kept(i, [[top.at, top.end]])).join('\n');
    const unused = top.blocks.filter((block) => {
      const use = new RegExp(`(?<![\\w-])${escape(block.key)}(?![\\w-])`);
      return use.test(removedText) && !use.test(outside);
    });
    if (unused.length === 0) continue;
    removedNamed[name] = unused.map((block) => block.key);
    if (unused.length === top.blocks.length) ranges.push([top.at, top.end]);
    else for (const block of unused) ranges.push([block.start, block.end]);
    changes.push(`${name} ${removedNamed[name].join(', ')}`);
  }

  // The header: comment paragraphs separated by a bare `#`; drop those with only this pack's markers.
  let header = 0;
  while (header < source.length && /^#/.test(source[header])) header += 1;
  const groups = [];
  for (let i = 0; i < header; i += 1) {
    if (/^#\s*$/.test(source[i])) continue;
    if (i === 0 || /^#\s*$/.test(source[i - 1])) groups.push([i, i + 1]);
    else groups[groups.length - 1][1] = i + 1;
  }
  const keptGroups = groups.filter(([s, e]) => !scope.owns(source.slice(s, e).join('\n')));
  const dropped = groups.length - keptGroups.length;
  let body = cutRanges(source, ranges);
  if (dropped > 0) {
    const newHeader = keptGroups.flatMap(([s, e], n) => [
      ...(n > 0 ? ['#'] : []),
      ...source.slice(s, e),
    ]);
    body = [...newHeader, ...body.slice(header)];
    changes.push(`${dropped} header paragraph(s) about ${scope.pack}`);
  }
  const result = body.join('\n');

  const expected = structuredClone(before);
  for (const name of removedServices) delete expected.services[name];
  for (const key of removedTop) delete expected[key];
  for (const [name, names] of Object.entries(removedNamed)) {
    for (const entry of names) delete expected[name][entry];
    if (Object.keys(expected[name]).length === 0) delete expected[name];
  }
  if (!isDeepStrictEqual(parseYamlText(result), expected)) {
    throw new Error('the edit did not parse back as expected');
  }
  return { text: result, changes, notes: [], removedServices };
}

// ---------------------------------------------------------------------------------------------
// Groovy (Jenkinsfile): blocks by braces, outside strings and comments

/** Calls `visit(char, index)` for each character outside strings and comments; stops on a truthy return. */
function scanCode(text, from, visit) {
  for (let i = from; i < text.length; i += 1) {
    const c = text[i];
    if (c === '/' && text[i + 1] === '/') {
      const next = text.indexOf('\n', i);
      if (next < 0) return null;
      i = next;
    } else if (c === '/' && text[i + 1] === '*') {
      const next = text.indexOf('*/', i + 2);
      if (next < 0) return null;
      i = next + 1;
    } else if (c === "'" || c === '"') {
      const quote = text.startsWith(c.repeat(3), i) ? c.repeat(3) : c;
      let j = i + quote.length;
      while (j < text.length && !text.startsWith(quote, j)) j += text[j] === '\\' ? 2 : 1;
      if (j >= text.length) return false;
      i = j + quote.length - 1;
    } else {
      const result = visit(c, i);
      if (result !== undefined) return result;
    }
  }
  return null;
}

/** Index of the brace that closes the one at `open`; -1 when it is not closed. */
export function closingBrace(text, open) {
  let depth = 0;
  const found = scanCode(text, open, (c, i) => {
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
    return undefined;
  });
  return typeof found === 'number' ? found : -1;
}

/** (), [] and {} nest and close, outside strings and comments. */
export function bracketsBalanced(text) {
  const stack = [];
  const pairs = { ')': '(', ']': '[', '}': '{' };
  const result = scanCode(text, 0, (c) => {
    if ('([{'.includes(c)) stack.push(c);
    else if (c in pairs && stack.pop() !== pairs[c]) return false;
    return undefined;
  });
  return result !== false && stack.length === 0;
}

/** Blocks that open with `pattern` on a line ending in `{`: their lines with leading comments. */
function groovyBlocks(source, pattern) {
  const text = source.join('\n');
  const offsets = [];
  let offset = 0;
  for (const line of source) {
    offsets.push(offset);
    offset += line.length + 1;
  }
  const lineOf = (index) => offsets.findLastIndex((start) => start <= index);
  const blocks = [];
  source.forEach((line, i) => {
    const match = pattern.exec(line);
    if (!match || !/\{\s*$/.test(line)) return;
    const close = closingBrace(text, offsets[i] + line.lastIndexOf('{'));
    if (close < 0) return;
    let start = i;
    const indent = /^\s*/.exec(line)[0];
    while (start > 0 && new RegExp(`^${indent}(//|/\\*|\\s\\*)`).test(source[start - 1]))
      start -= 1;
    blocks.push({ name: match[1], line: i, start, end: lineOf(close) + 1 });
  });
  return blocks;
}

/** A single-line statement: not a comment, brackets balanced, nothing opened at its end. */
const singleStatement = (line) => {
  const trimmed = line.trim();
  if (!trimmed || /^(\/\/|\/\*|\*)/.test(trimmed) || /[{(,[+&|?:]$/.test(trimmed)) return false;
  return bracketsBalanced(trimmed);
};

/** The code of one line without its comments; strings are kept whole. */
function codeOnly(line) {
  let code = '';
  for (let i = 0; i < line.length;) {
    const c = line[i];
    if (c === '/' && line[i + 1] === '/') break;
    if (c === '/' && line[i + 1] === '*') {
      const end = line.indexOf('*/', i + 2);
      if (end < 0) break;
      code += ' ';
      i = end + 2;
    } else if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < line.length && line[j] !== c) j += line[j] === '\\' ? 2 : 1;
      code += line.slice(i, j + 1);
      i = j + 1;
    } else {
      code += c;
      i += 1;
    }
  }
  return code.trim();
}

/**
 * The line may be the body of an `if`, `else`, `for` or `while` without braces, so removing it
 * would hand that control statement the next line. It is safe only when the previous code line
 * shows that this one stands alone: it opens or closes a block, ends a statement with `;`, or is a
 * complete statement that is not a control statement. Anything else (a condition followed by a
 * comment, a condition over several lines, a one-line `if`) counts as a possible body.
 */
const bracelessBody = (source, i) => {
  let j = i - 1;
  let previous = '';
  while (j >= 0 && !(previous = codeOnly(source[j]))) j -= 1;
  if (j < 0) return false;
  if (/[{};]$/.test(previous)) return false;
  if (/^(}\s*)?(if|else|for|while)\b/.test(previous)) return true;
  return !singleStatement(previous);
};

const STAGE = /^\s*stage\('([^']+)'\)/;
const DEF = /^def\s+(\w+)\s*\(/;
const PARAMETER = /^\s*\w+\(name:\s*'([A-Za-z_][A-Za-z0-9_]*)'/;

export function editJenkinsfile(
  text,
  scope,
  { removedScripts = [], removedServices = [] } = {},
  file = 'Jenkinsfile',
) {
  let source = lines(text).map((t, i) => ({ t, n: i + 1 }));
  const plain = () => source.map((item) => item.t);
  const changes = [];
  const notes = [];
  const removedTexts = [];
  const remove = (ranges) => {
    for (const [s, e] of ranges) removedTexts.push(plain().slice(s, e).join('\n'));
    source = cutRanges(source, ranges, (item) => item.t);
  };
  const original = lines(text);
  const word = (name) => new RegExp(`(?<![A-Za-z0-9_])${escape(name)}(?![A-Za-z0-9_])`);
  const usedOutside = (all, name, [s, e]) =>
    word(name).test([...all.slice(0, s), ...all.slice(e)].join('\n'));

  // Stages with this pack's markers and no other pack's.
  const stages = groovyBlocks(plain(), STAGE).filter((stage) =>
    scope.owns(plain().slice(stage.line, stage.end).join('\n')),
  );
  remove(stages.map((stage) => [stage.start, stage.end]));
  for (const stage of stages) changes.push(`stage '${stage.name}'`);

  // Functions that the removed code called and nothing calls now, when they carry this pack's markers.
  const originalDefs = new Map(
    groovyBlocks(original, DEF).map((def) => [def.name, [def.start, def.end]]),
  );
  for (;;) {
    const current = plain();
    const unused = groovyBlocks(current, DEF).find(
      (def) =>
        originalDefs.has(def.name) &&
        usedOutside(original, def.name, originalDefs.get(def.name)) &&
        !usedOutside(current, def.name, [def.start, def.end]) &&
        scope.owns(current.slice(def.start, def.end).join('\n')),
    );
    if (!unused) break;
    remove([[unused.start, unused.end]]);
    changes.push(`def ${unused.name}`);
  }

  // Parameters that the removed code read and nothing reads now.
  // A declaration (or its description) is not a read.
  const reads = (all, name) =>
    word(name).test(all.filter((line) => !PARAMETER.test(line)).join('\n'));
  const parameters = [];
  plain().forEach((line, i) => {
    const name = PARAMETER.exec(line)?.[1];
    if (!name || !reads(original, name) || reads(plain(), name)) return;
    if (singleStatement(line)) parameters.push([i, i + 1, name]);
    else
      notes.push(`${file}:${source[i].n} parameter ${name} is no longer read; remove it by hand.`);
  });
  remove(parameters.map(([s, e]) => [s, e]));
  if (parameters.length > 0)
    changes.push(`parameters ${parameters.map(([, , n]) => n).join(', ')}`);

  // Single statements that run a removed script or compose service.
  const runs = (line) =>
    removedScripts.some((script) =>
      new RegExp(`npm run ${escape(script)}(?![\\w:-])`).test(line),
    ) ||
    (/docker[ -]compose/.test(line) &&
      removedServices.some((service) =>
        new RegExp(`(?<![\\w.-])${escape(service)}(?![\\w.-])`).test(line),
      ));
  const statements = [];
  const current = plain();
  current.forEach((line, i) => {
    if (!runs(line)) return;
    if (singleStatement(line) && !scope.hasOther(line) && !bracelessBody(current, i))
      statements.push([i, i + 1]);
    else
      notes.push(
        `${file}:${source[i].n} runs a removed script or service; edit it by hand: ${line.trim()}`,
      );
  });
  remove(statements);
  if (statements.length > 0)
    changes.push(`${statements.length} line(s) that ran a removed script or service`);

  const result = plain().join('\n');
  if (!bracketsBalanced(result)) throw new Error('the edit would leave unbalanced brackets');
  if (changes.length > 0) {
    for (const def of groovyBlocks(plain(), DEF)) {
      if (
        usedOutside(original, def.name, originalDefs.get(def.name) ?? [0, 0]) &&
        !usedOutside(plain(), def.name, [def.start, def.end])
      ) {
        notes.push(`${file}: def ${def.name} is no longer called.`);
      }
    }
    const removed = removedTexts.join('\n');
    for (const [, name] of result.matchAll(/@Field\s+[\w<>]+\s+(\w+)/g)) {
      const assigned = new RegExp(`\\b${name}\\s*=(?!=)`);
      if (assigned.test(removed) && !assigned.test(result.replace(/@Field[^\n]*/g, ''))) {
        notes.push(
          `${file}: ${name} was set only in what was removed; the steps that read it need a new home.`,
        );
      }
    }
    const left = groovyBlocks(plain(), STAGE).filter((stage) =>
      scope.hasOther(plain().slice(stage.line, stage.end).join('\n')),
    );
    if (stages.length > 0 && left.length === 0) {
      notes.push(
        `${file}: no stage runs a pack any more; delete the file or point it at another pack.`,
      );
    }
  }
  return { text: result, changes, notes };
}

// ---------------------------------------------------------------------------------------------
// Line files: .gitleaksignore, NOTICE, .env.example, .actrc

/** The file of a gitleaks fingerprint: `file:rule:line`, or `commit:file:rule:line`. */
const fingerprintFile = (line) => {
  const parts = line.split(':');
  return /^[0-9a-f]{40}$/.test(parts[0]) && parts.length >= 4 ? parts[1] : parts[0];
};

/** Entries for removed files, and their comment paragraph when none is left. */
export function editGitleaksIgnore(text, isRemoved) {
  const source = lines(text);
  const entry = (line) => (/^[^#\s]/.test(line) ? fingerprintFile(line) : null);
  const ranges = [];
  const changes = [];
  for (const [start, end] of paragraphs(source)) {
    const entries = [];
    for (let i = start; i < end; i += 1) if (entry(source[i])) entries.push(i);
    const removed = entries.filter((i) => isRemoved(entry(source[i])));
    if (removed.length === 0) continue;
    for (const i of removed) changes.push(source[i]);
    if (removed.length === entries.length) ranges.push([start, end]);
    else for (const i of removed) ranges.push([i, i + 1]);
  }
  return { text: cutRanges(source, ranges).join('\n'), changes, notes: [] };
}

/** The NOTICE paragraph (and its indented licence text) that covers only files of the pack. */
export function editNotice(text, pack, isRemoved) {
  const source = lines(text);
  const groups = paragraphs(source);
  const ranges = [];
  const changes = [];
  const notes = [];
  for (let n = 0; n < groups.length; n += 1) {
    const [start, end] = groups[n];
    if (/^\s/.test(source[start])) continue;
    const lead = source.slice(start, end).join(' ');
    const files = [...lead.matchAll(/[\w.-]+(?:\/[\w.-]+)+\.\w+/g)].map((m) => m[0]);
    const ours = files.filter((file) => file.startsWith(`services/${pack}/`));
    if (ours.length === 0) continue;
    if (!files.every(isRemoved)) {
      notes.push(
        `NOTICE:${start + 1} names ${ours.join(', ')} together with files that stay; edit that paragraph by hand.`,
      );
      continue;
    }
    let last = n;
    while (last + 1 < groups.length && /^\s/.test(source[groups[last + 1][0]])) last += 1;
    ranges.push([start, groups[last][1]]);
    changes.push(`the notice for ${ours.join(', ')}`);
  }
  return { text: cutRanges(source, ranges).join('\n'), changes, notes };
}

/** The pack's variables, and their paragraph once none is left when its comments carry the pack's markers. */
export function editVariables(text, scope) {
  const source = lines(text);
  const variable = (line) => /^\s*#?\s*(?:--env\s+)?([A-Z][A-Z0-9_]*)=/.exec(line)?.[1] ?? null;
  const ranges = [];
  const changes = [];
  for (const [start, end] of paragraphs(source)) {
    const vars = [];
    for (let i = start; i < end; i += 1) if (variable(source[i])) vars.push(i);
    const owned = vars.filter((i) => scope.variables.includes(variable(source[i])));
    if (owned.length === 0) continue;
    for (const i of owned) changes.push(variable(source[i]));
    const comments = source
      .slice(start, end)
      .filter((_, k) => !vars.includes(start + k))
      .join('\n');
    if (owned.length === vars.length && scope.owns(comments)) ranges.push([start, end]);
    else for (const i of owned) ranges.push([i, i + 1]);
  }
  return { text: cutRanges(source, ranges).join('\n'), changes, notes: [] };
}

// ---------------------------------------------------------------------------------------------
// Required checks

/** The ruleset without the required checks in `names`. */
export function editRuleset(text, names) {
  const ruleset = JSON.parse(text);
  const paths = [];
  (ruleset.rules ?? []).forEach((rule, r) => {
    (rule.parameters?.required_status_checks ?? []).forEach((check, c) => {
      if (names.includes(check.context)) {
        paths.push([['rules', r, 'parameters', 'required_status_checks', c], check.context]);
      }
    });
  });
  let out = text;
  for (const [path] of [...paths].reverse()) out = removeJson(out, path);
  return { text: out, removed: paths.map(([, context]) => context) };
}

/** The expected list of required checks in ruleset.test.mjs without `names`. */
export function editRulesetTest(text, names) {
  let out = text;
  const missing = [];
  for (const name of names) {
    // The name as a single-quoted JS literal: backslashes first, then the quotes.
    const literal = `'${name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
    const after = new RegExp(`,\\s*${escape(literal)}`);
    const before = new RegExp(`${escape(literal)},\\s*`);
    if (after.test(out)) out = out.replace(after, '');
    else if (before.test(out)) out = out.replace(before, '');
    else missing.push(name);
  }
  return { text: out, missing };
}

// ---------------------------------------------------------------------------------------------
// The plan

const read = (root, file) => readFileSync(join(root, file), 'utf8');
const files = (root, dir, pattern) =>
  existsSync(join(root, dir))
    ? readdirSync(join(root, dir))
        .filter((name) => pattern.test(name))
        .map((name) => posix(join(dir, name)))
        .filter((file) => statSync(join(root, file)).isFile())
    : [];

function walk(root, dir, keep) {
  const path = join(root, dir);
  if (!existsSync(path)) return [];
  if (!statSync(path).isDirectory()) return keep(dir) ? [dir] : [];
  return readdirSync(path).flatMap((name) =>
    /^(__tests__|__fixtures__|__live__|node_modules)$/.test(name)
      ? []
      : walk(root, posix(join(dir, name)), keep),
  );
}

/** Variable-shaped names (with an underscore) the core code names: never a pack's. */
export function frameworkVariables(root = REPO_ROOT) {
  const code = (file) => /\.(mjs|js|ts)$/.test(file);
  const sources = [
    'helpers',
    'fixtures',
    'scripts',
    '.claude/hooks',
    'playwright.config.ts',
  ].flatMap((dir) => walk(root, dir, code));
  const names = new Set();
  for (const file of sources) {
    for (const [name] of read(root, file).matchAll(
      /(?<![A-Za-z0-9_$])[A-Z][A-Z0-9]*_[A-Z0-9_]*[A-Z0-9](?![A-Za-z0-9_])/g,
    )) {
      names.add(name);
    }
  }
  return names;
}

/** The model of every pack in the repository at `root`. */
export function repositoryModel(root = REPO_ROOT, packs = servicePacks(root)) {
  const scripts = existsSync(join(root, 'package.json'))
    ? (JSON.parse(read(root, 'package.json')).scripts ?? {})
    : {};
  const composeFile = files(root, '.', /^(docker-)?compose\.ya?ml$/)[0];
  const compose = composeFile ? parseYamlText(read(root, composeFile)) : null;
  const config = existsSync(join(root, 'qa-config.example.json'))
    ? JSON.parse(read(root, 'qa-config.example.json'))
    : null;
  return packModel({ packs, scripts, compose, config, framework: frameworkVariables(root) });
}

/** The names a pack must not have: RESERVED and the namespaces of scripts that belong to no pack. */
export function reservedNames(root = REPO_ROOT, packs = servicePacks(root)) {
  const scripts = existsSync(join(root, 'package.json'))
    ? Object.entries(JSON.parse(read(root, 'package.json')).scripts ?? {})
    : [];
  // A pack's own scripts start its containers or run its files; any other script is the framework's.
  const framework = scripts
    .filter(([name, command]) => {
      const ns = name.split(':')[0];
      return !(
        packs.includes(ns) &&
        (/docker[ -]compose/.test(command) || command.includes(`services/${ns}/`))
      );
    })
    .map(([name]) => name.split(':')[0]);
  return [...new Set([...RESERVED, ...framework])];
}

const git = (root, args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });

/**
 * Decide everything; changes nothing. `{ pack, deletions, edits: Map(file -> text | null), changes,
 * notes, errors, removedChecks }`, where a null text deletes the file.
 */
export function planRemoval({ name, root = REPO_ROOT, reserved }) {
  if (!NAME.test(name ?? '')) throw new Error('Name the pack: --name <pack> (^[a-z][a-z0-9-]*$).');
  const packs = servicePacks(root);
  if (!packs.includes(name)) {
    throw new Error(
      `No service pack "${name}" (services/${name}/service.json); packs: ${packs.join(', ') || 'none'}.`,
    );
  }
  if (packs.length < 2)
    throw new Error(
      `${name} is the only pack; the framework needs one. Scaffold your own pack first.`,
    );
  if ((reserved ?? reservedNames(root, packs)).includes(name)) {
    throw new Error(
      `"${name}" is also a word of the framework (its CI, tools or scripts), so its markers cannot be ` +
        "told from the framework's; remove this pack by hand.",
    );
  }
  const model = repositoryModel(root, packs);
  const scope = scopeFor(name, model);
  const deletions = [
    `services/${name}/`,
    `.claude/skills/${name}-api/`,
    `docs/discovery/${name}-digest.json`,
  ].filter((path) => existsSync(join(root, path)));
  const isRemoved = (file) =>
    deletions.some((path) => (path.endsWith('/') ? file.startsWith(path) : file === path));
  const plan = {
    pack: name,
    ctx: scope.ctx,
    scope,
    deletions,
    edits: new Map(),
    changes: new Map(),
    notes: [],
    errors: [],
    removedChecks: [],
  };
  plan.fileCounts = new Map(deletions.map((path) => [path, walkCount(join(root, path))]));
  const untracked = git(root, ['ls-files', '--others', '--', ...deletions]);
  const lost = exitCodeOf(untracked) === 0 ? untracked.stdout.split('\n').filter(Boolean) : [];
  if (lost.length > 0) {
    plan.notes.push(
      `${lost.length} untracked or ignored file(s) under the deleted paths are deleted too and git cannot ` +
        `restore them: ${lost.slice(0, 5).join(', ')}${lost.length > 5 ? ', ...' : ''}.`,
    );
  }

  const attempt = (file, edit) => {
    if (isHistory(file)) return null;
    const raw = read(root, file);
    const crlf = raw.includes('\r\n');
    try {
      const result = edit(crlf ? raw.replace(/\r\n/g, '\n') : raw);
      if (result.errors) plan.errors.push(...result.errors);
      plan.notes.push(...(result.notes ?? []));
      if (result.changes?.length > 0) {
        plan.changes.set(file, result.changes);
        plan.edits.set(
          file,
          crlf && result.text !== null ? result.text.replace(/\n/g, '\r\n') : result.text,
        );
      }
      return result;
    } catch (error) {
      plan.notes.push(`${file}: not edited (${error.message}); remove what runs ${name} by hand.`);
      return null;
    }
  };

  if (existsSync(join(root, 'package.json')))
    attempt('package.json', (text) => editPackageJson(text, scope));
  if (existsSync(join(root, 'qa-config.example.json')))
    attempt('qa-config.example.json', (text) => editQaConfig(text, scope));
  if (existsSync(join(root, 'qa-config.json')))
    plan.notes.push(...localConfigNotes(read(root, 'qa-config.json'), name));

  let removedServices = [];
  for (const file of files(root, '.', /^(docker-)?compose\.ya?ml$/)) {
    const result = attempt(file, (text) => editCompose(text, scope));
    removedServices = [...removedServices, ...(result?.removedServices ?? [])];
  }

  const workflows = files(root, '.github/workflows', /\.ya?ml$/);
  const removedJobs = [];
  for (const file of workflows) {
    const result = attempt(file, (text) => editWorkflow(text, scope, file));
    removedJobs.push(...(result?.removedJobs ?? []));
  }
  for (const file of files(root, '.', /^Jenkinsfile/)) {
    attempt(file, (text) =>
      editJenkinsfile(text, scope, { removedScripts: scope.scripts, removedServices }, file),
    );
  }

  // A required check goes only when no job of any workflow reports that name any more.
  const remaining = workflows.flatMap((file) => {
    const text = plan.edits.has(file) ? plan.edits.get(file) : read(root, file);
    if (text === null) return [];
    try {
      return Object.entries(parseYamlText(text).jobs ?? {}).map(([id, job]) => job?.name ?? id);
    } catch {
      return [];
    }
  });
  const gone = removedJobs.map((job) => job.name).filter((jobName) => !remaining.includes(jobName));
  for (const file of files(root, '.github/rulesets', /\.json$/)) {
    attempt(file, (text) => {
      const { text: out, removed } = editRuleset(text, gone);
      plan.removedChecks.push(...removed);
      return {
        text: out,
        changes: removed.map((check) => `required check ${check}`),
        notes:
          removed.length > 0
            ? [
                `The live ruleset on GitHub still requires ${removed.join(', ')}, which no job reports ` +
                  'any more, so every pull request waits for it: remove it in Settings > Rules > ' +
                  `Rulesets, or import ${file} again (docs/guides/adopt-the-template.md).`,
              ]
            : [],
      };
    });
  }
  const rulesetTest = 'scripts/__tests__/ruleset.test.mjs';
  if (plan.removedChecks.length > 0 && existsSync(join(root, rulesetTest))) {
    attempt(rulesetTest, (text) => {
      const { text: out, missing } = editRulesetTest(text, plan.removedChecks);
      return {
        text: out,
        changes: plan.removedChecks
          .filter((c) => !missing.includes(c))
          .map((check) => `expected required check ${check}`),
        notes: missing.map(
          (check) => `${rulesetTest}: no expected check ${check} found; update its list by hand.`,
        ),
      };
    });
  }

  if (existsSync(join(root, '.gitleaksignore')))
    attempt('.gitleaksignore', (text) => editGitleaksIgnore(text, isRemoved));
  if (existsSync(join(root, 'NOTICE')))
    attempt('NOTICE', (text) => editNotice(text, name, isRemoved));
  for (const file of ['.env.example', '.actrc'].filter((f) => existsSync(join(root, f)))) {
    attempt(file, (text) => editVariables(text, scope));
  }
  return plan;
}

function walkCount(path) {
  if (!statSync(path).isDirectory()) return 1;
  return readdirSync(path).reduce((n, entry) => n + walkCount(join(path, entry)), 0);
}

export function describeRemoval(plan) {
  const out = [`Remove pack ${plan.pack}`, '', 'Delete:'];
  for (const path of plan.deletions)
    out.push(`  ${path}${path.endsWith('/') ? ` (${plan.fileCounts.get(path)} files)` : ''}`);
  out.push('', 'Edit:');
  for (const [file, changes] of plan.changes) {
    out.push(`  ${file}${plan.edits.get(file) === null ? ' (deleted)' : ''}`);
    for (const change of changes) out.push(`    - ${change}`);
  }
  if (plan.changes.size === 0) out.push('  nothing');
  if (plan.notes.length > 0)
    out.push('', 'Then by hand:', ...plan.notes.map((note) => `  - ${note}`));
  if (plan.errors.length > 0)
    out.push('', 'Cannot remove:', ...plan.errors.map((error) => `  - ${error}`));
  return out.join('\n');
}

/** Delete and write what the plan says; returns the edited files that still exist. */
export function applyRemoval(plan, root = REPO_ROOT) {
  if (plan.errors.length > 0) throw new Error('The plan has errors; nothing removed.');
  for (const path of [...plan.deletions, ...plan.edits.keys()]) {
    if (isHistory(path)) throw new Error(`${path} is a history file; a removal never touches it.`);
  }
  for (const path of plan.deletions) rmSync(join(root, path), { recursive: true, force: true });
  const written = [];
  for (const [file, text] of plan.edits) {
    if (text === null) rmSync(join(root, file), { force: true });
    else {
      writeFileSync(join(root, file), text);
      written.push(file);
    }
  }
  return written;
}

/** Mentions of the pack left in tracked files outside the history: `Map(file -> line numbers)`. */
export function remainingMentions(ctx, root = REPO_ROOT) {
  const run = git(root, [
    'grep',
    '-n',
    '-i',
    '-I',
    '-e',
    ctx.pack,
    '--',
    '.',
    ...HISTORY.map((h) => `:(exclude)${h}`),
  ]);
  const found = new Map();
  for (const line of (run.stdout ?? '').split('\n')) {
    const match = /^(.+?):(\d+):(.*)$/.exec(line);
    if (!match || !ctx.mentions(match[3]) || !existsSync(join(root, match[1]))) continue;
    if (!found.has(match[1])) found.set(match[1], []);
    found.get(match[1]).push(Number(match[2]));
  }
  return found;
}

/**
 * What still fails after a removal, checked now: the findings of `lint-docs` (dead links and paths
 * into the removed files), and the failing tests of each test file that names the pack. Returns
 * `[{ check, findings }]`, empty when nothing fails.
 */
export function checkAfterRemoval(ctx, root = REPO_ROOT) {
  const results = [];
  const lintDocs = join(root, 'scripts', 'lint-docs.mjs');
  if (existsSync(lintDocs)) {
    const run = spawnSync(process.execPath, [lintDocs], { cwd: root, encoding: 'utf8' });
    if (exitCodeOf(run) !== 0) {
      const findings = `${run.stdout ?? ''}${run.stderr ?? ''}`
        .split('\n')
        .filter((line) => line.trim() && !/^lint-docs:/.test(line));
      results.push({
        check: 'npm run lint:docs (its repository test in test:scripts fails with it)',
        findings,
      });
    }
  }
  const tracked = (git(root, ['ls-files']).stdout ?? '').split('\n');
  const tests = tracked.filter(
    (file) =>
      /(^|\/)__tests__\/[^/]+\.test\.mjs$/.test(file) &&
      existsSync(join(root, file)) &&
      ctx.mentions(read(root, file)),
  );
  for (const file of tests) {
    const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', file], {
      cwd: root,
      encoding: 'utf8',
    });
    if (exitCodeOf(run) === 0) continue;
    const failed = [...(run.stdout ?? '').matchAll(/^\s*not ok \d+ - (.+)$/gm)].map((m) => m[1]);
    results.push({
      check: `node --test ${file}`,
      findings: failed.length > 0 ? failed : [`did not run (${describeExit(run)})`],
    });
  }
  return results;
}

function format(edited, root) {
  if (edited.length === 0) return;
  const run = spawnSync(
    process.execPath,
    [
      join(REPO_ROOT, 'node_modules', 'prettier', 'bin', 'prettier.cjs'),
      '--write',
      '--ignore-unknown',
      ...edited,
    ],
    { cwd: root, encoding: 'utf8' },
  );
  if (exitCodeOf(run) !== 0)
    throw new Error(`prettier failed (${describeExit(run)}): ${run.stderr ?? ''}`);
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      name: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      force: { type: 'boolean', default: false },
    },
  });
  const plan = planRemoval({ name: values.name ?? positionals[0] });
  console.log(describeRemoval(plan));
  if (plan.errors.length > 0) {
    console.error('\nNothing removed.');
    process.exit(1);
  }
  if (values['dry-run']) {
    console.log('\nDry run: nothing changed. Run again without --dry-run to remove the pack.');
    return;
  }
  const status = git(REPO_ROOT, ['status', '--porcelain']);
  if (exitCodeOf(status) !== 0) throw new Error(`git status failed: ${status.stderr}`);
  if (status.stdout.trim() && !values.force) {
    throw new Error(
      '\nThe working tree has changes. Commit them first, so that `git restore .` undoes the removal ' +
        'and `git status` shows only it; or pass --force, and then restore only the paths the plan lists.',
    );
  }
  format(applyRemoval(plan), REPO_ROOT);
  const mentions = remainingMentions(plan.ctx);
  console.log(`\nRemoved ${plan.pack}.`);
  if (mentions.size > 0) {
    console.log(
      `\n${plan.pack} is still named in ${mentions.size} file(s) outside the history (${HISTORY.join(', ')}); ` +
        'edit the prose and examples there:',
    );
    for (const [file, numbers] of mentions) console.log(`  ${file}: line ${numbers.join(', ')}`);
  }
  const blockers = checkAfterRemoval(plan.ctx);
  if (blockers.length > 0) {
    console.log('\nThese fail now and block `npm run gates` until they are fixed:');
    for (const { check, findings } of blockers) {
      console.log(`  ${check}`);
      for (const finding of findings) console.log(`    ${finding}`);
    }
  } else {
    console.log('\nNeither lint-docs nor a test file that names the pack fails.');
  }
  console.log(
    '\nNext: do what the plan lists by hand, run `npm run gates`, review `git status` and commit the removal as one change.',
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
