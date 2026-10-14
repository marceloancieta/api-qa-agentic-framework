import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { gitFreeEnv, runHook, tempProject } from './harness.mjs';

const bash = (command, cwd) => ({
  hook_event_name: 'PreToolUse',
  tool_name: 'Bash',
  tool_input: { command },
  ...(cwd ? { cwd } : {}),
});
const heredoc = (body) => `git commit -m "$(cat <<'EOF'\n${body}\nEOF\n)"`;

test('with no policy configured, every commit and PR is allowed', async () => {
  const dir = tempProject();
  for (const command of ['git commit -m "anything"', 'git commit -F -', 'gh pr create --title x']) {
    const r = await runHook('git-policy.mjs', bash(command, dir), { projectDir: dir });
    assert.equal(r.verdict, 'allow', command);
  }
});

const STRICT = {
  tracker: { key_pattern: 'PROJ-\\d+' },
  policies: {
    commit: { require_tracker_key: true, max_tracker_keys: 1, conventional_commits: true },
  },
};

const COMMIT_ROWS = [
  ['one key, conventional', 'git commit -m "feat: PROJ-1 add pets"', 'allow'],
  ['two keys', 'git commit -m "feat: PROJ-1 add" -m "see PROJ-2"', 'deny'],
  ['no key', 'git commit -m "feat: add pets"', 'ask'],
  ['not conventional', 'git commit -m "Add pets PROJ-1"', 'ask'],
  ['message on stdin', 'git commit -F -', 'deny'],
  ['unreadable message file', 'git commit -F missing.txt', 'ask'],
  ['readable message file, one key', 'git commit -F msg-ok.txt', 'allow'],
  ['readable message file, two keys (attached -F form)', 'git commit -Fmsg-two.txt', 'deny'],
  ['unbalanced quoting', 'git commit -m "feat: PROJ-1 oops', 'ask'],
  ['heredoc, one key', heredoc('feat: PROJ-1 add pets\n\nBody text.'), 'allow'],
  ['heredoc, key in body too', heredoc('feat: PROJ-1 add pets\n\nRelated to PROJ-2.'), 'deny'],
  ['git -C option before commit', 'git -C sub commit -m "fix: PROJ-3 x"', 'allow'],
  ['--message= form', 'git commit --message="docs: PROJ-4 readme"', 'allow'],
  ['amend without a message', 'git commit --amend --no-edit', 'allow'],
  ['not a commit', 'git status', 'allow'],
];

for (const [name, command, expected] of COMMIT_ROWS) {
  test(`commit policy: ${name} -> ${expected}`, async () => {
    const dir = tempProject({
      config: STRICT,
      files: {
        'msg-ok.txt': 'fix: PROJ-3 handle 404\n',
        'msg-two.txt': 'fix: PROJ-3 and PROJ-4\n',
      },
    });
    const r = await runHook('git-policy.mjs', bash(command, dir), { projectDir: dir });
    assert.equal(r.verdict, expected, r.stdout);
  });
}

test('an invalid key_pattern disables the key rule instead of crashing', async () => {
  const dir = tempProject({ config: { tracker: { key_pattern: '([' } } });
  const r = await runHook('git-policy.mjs', bash('git commit -m "x"', dir), { projectDir: dir });
  assert.equal(r.verdict, 'allow');
});

function gitRepoOn(branch, config) {
  const dir = tempProject({ config });
  const git = (...args) =>
    execFileSync('git', args, { cwd: dir, stdio: 'ignore', env: gitFreeEnv() });
  git('init', '-q', '-b', branch);
  return dir;
}

const gitRead = (dir, ...args) =>
  execFileSync('git', ['--git-dir', join(dir, '.git'), ...args], {
    encoding: 'utf8',
    env: gitFreeEnv(),
  }).trim();

test('protected branch: committing on it asks', async () => {
  const dir = gitRepoOn('main', { policies: { commit: { protected_branches: ['main'] } } });
  const r = await runHook('git-policy.mjs', bash('git commit -m "x"', dir), { projectDir: dir });
  assert.equal(r.verdict, 'ask');
});

test('protected branch: committing on another branch is allowed', async () => {
  const dir = gitRepoOn('feature/x', { policies: { commit: { protected_branches: ['main'] } } });
  const r = await runHook('git-policy.mjs', bash('git commit -m "x"', dir), { projectDir: dir });
  assert.equal(r.verdict, 'allow');
});

test('protected branch: an inherited GIT_DIR does not redirect the harness to another repository', async () => {
  // A pre-push hook started from a linked worktree exports GIT_DIR to the gates (GATE-19).
  const decoy = gitRepoOn('decoy');
  const inherited = { GIT_DIR: join(decoy, '.git'), GIT_WORK_TREE: decoy };
  const saved = Object.fromEntries(Object.keys(inherited).map((name) => [name, process.env[name]]));
  Object.assign(process.env, inherited);
  try {
    const dir = gitRepoOn('main', { policies: { commit: { protected_branches: ['main'] } } });
    const r = await runHook('git-policy.mjs', bash('git commit -m "x"', dir), { projectDir: dir });
    assert.equal(r.verdict, 'ask', 'the hook read the branch of the inherited GIT_DIR');
  } finally {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
  assert.equal(
    gitRead(decoy, 'config', 'core.bare'),
    'false',
    'git init rewrote the inherited repository',
  );
  assert.equal(gitRead(decoy, 'symbolic-ref', '--short', 'HEAD'), 'decoy');
});

const LABELS = { policies: { pull_request: { required_labels: ['needs-review'] } } };
const PR_ROWS = [
  ['missing label', 'gh pr create --title "x" --body "y"', 'deny'],
  ['--label', 'gh pr create --title x --label needs-review', 'allow'],
  ['-l comma list', 'gh pr create -l bug,needs-review --title x', 'allow'],
  ['--label= form', 'gh pr create --label=needs-review', 'allow'],
  ['different label only', 'gh pr create --label bug', 'deny'],
  ['label word in the body only', 'gh pr create --body "needs-review"', 'deny'],
  ['gh pr view is not create', 'gh pr view 12', 'allow'],
];

for (const [name, command, expected] of PR_ROWS) {
  test(`PR policy: ${name} -> ${expected}`, async () => {
    const dir = tempProject({ config: LABELS });
    const r = await runHook('git-policy.mjs', bash(command, dir), { projectDir: dir });
    assert.equal(r.verdict, expected, r.stdout);
  });
}

test('malformed payload is allowed (secret-guard owns fail-closed on input)', async () => {
  const r = await runHook('git-policy.mjs', 'garbage');
  assert.equal(r.verdict, 'allow');
});
