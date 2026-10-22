// Git run by scripts and their tests never works on the repository a calling hook points at
// (GATE-25). A pre-push hook started from a linked worktree exports GIT_DIR, GIT_INDEX_FILE and
// GIT_WORK_TREE to the gates; `npm run test:scripts` (scripts/test-scripts.mjs) runs every suite
// under a decoy of those variables, and the decoy must come out unchanged (GATE-31). These tests
// prove that runner on small suites written here: one that keeps to its own repository, one whose
// git command lands in the decoy, one that fails.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gitEnv } from '../lib/git.mjs';
import { defaultSuites, testScripts } from '../test-scripts.mjs';

test('gitEnv drops every variable of git, in any case, and keeps the others', () => {
  const env = {
    GIT_DIR: '/r/.git',
    GIT_INDEX_FILE: '/r/.git/index',
    GIT_WORK_TREE: '/r',
    git_dir: '/r/.git',
    GIT_AUTHOR_NAME: 'a',
    PATH: '/bin',
    GITHUB_TOKEN: 't',
    MY_GIT_DIR: '/x',
  };
  assert.deepEqual(gitEnv(env), { PATH: '/bin', GITHUB_TOKEN: 't', MY_GIT_DIR: '/x' });
  assert.deepEqual(gitEnv({}), {});
});

test('the default suites are every test file of scripts/__tests__, this one included', () => {
  const suites = defaultSuites().map((file) => file.replaceAll('\\', '/'));
  assert.ok(suites.includes('scripts/__tests__/git-env.test.mjs'));
  assert.ok(suites.every((file) => /^scripts\/__tests__\/[^/]+\.test\.mjs$/.test(file)));
});

/** A suite file in `dir` whose single test runs `body`; `marker` is written when it ran. */
function suite(dir, name, body) {
  const file = join(dir, `${name}.test.mjs`);
  const marker = join(dir, `${name}.ran`);
  writeFileSync(
    file,
    [
      "import { test } from 'node:test';",
      "import { spawnSync } from 'node:child_process';",
      "import { mkdtempSync, writeFileSync } from 'node:fs';",
      "import { tmpdir } from 'node:os';",
      "import { join } from 'node:path';",
      'const clean = Object.fromEntries(',
      '  Object.entries(process.env).filter(([name]) => !/^GIT_/i.test(name)),',
      ');',
      `test('${name}', () => {`,
      `  writeFileSync(${JSON.stringify(marker)}, 'ran');`,
      `  ${body}`,
      '});',
      '',
    ].join('\n'),
  );
  return { file, marker };
}

function runUnderDecoy(files) {
  const errors = [];
  const code = testScripts(files, {
    out: { log: () => {}, error: (line) => errors.push(line) },
    stdio: 'pipe',
  });
  return { code, errors: errors.join('\n') };
}

test('a suite that keeps git to its own repository passes, and actually ran', () => {
  const dir = mkdtempSync(join(tmpdir(), 'git-env-suites-'));
  try {
    const own = suite(
      dir,
      'own-repository',
      "const repo = mkdtempSync(join(tmpdir(), 'own-')); " +
        "const run = spawnSync('git', ['init', '-q'], { cwd: repo, env: clean }); " +
        "if (run.status !== 0) throw new Error('git init failed');",
    );
    // This test runs inside `node --test`: the runner must drop NODE_TEST_CONTEXT, or the inner
    // run would start no file and pass without the marker.
    const { code, errors } = runUnderDecoy([own.file]);
    assert.equal(code, 0, errors);
    assert.ok(existsSync(own.marker), 'the suite did not run');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a git command that inherits the hook variables lands in the decoy and fails the run', () => {
  const dir = mkdtempSync(join(tmpdir(), 'git-env-suites-'));
  try {
    const stray = suite(
      dir,
      'stray-config',
      "spawnSync('git', ['config', 'qa.stray', 'yes'], { cwd: tmpdir() });",
    );
    const { code, errors } = runUnderDecoy([stray.file]);
    assert.equal(code, 1);
    assert.match(errors, /worked on the repository of the inherited GIT_DIR \(changed: config\)/);
    assert.ok(existsSync(stray.marker), 'the suite did not run');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a failing suite fails the run, with the decoy unchanged', () => {
  const dir = mkdtempSync(join(tmpdir(), 'git-env-suites-'));
  try {
    const failing = suite(dir, 'failing', "throw new Error('expected failure');");
    const { code, errors } = runUnderDecoy([failing.file]);
    assert.equal(code, 1);
    assert.match(errors, /the suites failed \(exit 1\)/);
    assert.doesNotMatch(errors, /inherited GIT_DIR/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
