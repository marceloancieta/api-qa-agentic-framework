// What `npm audit` means to the framework's checks: the level a release and a pull request may not
// carry, the advice for fixing a finding, and the advisories of a report at that level (GATE-32).

/** The lowest severity that fails an audit: `release:check` and `audit:new` read the same one. */
export const AUDIT_LEVEL = 'high';

export const AUDIT_HINT =
  'take the patched release into the lockfile (npm update <package>, or the dependency that ' +
  'brings it in), or a release of it at least two weeks old (docs/ci-security.md, Dependabot)';

const SEVERITIES = ['info', 'low', 'moderate', 'high', 'critical'];

/**
 * The advisories of a parsed `npm audit --json` report at `level` or above, as a Map from an
 * identity (the package and the advisory's URL) to `{ name, severity, title, url }`. A `via` entry
 * that is a string only names the package that brings an advisory in, whose own entry reports it.
 * Throws on a report with no `vulnerabilities`, which is what an audit that did not run leaves.
 */
export function advisoriesOf(report, level = AUDIT_LEVEL) {
  if (!report || typeof report.vulnerabilities !== 'object' || report.vulnerabilities === null) {
    throw new Error(`no audit report: ${report?.message ?? report?.error?.summary ?? 'no data'}`);
  }
  const lowest = SEVERITIES.indexOf(level);
  const found = new Map();
  for (const entry of Object.values(report.vulnerabilities)) {
    for (const via of entry.via ?? []) {
      if (typeof via !== 'object' || SEVERITIES.indexOf(via.severity) < lowest) continue;
      const { name, severity, title, url } = via;
      found.set(`${name} ${url}`, { name, severity, title, url });
    }
  }
  return found;
}

/** The advisories of `head` that `base` does not have, the most severe first. */
export function newAdvisories(base, head) {
  return [...head]
    .filter(([identity]) => !base.has(identity))
    .map(([, advisory]) => advisory)
    .sort((a, b) => SEVERITIES.indexOf(b.severity) - SEVERITIES.indexOf(a.severity));
}
