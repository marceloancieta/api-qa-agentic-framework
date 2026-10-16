#!/usr/bin/env node
/**
 * Builds the `create-api-qa` package (packages/create-api-qa) for one framework release: the release
 * as `framework.tar.gz` (`git archive` of the tag), `framework.json` with its version and commit,
 * and copies of LICENSE and NOTICE. None of these is tracked; `npm pack` in the package directory
 * then holds exactly what `npm create api-qa` unpacks.
 *
 *   node scripts/build-create-package.mjs [--ref v<version>] [--out <dir>]
 *
 * The ref defaults to the tag of the package's version. The package's version must equal the
 * framework version at that ref, so a published package always names the release it carries.
 */

import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT } from './lib/cli.mjs';
import { gitEnv } from './lib/git.mjs';

export const PACKAGE_DIR = join(REPO_ROOT, 'packages', 'create-api-qa');

function git(args, root) {
  const result = spawnSync('git', args, {
    cwd: root,
    env: gitEnv(),
    encoding: 'buffer',
    maxBuffer: 256 << 20,
  });
  if (result.status !== 0)
    throw new Error(`git ${args.join(' ')}: ${result.stderr.toString('utf8').trim()}`);
  return result.stdout;
}

/** Writes the package's generated files into `out` and returns `{ version, ref, commit }`. */
export function buildPackage({ ref, out = PACKAGE_DIR, root = REPO_ROOT } = {}) {
  const { version } = JSON.parse(readFileSync(join(PACKAGE_DIR, 'package.json'), 'utf8'));
  const wanted = ref ?? `v${version}`;
  const commit = git(['rev-parse', '--verify', `${wanted}^{commit}`], root)
    .toString('utf8')
    .trim();
  const framework = JSON.parse(git(['show', `${commit}:package.json`], root).toString('utf8'));
  if (framework.version !== version) {
    throw new Error(
      `create-api-qa is ${version}, but the framework at ${wanted} is ${framework.version}; ` +
        'build the package from the release with the same version.',
    );
  }
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'framework.tar.gz'), git(['archive', '--format=tar.gz', commit], root));
  const release = { version, ref: wanted, commit };
  writeFileSync(join(out, 'framework.json'), `${JSON.stringify(release, null, 2)}\n`);
  for (const file of ['LICENSE', 'NOTICE']) copyFileSync(join(root, file), join(out, file));
  return release;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { values } = parseArgs({ options: { ref: { type: 'string' }, out: { type: 'string' } } });
  try {
    const release = buildPackage({
      ref: values.ref,
      ...(values.out ? { out: resolve(values.out) } : {}),
    });
    console.log(
      `create-api-qa ${release.version}: framework ${release.ref} (${release.commit.slice(0, 7)}) packed.`,
    );
  } catch (error) {
    console.error(`build-create-package: ${error.message}`);
    process.exit(1);
  }
}
