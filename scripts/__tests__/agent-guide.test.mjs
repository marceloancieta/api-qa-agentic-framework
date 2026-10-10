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

test('CLAUDE.md imports AGENTS.md, so both agents read the same project rules', () => {
  assert.match(guide, /^@AGENTS\.md$/m);
});
