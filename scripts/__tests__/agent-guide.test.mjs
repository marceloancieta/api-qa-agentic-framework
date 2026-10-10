import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// L-09: a rule or skill nobody lists is never found. CLAUDE.md names every rule and every phase
// skill (pack skills, `<pack>-api`, are covered by its `<pack>-api` row).

const ROOT = join(import.meta.dirname, '..', '..');
const guide = readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8');

test('CLAUDE.md lists every rule in .claude/rules', () => {
  const rules = readdirSync(join(ROOT, '.claude', 'rules')).filter((f) => f.endsWith('.md'));
  assert.ok(rules.length > 0);
  const missing = rules.filter((rule) => !guide.includes(`| \`${rule}\` |`));
  assert.deepEqual(missing, [], 'add each rule to the Rules table of CLAUDE.md');
});

test('CLAUDE.md lists every phase skill, and each skill names itself in its front matter', () => {
  const skills = readdirSync(join(ROOT, '.claude', 'skills'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  for (const skill of skills) {
    const text = readFileSync(join(ROOT, '.claude', 'skills', skill, 'SKILL.md'), 'utf8');
    assert.match(
      text,
      new RegExp(`^---\\r?\\nname: ${skill}\\r?\\n`),
      `${skill}/SKILL.md names itself`,
    );
    assert.match(text, /\ndescription: /, `${skill}/SKILL.md has a description`);
  }
  const missing = skills
    .filter((skill) => !skill.endsWith('-api'))
    .filter((skill) => !guide.includes(`| \`${skill}\` |`));
  assert.deepEqual(missing, [], 'add each phase skill to the Skills table of CLAUDE.md');
});

// Subagents: an agent nobody lists is never used, and an agent without a tool list inherits every
// tool, including the ones that edit files. The `Writes` column of the CLAUDE.md table is the
// promise; the front matter `tools` line is what keeps it.

const EDIT_TOOLS = ['Write', 'Edit', 'NotebookEdit'];

/** Rows of the agents table (`| Agent | Use it to | Writes |`), up to the first blank line. */
function agentRows(text) {
  const start = text.indexOf('| Agent | Use it to | Writes |');
  assert.ok(start >= 0, 'CLAUDE.md has an agents table');
  const table = text.slice(start).split(/\r?\n\r?\n/)[0];
  const rows = new Map();
  for (const match of table.matchAll(/^\| `([a-z][a-z0-9-]*)` \| [^|]+ \| ([^|]+) \|$/gm)) {
    rows.set(match[1], match[2].trim());
  }
  return rows;
}

function frontMatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text);
  return match ? match[1] : '';
}

test('every agent in .claude/agents names itself, explains when to use it and declares its tools', () => {
  const dir = join(ROOT, '.claude', 'agents');
  const agents = readdirSync(dir).filter((f) => f.endsWith('.md'));
  assert.ok(agents.length > 0);
  for (const file of agents) {
    const name = file.replace(/\.md$/, '');
    const head = frontMatter(readFileSync(join(dir, file), 'utf8'));
    assert.match(head, new RegExp(`^name: ${name}$`, 'm'), `${file} names itself`);
    assert.match(head, /^description: /m, `${file} has a description`);
    assert.match(head, /^tools: \S/m, `${file} declares its tools`);
  }
});

test('CLAUDE.md lists every agent, and an agent that writes nothing cannot edit files', () => {
  const dir = join(ROOT, '.claude', 'agents');
  const agents = readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace(/\.md$/, ''));
  const rows = agentRows(guide);
  const listed = [...rows.keys()];
  assert.deepEqual(
    agents.filter((agent) => !rows.has(agent)),
    [],
    'add each agent to the agents table of CLAUDE.md',
  );
  assert.deepEqual(
    listed.filter((name) => !agents.includes(name)),
    [],
    'every agent in CLAUDE.md has a file in .claude/agents',
  );
  for (const agent of agents.filter((name) => rows.get(name) === 'nothing')) {
    const head = frontMatter(readFileSync(join(dir, `${agent}.md`), 'utf8'));
    const tools = (/^tools: (.*)$/m.exec(head)?.[1] ?? '').split(',').map((t) => t.trim());
    assert.deepEqual(
      tools.filter((tool) => EDIT_TOOLS.includes(tool)),
      [],
      `${agent} writes nothing, so it has no tool that edits files`,
    );
  }
});

test('CLAUDE.md imports AGENTS.md, so both agents read the same project rules', () => {
  assert.match(guide, /^@AGENTS\.md$/m);
});
