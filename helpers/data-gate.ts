// Cases that depend on data or on what an environment allows. Two rules:
//   - when a case is not executed, it says so loudly: a warning in the output and an annotation in the
//     results, so a run full of skips never reads as a green run;
//   - data a case relies on is checked for the state the case needs, not only for existence. Data
//     that exists in the wrong state fails the case as a broken precondition instead of letting it
//     pass while testing something else.

import { test } from '@playwright/test';

/** Skip the running case, visibly, unless `condition` holds. */
export function skipUnless(condition: boolean, reason: string): void {
  if (condition) return;
  const info = test.info();
  info.annotations.push({ type: 'skip-reason', description: reason });
  console.warn(`[skip] ${info.titlePath.slice(1).join(' > ')}: ${reason}`);
  test.skip(true, reason);
}

/**
 * The data a case needs, or a visible skip when it is absent. `problems` lists how the data differs
 * from the state the case was designed for; any problem fails the case before it starts.
 */
export async function requireData<T>(
  what: string,
  find: () => Promise<T | null | undefined>,
  problems: (data: T) => string[] = () => [],
): Promise<T> {
  const data = await find();
  if (data === null || data === undefined) {
    skipUnless(false, `no ${what} available in this environment`);
    throw new Error('unreachable: test.skip ends the case');
  }
  const found = problems(data);
  if (found.length > 0) {
    throw new Error(
      `Precondition: the ${what} is not in the state this case needs: ${found.join('; ')}.`,
    );
  }
  return data;
}
