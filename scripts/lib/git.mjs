// The environment for a git process that works on a repository of its own choosing (a temporary
// one, a directory given as an argument). A git hook exports GIT_DIR, GIT_INDEX_FILE, GIT_WORK_TREE
// and others; a pre-push hook started from a linked worktree passes them to the gates, and a git
// process that inherits them works on that repository instead: fixture commits land on the pushed
// branch, its index is replaced and `git config` writes into its config (GATE-25, GATE-19).
//
// The scans of what is being committed (scan-denylist, secret-scan) keep the hook's variables on
// purpose: a pre-commit hook's GIT_INDEX_FILE is the index the commit is made from.

/** `env` without git's own variables (any name that starts with `GIT_`, in any case). */
export function gitEnv(env = process.env) {
  return Object.fromEntries(Object.entries(env).filter(([name]) => !/^GIT_/i.test(name)));
}
