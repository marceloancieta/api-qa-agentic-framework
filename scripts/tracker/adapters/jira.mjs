// The `jira` tracker: Jira through REST API v2, which takes plain-text descriptions and comments and
// returns their rendered HTML on request.
//
// Config: tracker.base_url, and options project (required), issue_type (default Task), user_env
// (default JIRA_USER), token_env (default JIRA_TOKEN). The user and token form a basic credential,
// read from the environment only. Statuses map to categories through Jira's own status category.

import { httpClient } from '../../lib/http.mjs';
import { credential } from '../tracker.mjs';

const CATEGORY = { new: 'open', indeterminate: 'in-progress', done: 'done' };
const API = 'rest/api/2';

async function expectOk(response, what) {
  if (response.ok) return response.json;
  throw new Error(`Jira ${what}: HTTP ${response.status} ${response.text.slice(0, 200)}`);
}

export function createTracker(
  options = {},
  { env = process.env, fetchImpl = fetch, log = null, baseUrl } = {},
) {
  if (!baseUrl) throw new Error('The jira tracker needs tracker.base_url.');
  if (!options.project) throw new Error('The jira tracker needs tracker.options.project.');
  const user = credential(env, options.user_env ?? 'JIRA_USER', 'The jira tracker');
  const token = credential(env, options.token_env ?? 'JIRA_TOKEN', 'The jira tracker');
  const request = httpClient({
    baseUrl,
    fetchImpl,
    log,
    headers: { authorization: `Basic ${Buffer.from(`${user}:${token}`).toString('base64')}` },
  });
  const site = baseUrl.replace(/\/+$/, '');
  const read = (key) =>
    request(
      'GET',
      `${API}/issue/${encodeURIComponent(key)}?fields=summary,description,status&expand=renderedFields`,
    );

  return {
    name: 'jira',

    async getIssue(key) {
      const response = await read(key);
      if (response.status === 404) return null;
      const issue = await expectOk(response, `read ${key}`);
      const status = issue.fields?.status ?? {};
      return {
        key: issue.key,
        title: issue.fields?.summary ?? '',
        body: issue.fields?.description ?? '',
        status: status.name ?? null,
        category: CATEGORY[status.statusCategory?.key] ?? 'open',
        url: `${site}/browse/${issue.key}`,
      };
    },

    async renderedIssueBody(key) {
      return (await expectOk(await read(key), `render ${key}`)).renderedFields?.description ?? '';
    },

    async createIssue({ title, body, labels = [] }) {
      const fields = {
        project: { key: options.project },
        issuetype: { name: options.issue_type ?? 'Task' },
        summary: title,
        description: body,
        labels,
      };
      const created = await expectOk(await request('POST', `${API}/issue`, { fields }), 'create');
      return { key: created.key, url: `${site}/browse/${created.key}` };
    },

    async transition(key, target) {
      const path = `${API}/issue/${encodeURIComponent(key)}/transitions`;
      const { transitions = [] } = await expectOk(
        await request('GET', path),
        `list transitions of ${key}`,
      );
      const wanted = String(target).toLowerCase();
      const match =
        transitions.find(
          (t) => t.to?.name?.toLowerCase() === wanted || t.name?.toLowerCase() === wanted,
        ) ?? transitions.find((t) => CATEGORY[t.to?.statusCategory?.key] === wanted);
      if (!match) {
        const names = transitions.map((t) => t.to?.name ?? t.name).join(', ') || 'none';
        throw new Error(
          `${key} has no transition to "${target}" from its current status (available: ${names}).`,
        );
      }
      await expectOk(await request('POST', path, { transition: { id: match.id } }), `move ${key}`);
    },

    async comment(key, body) {
      const comment = await expectOk(
        await request('POST', `${API}/issue/${encodeURIComponent(key)}/comment`, { body }),
        'comment',
      );
      return { id: String(comment.id) };
    },

    async readComment(key, id) {
      const response = await request(
        'GET',
        `${API}/issue/${encodeURIComponent(key)}/comment/${id}`,
      );
      if (response.status === 404) return null;
      return { body: (await expectOk(response, 'read comment')).body ?? '' };
    },

    async renderedComment(key, id) {
      const path = `${API}/issue/${encodeURIComponent(key)}/comment/${id}?expand=renderedBody`;
      return (await expectOk(await request('GET', path), 'render comment')).renderedBody ?? '';
    },
  };
}
