// The `github` tracker: GitHub Issues through the REST API.
//
// Options: repo "owner/name" (required), token_env (default GITHUB_TOKEN), api_url (default
// https://api.github.com). Keys are written `#123`. GitHub issues are open or closed, so the
// categories are open and done; "in-progress" has no GitHub equivalent and is refused.

import { httpClient } from '../../lib/http.mjs';
import { credential } from '../tracker.mjs';

const number = (key) => {
  const match = /^#?(\d+)$/.exec(String(key).trim());
  if (!match) throw new Error(`"${key}" is not a GitHub issue key (#123).`);
  return match[1];
};

async function expectOk(response, what) {
  if (response.ok) return response.json;
  throw new Error(`GitHub ${what}: HTTP ${response.status} ${response.text.slice(0, 200)}`);
}

export function createTracker(
  options = {},
  { env = process.env, fetchImpl = fetch, log = null } = {},
) {
  if (!options.repo)
    throw new Error('The github tracker needs tracker.options.repo ("owner/name").');
  const token = credential(env, options.token_env ?? 'GITHUB_TOKEN', 'The github tracker');
  const common = { baseUrl: options.api_url ?? 'https://api.github.com', fetchImpl, log };
  const headers = { authorization: `Bearer ${token}`, 'x-github-api-version': '2022-11-28' };
  const request = httpClient({
    ...common,
    headers: { ...headers, accept: 'application/vnd.github+json' },
  });
  // The "full" media type adds body_html: what GitHub actually renders.
  const rendered = httpClient({
    ...common,
    headers: { ...headers, accept: 'application/vnd.github.full+json' },
  });
  const repo = `repos/${options.repo}`;

  return {
    name: 'github',

    async getIssue(key) {
      const response = await request('GET', `${repo}/issues/${number(key)}`);
      if (response.status === 404) return null;
      const issue = await expectOk(response, `read #${number(key)}`);
      return {
        key: `#${issue.number}`,
        title: issue.title,
        body: issue.body ?? '',
        status: issue.state,
        category: issue.state === 'closed' ? 'done' : 'open',
        url: issue.html_url,
      };
    },

    async renderedIssueBody(key) {
      return (
        (await expectOk(await rendered('GET', `${repo}/issues/${number(key)}`), 'render'))
          .body_html ?? ''
      );
    },

    async createIssue({ title, body, labels = [] }) {
      const issue = await expectOk(
        await request('POST', `${repo}/issues`, { title, body, labels }),
        'create',
      );
      return { key: `#${issue.number}`, url: issue.html_url };
    },

    async transition(key, target) {
      const wanted = String(target).toLowerCase();
      let change;
      if (['done', 'closed'].includes(wanted))
        change = { state: 'closed', state_reason: 'completed' };
      else if (wanted === 'open') change = { state: 'open' };
      else throw new Error(`GitHub issues are open or closed; "${target}" has no equivalent.`);
      await expectOk(
        await request('PATCH', `${repo}/issues/${number(key)}`, change),
        `move #${number(key)}`,
      );
    },

    async comment(key, body) {
      const comment = await expectOk(
        await request('POST', `${repo}/issues/${number(key)}/comments`, { body }),
        'comment',
      );
      return { id: String(comment.id) };
    },

    async readComment(_key, id) {
      const response = await request('GET', `${repo}/issues/comments/${id}`);
      if (response.status === 404) return null;
      return { body: (await expectOk(response, 'read comment')).body ?? '' };
    },

    async renderedComment(_key, id) {
      return (
        (await expectOk(await rendered('GET', `${repo}/issues/comments/${id}`), 'render comment'))
          .body_html ?? ''
      );
    },
  };
}
