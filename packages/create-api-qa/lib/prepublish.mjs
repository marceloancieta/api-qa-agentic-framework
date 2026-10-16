// Run by `npm publish` (prepublishOnly): a package without its release files would publish a
// command that cannot work, and a published version cannot be replaced. The files are written by
// `npm run create:build` in the framework's repository from the release tag.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const RELEASE_FILES = ['framework.tar.gz', 'framework.json', 'LICENSE', 'NOTICE'];

/** What keeps the package in `dir` from being published; empty when it is ready. */
export function publishProblems(dir) {
  const missing = RELEASE_FILES.filter((file) => !existsSync(join(dir, file)));
  if (missing.length > 0)
    return [`missing ${missing.join(', ')}: run npm run create:build from the release tag`];
  const { version } = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const release = JSON.parse(readFileSync(join(dir, 'framework.json'), 'utf8'));
  const problems = [];
  if (release.version !== version)
    problems.push(`framework.json is ${release.version}, the package is ${version}`);
  if (release.ref !== `v${version}`)
    problems.push(`framework.json was built from ${release.ref}, not from the tag v${version}`);
  return problems;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const problems = publishProblems(process.cwd());
  if (problems.length > 0) {
    console.error(`create-api-qa is not ready to publish: ${problems.join('; ')}.`);
    process.exit(1);
  }
}
