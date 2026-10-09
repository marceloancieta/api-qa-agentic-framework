#!/usr/bin/env node
/**
 * Scan for terms from a LOCAL, never-committed denylist: words a contributor must never publish,
 * such as client names, internal hosts or people's names from their private work.
 *
 * The denylist lives in `.git/info/denylist` - inside the git directory, so it cannot be committed by
 * accident (committing it would publish exactly what it protects). One case-insensitive JavaScript
 * regex per line; `#` starts a comment. With no denylist file the scan passes with a notice: a fresh
 * clone has nothing to protect.
 *
 * Modes:
 *   --staged          the staged content and paths (pre-commit)
 *   --message <file>  a commit message (commit-msg)
 *   --tracked         every tracked file in the working tree
 *   --history         every patch and message in the history of all refs (release gate)
 *   --self-test       verify the matcher on synthetic input
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

function git(args, options = {}) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, ...options });
}

export function parseDenylist(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((pattern) => ({ pattern, re: new RegExp(pattern, 'i') }));
}

/** Hits as { where, line, pattern } - the matched text itself is never printed in full context. */
export function scanText(text, where, terms) {
  const hits = [];
  text.split(/\r?\n/).forEach((content, index) => {
    for (const { pattern, re } of terms) {
      if (re.test(content)) hits.push({ where, line: index + 1, pattern });
    }
  });
  return hits;
}

function loadDenylist() {
  const path = git(['rev-parse', '--git-path', 'info/denylist']).trim();
  return existsSync(path) ? parseDenylist(readFileSync(path, 'utf8')) : null;
}

function stagedHits(terms) {
  const files = git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'])
    .split('\0')
    .filter(Boolean);
  const hits = files.flatMap((file) => scanText(file, `path ${file}`, terms));
  for (const file of files) {
    const blob = git(['show', `:${file}`], { encoding: 'buffer' });
    if (blob.includes(0)) continue; // binary
    hits.push(...scanText(blob.toString('utf8'), file, terms));
  }
  return hits;
}

function trackedHits(terms) {
  const files = git(['ls-files', '-z']).split('\0').filter(Boolean);
  const hits = files.flatMap((file) => scanText(file, `path ${file}`, terms));
  for (const file of files) {
    if (!existsSync(file)) continue;
    const buffer = readFileSync(file);
    if (buffer.includes(0)) continue;
    hits.push(...scanText(buffer.toString('utf8'), file, terms));
  }
  return hits;
}

function historyHits(terms) {
  const hasCommits = (() => {
    try {
      git(['rev-parse', '--verify', '-q', 'HEAD'], { stdio: ['ignore', 'pipe', 'ignore'] });
      return true;
    } catch {
      return false;
    }
  })();
  if (!hasCommits) return [];
  const log = git(['log', '--all', '-p', '--format=commit %H%n%an <%ae>%n%B', '--no-color']);
  return scanText(log, 'history', terms);
}

function selfTest() {
  const terms = parseDenylist('# comment\n\nacme\n\\bxyz\\b\n');
  const cases = [
    ['ACME Corp ships', 1],
    ['the xyz service', 1],
    ['xyzzy is fine', 0],
    ['nothing here', 0],
    ['acme and xyz', 2],
  ];
  let failed = 0;
  for (const [text, expected] of cases) {
    const got = scanText(text, 't', terms).length;
    if (got !== expected) {
      failed += 1;
      console.error(`FAIL: "${text}" -> ${got} hit(s), expected ${expected}`);
    }
  }
  if (terms.length !== 2) {
    failed += 1;
    console.error(`FAIL: parsed ${terms.length} terms, expected 2`);
  }
  console.log(
    failed ? `scan-denylist self-test: ${failed} failure(s)` : 'scan-denylist self-test: OK',
  );
  process.exit(failed ? 1 : 0);
}

function main() {
  const [mode, arg] = process.argv.slice(2);
  if (mode === '--self-test') selfTest();

  const terms = loadDenylist();
  if (!terms) {
    console.log('scan-denylist: no .git/info/denylist - nothing to check.');
    return;
  }

  let hits;
  if (mode === '--staged') hits = stagedHits(terms);
  else if (mode === '--message')
    hits = scanText(readFileSync(arg, 'utf8'), 'commit message', terms);
  else if (mode === '--tracked') hits = trackedHits(terms);
  else if (mode === '--history') hits = historyHits(terms);
  else {
    console.error(
      'usage: scan-denylist.mjs --staged | --message <file> | --tracked | --history | --self-test',
    );
    process.exit(2);
  }

  if (hits.length === 0) {
    console.log(`scan-denylist: clean (${terms.length} terms, ${mode.slice(2)}).`);
    return;
  }
  console.error(`scan-denylist: ${hits.length} denylisted term hit(s):`);
  for (const hit of hits.slice(0, 50))
    console.error(`  ${hit.where}:${hit.line}  /${hit.pattern}/`);
  if (hits.length > 50) console.error(`  ... and ${hits.length - 50} more`);
  process.exit(1);
}

main();
