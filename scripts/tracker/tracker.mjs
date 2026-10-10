// The issue-tracker interface and the verification every write goes through (TM-05).
//
// An adapter is a plain object:
//   name
//   getIssue(key)                    { key, title, body, status, category, url } or null when absent
//   createIssue({ title, body, labels })   { key, url }
//   transition(key, target)          moves the issue; target is a status name or a category
//   comment(key, body)               { id }
//   readComment(key, id)             { body }
//   renderedIssueBody(key), renderedComment(key, id)   optional: the HTML the tracker shows
// `category` is the tracker-neutral state: open, in-progress or done.
//
// `verifiedTracker(adapter)` wraps an adapter so that every write is read back (L-04): text is made
// safe for Markdown before it is sent, compared after, and when the tracker can render, the
// rendered HTML must still show every `<placeholder>` of the source (L-47). Credentials are read by
// adapters from environment variables named in qa-config, never from the command line (L-43).

import { codeSpanPlaceholders, htmlToText, lostPlaceholders, normalizeText } from '../lib/text.mjs';

export const CATEGORIES = ['open', 'in-progress', 'done'];
const REQUIRED = ['getIssue', 'createIssue', 'transition', 'comment', 'readComment'];

export function trackerProblems(adapter) {
  if (!adapter || typeof adapter !== 'object') return ['a tracker adapter must be an object'];
  const problems = [];
  if (typeof adapter.name !== 'string' || !adapter.name) problems.push('name is missing');
  for (const method of REQUIRED) {
    if (typeof adapter[method] !== 'function') problems.push(`${method}() is missing`);
  }
  return problems;
}

export { credential } from '../lib/env.mjs';

function sameText(what, sent, readBack) {
  if (normalizeText(sent) !== normalizeText(readBack)) {
    throw new Error(
      `Read-back of ${what} differs from what was sent.\n--- sent\n${sent}\n--- read back\n${readBack}`,
    );
  }
}

function renderedKeepsPlaceholders(what, source, html) {
  const lost = lostPlaceholders(source, htmlToText(html));
  if (lost.length > 0)
    throw new Error(`The tracker's rendering of ${what} dropped ${lost.join(', ')}.`);
}

export function verifiedTracker(adapter, log = null) {
  const problems = trackerProblems(adapter);
  if (problems.length > 0)
    throw new Error(`Tracker adapter is incomplete: ${problems.join('; ')}.`);
  return {
    name: adapter.name,
    getIssue: (key) => adapter.getIssue(key),

    async createIssue({ title, body = '', labels = [] }) {
      const safeBody = codeSpanPlaceholders(body);
      const created = await adapter.createIssue({ title, body: safeBody, labels });
      const back = await adapter.getIssue(created.key);
      if (!back)
        throw new Error(`Read-back: issue ${created.key} was reported created but cannot be read.`);
      sameText(`the title of ${created.key}`, title, back.title);
      sameText(`the body of ${created.key}`, safeBody, back.body);
      if (adapter.renderedIssueBody) {
        renderedKeepsPlaceholders(
          `issue ${created.key}`,
          safeBody,
          await adapter.renderedIssueBody(created.key),
        );
      }
      log?.info('issue created', { key: created.key, url: created.url });
      return created;
    },

    async comment(key, body) {
      const safeBody = codeSpanPlaceholders(body);
      const { id } = await adapter.comment(key, safeBody);
      const back = await adapter.readComment(key, id);
      sameText(`comment ${id} on ${key}`, safeBody, back?.body);
      if (adapter.renderedComment) {
        renderedKeepsPlaceholders(
          `comment ${id} on ${key}`,
          safeBody,
          await adapter.renderedComment(key, id),
        );
      }
      log?.info('comment added', { key, comment: id });
      return { id };
    },

    async transition(key, target) {
      await adapter.transition(key, target);
      const back = await adapter.getIssue(key);
      const reached =
        back &&
        (back.category === target ||
          String(back.status).toLowerCase() === String(target).toLowerCase());
      if (!reached) {
        throw new Error(
          `Read-back: ${key} is "${back?.status}" (${back?.category}) after moving it to "${target}".`,
        );
      }
      log?.info('issue moved', { key, status: back.status, category: back.category });
      return { status: back.status, category: back.category };
    },
  };
}
