#!/usr/bin/env node
/**
 * The configured issue tracker from the command line (qa-config tracker.provider). Every write is
 * read back; bodies come from files so long text never passes through a shell. There is no token
 * flag: credentials are read from the environment variables the configuration names (L-43).
 *
 *   node scripts/tracker/cli.mjs get <key>
 *   node scripts/tracker/cli.mjs search <text>... [--open] [--limit <n>]
 *   node scripts/tracker/cli.mjs create --title <text> --body-file <file> [--label <name>]...
 *   node scripts/tracker/cli.mjs comment <key> --body-file <file>
 *   node scripts/tracker/cli.mjs move <key> <status or category>
 */

import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { loadLocalEnv } from '../lib/env.mjs';
import { createLogger } from '../lib/log.mjs';
import { loadTracker, trackerConfig } from './index.mjs';

const USAGE =
  'Usage: tracker get <key> | search <text> [--open] [--limit <n>] | create --title <t> --body-file <f> [--label <l>] | comment <key> --body-file <f> | move <key> <status>';

const issueLine = (issue) => ({
  key: issue.key,
  status: issue.status,
  category: issue.category,
  url: issue.url,
});

export async function runCommand(argv, { tracker, log }) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      title: { type: 'string' },
      'body-file': { type: 'string' },
      label: { type: 'string', multiple: true },
      open: { type: 'boolean' },
      limit: { type: 'string' },
    },
  });
  const [command, key, target] = positionals;
  const body = () => {
    if (!values['body-file']) throw new Error('--body-file is required.');
    return readFileSync(values['body-file'], 'utf8');
  };
  switch (command) {
    case 'get': {
      const issue = await tracker.getIssue(key);
      if (!issue) throw new Error(`No issue ${key}.`);
      log.info('issue', issueLine(issue));
      return issue;
    }
    case 'search': {
      const text = positionals.slice(1).join(' ');
      if (!text.trim()) throw new Error('search needs the text to look for.');
      if (values.limit !== undefined && !/^\d+$/.test(values.limit))
        throw new Error('--limit must be a whole number.');
      const found = await tracker.searchIssues(text, {
        open: values.open === true,
        ...(values.limit === undefined ? {} : { limit: Number(values.limit) }),
      });
      for (const issue of found) log.info('issue', { ...issueLine(issue), title: issue.title });
      log.info('search', { text, open: values.open === true, found: found.length });
      return found;
    }
    case 'create':
      if (!values.title) throw new Error('--title is required.');
      return tracker.createIssue({ title: values.title, body: body(), labels: values.label ?? [] });
    case 'comment':
      return tracker.comment(key, body());
    case 'move':
      if (!target) throw new Error('move needs a target status or category.');
      return tracker.transition(key, target);
    default:
      throw new Error(USAGE);
  }
}

async function main() {
  loadLocalEnv();
  const log = createLogger('tracker');
  const tracker = await loadTracker(trackerConfig(), { log });
  if (!tracker) {
    log.error('no tracker configured (qa-config tracker.provider is none)');
    process.exit(2);
  }
  await runCommand(process.argv.slice(2), { tracker, log });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
