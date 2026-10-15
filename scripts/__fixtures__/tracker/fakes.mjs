// In-memory stand-ins for the GitHub and Jira REST endpoints the tracker adapters call, shaped after
// their public documentation. They are `fetch` replacements: no network, no server. They prove the
// adapters speak the documented shapes; a first real use still has to confirm the live API agrees.

// Like a Markdown renderer with HTML sanitizing: a bare <tag> disappears, a code span survives
// escaped. That is the behaviour L-47 is about.
export function renderMarkdown(text) {
  return String(text)
    .split(/(`[^`]*`)/)
    .map((part) =>
      part.startsWith('`')
        ? `<code>${part.slice(1, -1).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code>`
        : part.replace(/<[^>]*>/g, ''),
    )
    .join('');
}

// Whole-word, case-insensitive matching, the way a search index tokenizes text.
const tokens = (...texts) =>
  new Set(
    texts
      .join(' ')
      .toLowerCase()
      .split(/[^\p{L}\p{N}_]+/u),
  );
const matchesAll = (words, ...texts) => {
  const have = tokens(...texts);
  return words.every((word) =>
    word
      .toLowerCase()
      .split(/[^\p{L}\p{N}_]+/u)
      .filter(Boolean)
      .every((part) => have.has(part)),
  );
};

const json = (status, body) =>
  // A 204 response must carry no body at all, not even an empty one.
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

export function fakeGitHub({
  repo = 'acme/api',
  token = 'gh-test-token',
  render = renderMarkdown,
} = {}) {
  const issues = new Map();
  const comments = new Map();
  let next = 1;
  let nextComment = 100;
  const calls = [];
  const queries = [];
  // Requests send label names; GitHub stores and returns label objects.
  const labelObjects = (names = []) => names.map((name) => ({ name, color: 'ededed' }));
  // GET /search/issues: quoted terms are text, unquoted `name:value` terms are qualifiers, and
  // several `repo:` qualifiers widen the search to each of them.
  const search = (q, perPage) => {
    queries.push(q);
    const words = [];
    const repos = [];
    const is = [];
    for (const [, quoted, bare] of q.matchAll(/"([^"]*)"|(\S+)/g)) {
      const qualifier = bare && /^(repo|is):(.+)$/.exec(bare);
      if (!qualifier) words.push(quoted ?? bare);
      else (qualifier[1] === 'repo' ? repos : is).push(qualifier[2]);
    }
    if (repos.length > 0 && !repos.includes(repo))
      return json(200, { total_count: 0, incomplete_results: false, items: [] });
    const items = [...issues.values()]
      .filter((issue) => !is.includes('open') || issue.state === 'open')
      .filter((issue) => !is.includes('closed') || issue.state === 'closed')
      .filter((issue) =>
        matchesAll(
          words,
          issue.title,
          issue.body ?? '',
          ...[...comments.values()]
            .filter((comment) => comment.issue === issue.number)
            .map((comment) => comment.body),
        ),
      )
      .sort((a, b) => b.number - a.number);
    return json(200, {
      total_count: items.length,
      incomplete_results: false,
      items: items.slice(0, perPage),
    });
  };
  const fetchImpl = async (url, init) => {
    const { pathname, searchParams } = new URL(url);
    const method = init.method;
    calls.push(`${method} ${pathname}`);
    if (init.headers.authorization !== `Bearer ${token}`)
      return json(401, { message: 'Bad credentials' });
    const full = init.headers.accept === 'application/vnd.github.full+json';
    const body = init.body ? JSON.parse(init.body) : null;
    const base = `/repos/${repo}/issues`;
    let match;
    if (method === 'GET' && pathname === '/search/issues')
      return search(searchParams.get('q') ?? '', Number(searchParams.get('per_page') ?? 30));
    if (method === 'POST' && pathname === base) {
      const issue = {
        number: next++,
        title: body.title,
        body: body.body,
        state: 'open',
        labels: labelObjects(body.labels),
      };
      issue.html_url = `https://github.example/${repo}/issues/${issue.number}`;
      issues.set(String(issue.number), issue);
      return json(201, issue);
    }
    if ((match = new RegExp(`^${base}/(\\d+)$`).exec(pathname))) {
      const issue = issues.get(match[1]);
      if (!issue) return json(404, { message: 'Not Found' });
      // A PATCH replaces each field it names; `labels` replaces the whole set.
      if (method === 'PATCH')
        Object.assign(issue, body, body.labels ? { labels: labelObjects(body.labels) } : {});
      return json(200, full ? { ...issue, body_html: render(issue.body) } : issue);
    }
    if ((match = new RegExp(`^${base}/(\\d+)/comments$`).exec(pathname)) && method === 'POST') {
      if (!issues.has(match[1])) return json(404, { message: 'Not Found' });
      const comment = { id: nextComment++, body: body.body, issue: Number(match[1]) };
      comments.set(String(comment.id), comment);
      return json(201, comment);
    }
    if ((match = new RegExp(`^${base}/comments/(\\d+)$`).exec(pathname))) {
      const comment = comments.get(match[1]);
      if (!comment) return json(404, { message: 'Not Found' });
      return json(200, full ? { ...comment, body_html: render(comment.body) } : comment);
    }
    return json(404, { message: `no route ${method} ${pathname}` });
  };
  return { fetchImpl, calls, queries, env: { GITHUB_TOKEN: token }, options: { repo } };
}

const STATUSES = {
  'To Do': { name: 'To Do', statusCategory: { key: 'new' } },
  'In Progress': { name: 'In Progress', statusCategory: { key: 'indeterminate' } },
  Done: { name: 'Done', statusCategory: { key: 'done' } },
};

export function fakeJira({
  project = 'QA',
  user = 'qa@example.com',
  token = 'jira-test-token',
  render = renderMarkdown,
  // Data Center has only the classic /search; Cloud has only the enhanced /search/jql.
  legacySearch = false,
} = {}) {
  const issues = new Map();
  let next = 1;
  let nextComment = 500;
  let clock = 0;
  const calls = [];
  const queries = [];
  const expected = `Basic ${Buffer.from(`${user}:${token}`).toString('base64')}`;
  // The JQL subset the fake understands; anything else is a JQL error, as Jira answers it.
  const JQL =
    /^project = "((?:[^"\\]|\\.)*)" AND text ~ "((?:[^"\\]|\\.)*)"( AND statusCategory != Done)? ORDER BY updated DESC$/;
  const unescape = (value) => value.replace(/\\(.)/g, '$1');
  const search = (jql, maxResults) => {
    queries.push(jql);
    const parsed = JQL.exec(jql);
    if (!parsed) return json(400, { errorMessages: [`Error in the JQL Query: ${jql}`] });
    const [, wantedProject, text, openOnly] = parsed;
    if (unescape(wantedProject) !== project)
      return json(400, { errorMessages: [`The value '${wantedProject}' does not exist.`] });
    const reserved = /[+\-&|!(){}[\]^~*?:\\/]/.exec(unescape(text));
    if (reserved)
      return json(400, { errorMessages: [`'${reserved[0]}' is a reserved JQL character.`] });
    const found = [...issues.values()]
      .filter((issue) => !openOnly || issue.status.statusCategory.key !== 'done')
      .filter((issue) =>
        matchesAll(
          unescape(text).split(/\s+/).filter(Boolean),
          issue.summary,
          issue.description ?? '',
          ...issue.comments.map((comment) => comment.body),
        ),
      )
      .sort((a, b) => b.updated - a.updated)
      .slice(0, maxResults)
      .map((issue) => ({
        key: issue.key,
        fields: { summary: issue.summary, status: issue.status },
      }));
    return json(200, { issues: found, isLast: true });
  };
  const fetchImpl = async (url, init) => {
    const { pathname, searchParams } = new URL(url);
    const method = init.method;
    calls.push(`${method} ${pathname}`);
    if (init.headers.authorization !== expected)
      return json(401, { errorMessages: ['unauthorized'] });
    const body = init.body ? JSON.parse(init.body) : null;
    let match;
    const searchPath = legacySearch ? '/rest/api/2/search' : '/rest/api/2/search/jql';
    if (method === 'GET' && pathname === searchPath)
      return search(searchParams.get('jql') ?? '', Number(searchParams.get('maxResults') ?? 50));
    if (method === 'POST' && pathname === '/rest/api/2/issue') {
      if (body.fields.project.key !== project)
        return json(400, { errors: { project: 'unknown project' } });
      const key = `${project}-${next++}`;
      issues.set(key, {
        key,
        summary: body.fields.summary,
        description: body.fields.description,
        labels: body.fields.labels ?? [],
        status: STATUSES['To Do'],
        comments: [],
        updated: ++clock,
      });
      return json(201, { id: String(next), key });
    }
    if ((match = /^\/rest\/api\/2\/issue\/([^/]+)$/.exec(pathname))) {
      const issue = issues.get(decodeURIComponent(match[1]));
      if (!issue) return json(404, { errorMessages: ['Issue does not exist'] });
      // PUT sets the fields it names (`labels` replaces the whole set) and answers 204.
      if (method === 'PUT') {
        const unknown = Object.keys(body.fields).filter((f) => !['summary', 'labels'].includes(f));
        if (unknown.length > 0)
          return json(400, {
            errors: Object.fromEntries(unknown.map((f) => [f, 'not on screen'])),
          });
        if (body.fields.summary !== undefined) issue.summary = body.fields.summary;
        if (body.fields.labels !== undefined) issue.labels = body.fields.labels;
        issue.updated = ++clock;
        return json(204);
      }
      const fields = {
        summary: issue.summary,
        description: issue.description,
        labels: issue.labels,
        status: issue.status,
      };
      const rendered = (searchParams.get('expand') ?? '').includes('renderedFields');
      return json(200, {
        key: issue.key,
        fields,
        ...(rendered ? { renderedFields: { description: render(issue.description) } } : {}),
      });
    }
    if ((match = /^\/rest\/api\/2\/issue\/([^/]+)\/transitions$/.exec(pathname))) {
      const issue = issues.get(decodeURIComponent(match[1]));
      if (!issue) return json(404, { errorMessages: ['Issue does not exist'] });
      const transitions = Object.values(STATUSES)
        .filter((status) => status.name !== issue.status.name)
        .map((status, i) => ({ id: String(11 + i), name: `Move to ${status.name}`, to: status }));
      if (method === 'GET') return json(200, { transitions });
      const chosen = transitions.find((t) => t.id === body.transition.id);
      if (!chosen) return json(400, { errorMessages: ['invalid transition'] });
      Object.assign(issue, { status: chosen.to, updated: ++clock });
      return json(204);
    }
    if ((match = /^\/rest\/api\/2\/issue\/([^/]+)\/comment$/.exec(pathname)) && method === 'POST') {
      const issue = issues.get(decodeURIComponent(match[1]));
      if (!issue) return json(404, { errorMessages: ['Issue does not exist'] });
      const comment = { id: String(nextComment++), body: body.body };
      issue.comments.push(comment);
      issue.updated = ++clock;
      return json(201, comment);
    }
    if ((match = /^\/rest\/api\/2\/issue\/([^/]+)\/comment\/(\d+)$/.exec(pathname))) {
      const issue = issues.get(decodeURIComponent(match[1]));
      const comment = issue?.comments.find((c) => c.id === match[2]);
      if (!comment) return json(404, { errorMessages: ['Comment does not exist'] });
      const rendered = (searchParams.get('expand') ?? '').includes('renderedBody');
      return json(200, { ...comment, ...(rendered ? { renderedBody: render(comment.body) } : {}) });
    }
    return json(404, { errorMessages: [`no route ${method} ${pathname}`] });
  };
  return {
    fetchImpl,
    calls,
    queries,
    env: { JIRA_USER: user, JIRA_TOKEN: token },
    options: { project },
    baseUrl: 'https://jira.example',
  };
}
