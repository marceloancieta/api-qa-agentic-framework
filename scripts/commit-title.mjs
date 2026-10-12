#!/usr/bin/env node
/**
 * Checks a commit subject against the convention of ADR 0008, `type(scope): <BACKLOG-ID>... summary`,
 * with the same parser that builds the changelog. CI runs it on every pull-request title: `main`
 * takes squash merges, so the title becomes the subject of the commit on `main` (docs/ci.md).
 *
 *   node scripts/commit-title.mjs "<title>"
 *
 * Exit codes: 0 the title follows the convention; 1 it does not, and the reason is printed; 2 no
 * title was given.
 */

import { pathToFileURL } from 'node:url';
import { parseCommit } from './changelog.mjs';

/** Why a title does not follow the convention, or null when it does. */
export function titleProblem(title) {
  const commit = parseCommit(String(title ?? ''));
  return commit.conforming ? null : commit.reason;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const title = process.argv.slice(2).join(' ').trim();
  if (!title) {
    console.error('usage: commit-title.mjs "<title>"');
    process.exit(2);
  }
  const problem = titleProblem(title);
  if (problem) {
    console.error(
      `"${title}" does not follow \`type(scope): <BACKLOG-ID> summary\` (ADR 0008): ${problem}.`,
    );
    process.exit(1);
  }
  console.log(`"${title}" follows the commit convention.`);
}
