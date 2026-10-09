#!/usr/bin/env node
/**
 * Re-reads statements that depend on another system's state (L-11, L-26). Text like "until <KEY>
 * ships", "waiting on <KEY>", a workaround citing <KEY>, or a knownGap arm for <KEY> is true only
 * while that issue is open; once it is done the statement is stale, and the code it
 * excuses may be removable. This tool finds such statements next to their key and asks the
 * configured tracker for each key's state.
 *
 * Rules:
 *   stale-claim          the cited issue is done: re-check, then remove the claim or the workaround
 *   unknown-key          the cited key does not exist in the tracker
 *   workaround-no-exit   a workaround cites no issue and does not say it is permanent (L-26)
 *
 * Opt-in: with tracker.provider "none" or no tracker.key_pattern it reports that and exits 0.
 *
 *   node scripts/cited-status.mjs [--root dir] [--json]
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT } from './lib/cli.mjs';
import { finding, report } from './lib/lint.mjs';
import { createLogger } from './lib/log.mjs';
import { loadTracker, trackerConfig } from './tracker/index.mjs';

const SCANNED = ['docs', 'services', 'helpers', 'fixtures', 'scripts', 'README.md'];
const SKIPPED_DIRS = new Set(['node_modules', '__fixtures__', 'generated', 'discovery', 'reports']);
const EXTENSIONS = new Set(['.md', '.ts', '.mjs', '.js', '.json', '.yaml', '.yml']);

const WAITING = /\b(until|waiting (?:on|for)|blocked (?:by|on)|depends on|pending)\b/i;
const WORKAROUND = /\bwork-?around\b/i;
const KNOWN_GAP = /\bknownGap\(\s*['"`]([^'"`]+)['"`]/;
const PERMANENT = /\bpermanent(ly)?\b|\bwon'?t fix\b|\bby design\b/i;

function filesUnder(root, entry) {
  const path = join(root, entry);
  let stats;
  try {
    stats = statSync(path);
  } catch {
    return [];
  }
  if (stats.isFile()) return EXTENSIONS.has(extname(path)) ? [path] : [];
  return readdirSync(path).flatMap((name) =>
    SKIPPED_DIRS.has(name) ? [] : filesUnder(path, name),
  );
}

/**
 * Statements whose truth depends on an issue's state, plus workarounds that name no exit.
 * @returns {{ claims: {file,line,key,kind,text}[], orphans: {file,line,text}[] }}
 */
export function findClaims(root, keyPattern) {
  const key = new RegExp(`(?<![\\w-])(${keyPattern})(?![\\w-])`, 'g');
  const claims = [];
  const orphans = [];
  for (const path of SCANNED.flatMap((entry) => filesUnder(root, entry))) {
    const file = relative(root, path).replace(/\\/g, '/');
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .forEach((text, index) => {
        const line = index + 1;
        const armed = KNOWN_GAP.exec(text);
        // Only a real key counts: documentation examples use placeholders.
        const gap = armed && new RegExp(`^(?:${keyPattern})$`).test(armed[1]) ? armed : null;
        if (gap) claims.push({ file, line, key: gap[1], kind: 'known-gap', text: text.trim() });
        const kind = WORKAROUND.test(text) ? 'workaround' : WAITING.test(text) ? 'waiting' : null;
        if (!kind) return;
        const keys = [...text.matchAll(key)]
          .map((match) => match[1])
          .filter((k) => !gap || k !== gap[1]);
        for (const cited of new Set(keys))
          claims.push({ file, line, key: cited, kind, text: text.trim() });
        if (kind === 'workaround' && keys.length === 0 && !gap && !PERMANENT.test(text)) {
          orphans.push({ file, line, text: text.trim() });
        }
      });
  }
  return { claims, orphans };
}

/** Findings for the claims given each cited issue's state (null when the key does not exist). */
export function citedFindings(claims, orphans, issues) {
  const findings = [];
  for (const claim of claims) {
    const issue = issues.get(claim.key);
    if (issue === null) {
      findings.push(
        finding(
          'unknown-key',
          claim.file,
          claim.line,
          `${claim.key} does not exist in the tracker`,
        ),
      );
    } else if (issue?.category === 'done') {
      findings.push(
        finding(
          'stale-claim',
          claim.file,
          claim.line,
          `${claim.key} is ${issue.status} (done): re-check this ${claim.kind} and remove it if it no longer applies`,
        ),
      );
    }
  }
  for (const orphan of orphans) {
    findings.push(
      finding(
        'workaround-no-exit',
        orphan.file,
        orphan.line,
        'workaround without an issue key or a statement that it is permanent',
      ),
    );
  }
  return findings;
}

export async function citedStatus({ root = REPO_ROOT, config, tracker, log }) {
  if (!config.key_pattern || (config.provider ?? 'none') === 'none') {
    log.info(
      'cited-status is opt-in: set tracker.provider and tracker.key_pattern in qa-config to enable it',
    );
    return { enabled: false, findings: [] };
  }
  const { claims, orphans } = findClaims(root, config.key_pattern);
  const issues = new Map();
  for (const key of new Set(claims.map((c) => c.key))) issues.set(key, await tracker.getIssue(key));
  log.info('claims read', {
    claims: claims.length,
    keys: issues.size,
    workaroundsWithoutExit: orphans.length,
  });
  return { enabled: true, claims, findings: citedFindings(claims, orphans, issues) };
}

async function main() {
  const { values } = parseArgs({
    options: { root: { type: 'string' }, json: { type: 'boolean', default: false } },
  });
  const root = values.root ?? REPO_ROOT;
  const log = createLogger('cited-status');
  const config = trackerConfig(root);
  const tracker = await loadTracker(config, { log, root });
  const outcome = await citedStatus({ root, config, tracker, log });
  if (values.json) {
    console.log(JSON.stringify(outcome, null, 2));
    process.exit(outcome.findings.length === 0 ? 0 : 1);
  }
  if (outcome.enabled) process.exit(report('cited-status', outcome.findings));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(2);
  });
}
