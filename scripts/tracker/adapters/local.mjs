// The `local` tracker: issues in a JSON file. The reference for the tracker contract tests and a
// template for new trackers. Keys are LOCAL-<n>; any status name maps to its category directly.
// A search matches each word as a case-insensitive substring of the title, body or a comment, and
// lists the newest issues first.
//
// Options: dir (default reports/tracker/local).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CATEGORIES, SEARCH_LIMIT, searchWords } from '../tracker.mjs';

const keyNumber = (key) => Number(/\d+$/.exec(key)?.[0] ?? 0);

export function createTracker(options = {}, { root = process.cwd() } = {}) {
  const dir = join(root, options.dir ?? join('reports', 'tracker', 'local'));
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'issues.json');
  const load = () =>
    existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { next: 1, issues: {} };
  const save = (store) => writeFileSync(file, `${JSON.stringify(store, null, 2)}\n`);
  const urlOf = (key) => `file://${file.replace(/\\/g, '/')}#${key}`;

  return {
    name: 'local',

    async getIssue(key) {
      const issue = load().issues[key];
      return issue
        ? {
            key,
            title: issue.title,
            body: issue.body,
            labels: issue.labels ?? [],
            status: issue.status,
            category: issue.category,
            url: urlOf(key),
          }
        : null;
    },

    async searchIssues(text, { open = false, limit = SEARCH_LIMIT.default } = {}) {
      const words = searchWords(text).map((word) => word.toLowerCase());
      return Object.entries(load().issues)
        .filter(([, issue]) => !(open && issue.category === 'done'))
        .filter(([, issue]) => {
          const haystack = [issue.title, issue.body, ...(issue.comments ?? [])]
            .join('\n')
            .toLowerCase();
          return words.every((word) => haystack.includes(word));
        })
        .sort(([a], [b]) => keyNumber(b) - keyNumber(a))
        .slice(0, limit)
        .map(([key, issue]) => ({
          key,
          title: issue.title,
          status: issue.status,
          category: issue.category,
          url: urlOf(key),
        }));
    },

    async createIssue({ title, body, labels }) {
      const store = load();
      const key = `LOCAL-${store.next++}`;
      store.issues[key] = { title, body, labels, status: 'open', category: 'open', comments: [] };
      save(store);
      return { key, url: urlOf(key) };
    },

    async updateIssue(key, { title, labels }) {
      const store = load();
      const issue = store.issues[key];
      if (!issue) throw new Error(`No issue ${key}.`);
      if (title !== undefined) issue.title = title;
      if (labels !== undefined) issue.labels = labels;
      save(store);
    },

    async transition(key, target) {
      const store = load();
      const issue = store.issues[key];
      if (!issue) throw new Error(`No issue ${key}.`);
      if (!CATEGORIES.includes(target))
        throw new Error(`The local tracker moves issues to ${CATEGORIES.join(', ')}.`);
      Object.assign(issue, { status: target, category: target });
      save(store);
    },

    async comment(key, body) {
      const store = load();
      const issue = store.issues[key];
      if (!issue) throw new Error(`No issue ${key}.`);
      issue.comments.push(body);
      save(store);
      return { id: String(issue.comments.length) };
    },

    async readComment(key, id) {
      const body = load().issues[key]?.comments[Number(id) - 1];
      return body === undefined ? null : { body };
    },
  };
}
