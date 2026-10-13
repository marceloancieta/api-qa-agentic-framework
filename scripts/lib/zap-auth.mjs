// Keeping a credential on every request ZAP sends during a scan (FUT-10), for the DAST lane.
//
// `zap-api-scan.py` starts ZAP with its API on every address and without an API key, so the lane
// publishes the API port on loopback and drives it from the host. A replacer rule of type
// REQ_HEADER puts the credential's header on every request ZAP sends, the import of the definition
// and the attacks alike. A token outlives no scan of minutes, so the rule is swapped (removeRule,
// then addRule) each time the credential is renewed.
//
// What went wrong in a real scan shaped the order: a token obtained before ZAP started was nearly
// expired when the rule went in, so the credential is obtained the moment the API answers; and an
// attacked operation can change or delete the scan user, after which every renewal fails, so a
// failure stops the renewals and is kept for the lane's verdict instead of being retried.
//
// Never log a credential value: the replacer calls carry it in their query, so neither their URL
// nor ZAP's answer to them is ever printed.

import { stoppableSleep } from './container.mjs';

/** The description that names the lane's replacer rule in ZAP. */
export const RULE = 'qa-auth';

/** A call of ZAP's JSON API on the loopback port the lane published. */
export function zapApiUrl(port, path, params = {}) {
  const query = new URLSearchParams(params).toString();
  return `http://127.0.0.1:${port}/JSON/${path}/${query ? `?${query}` : ''}`;
}

/** The replacer rule that sets `credential.header` to `credential.value` on every request. */
export function addRuleParams(credential) {
  return {
    description: RULE,
    enabled: 'true',
    matchType: 'REQ_HEADER',
    matchRegex: 'false',
    matchString: credential.header,
    replacement: credential.value,
    initiators: '',
  };
}

/**
 * Start keeping the credential in ZAP while a scan runs:
 *
 *   1. poll `core/view/version` every `pollMs` until ZAP's API answers (at most `readyTimeoutMs`);
 *   2. `obtain()` the credential then, so it is fresh, and add the replacer rule;
 *   3. at each credential's `renewAt` (never sooner than `minRenewMs` from now), `renew()` it and
 *      swap the rule.
 *
 * A failure at any step is logged once with its reason and ends the work; nothing is retried.
 * `stop()` ends it when the scan ends and resolves once nothing is left running. `state` tells the
 * lane what happened:
 *
 *   { credential: { type, header } | null, setAt: s | null, renewals,
 *     failure: { stage: 'ready' | 'credential' | 'rule' | 'renewal', at: s, reason } | null }
 *
 * Times are seconds since the start. `fetchImpl`, `now` and `timers` replace `fetch`, `Date.now`
 * and the timer functions in tests.
 */
export function startZapAuth({
  port,
  obtain,
  log = () => {},
  fetchImpl = fetch,
  now = Date.now,
  timers,
  readyTimeoutMs = 300_000,
  pollMs = 2_000,
  requestTimeoutMs = 10_000,
  minRenewMs = 1_000,
}) {
  const state = { credential: null, setAt: null, renewals: 0, failure: null };
  const startedAt = now();
  const elapsed = () => Math.round((now() - startedAt) / 1000);
  const abort = new AbortController();
  const clock = stoppableSleep(timers);
  let stopped = false;

  /** One call of ZAP's API; throws a message that names the call, never its parameters. */
  const call = async (path, params) => {
    let response;
    try {
      response = await fetchImpl(zapApiUrl(port, path, params), {
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(requestTimeoutMs)]),
      });
    } catch (error) {
      const why =
        error?.name === 'TimeoutError'
          ? `no answer within ${requestTimeoutMs / 1000} s`
          : (error?.cause?.code ?? error?.message);
      throw new Error(`ZAP's API ${path} did not answer (${why})`, { cause: error });
    }
    const body = await response.json().catch(() => null);
    return { response, body };
  };
  const action = async (path, params) => {
    const { response, body } = await call(path, params);
    if (!response.ok || body?.Result !== 'OK') {
      const code = typeof body?.code === 'string' ? ` "${body.code}"` : '';
      throw new Error(`ZAP's API ${path} answered ${response.status}${code}`);
    }
  };
  const setRule = (credential) => action('replacer/action/addRule', addRuleParams(credential));
  const fail = (stage, message) => {
    if (stopped) return;
    const reason = message.replace(/\.$/, '');
    state.failure = { stage, at: elapsed(), reason };
    log(
      stage === 'renewal'
        ? `renewal ${state.renewals + 1} of the credential failed ${state.failure.at} s into the scan (${reason}); no further renewal`
        : `the credential could not be set in ZAP ${state.failure.at} s into the scan (${reason})`,
    );
  };

  const work = (async () => {
    for (;;) {
      if (stopped) return;
      try {
        const { response } = await call('core/view/version');
        if (response.ok) break;
      } catch {
        // not up yet
      }
      if (stopped) return;
      if (now() - startedAt >= readyTimeoutMs) {
        fail('ready', `ZAP's API did not answer within ${readyTimeoutMs / 1000} s`);
        return;
      }
      await clock.sleep(pollMs);
    }

    let credential;
    try {
      credential = await obtain();
    } catch (error) {
      fail('credential', error.message);
      return;
    }
    if (stopped) return;
    state.credential = { type: credential.type, header: credential.header };
    try {
      await setRule(credential);
    } catch (error) {
      fail('rule', error.message);
      return;
    }
    state.setAt = elapsed();
    log(`credential set in ZAP's replacer ${state.setAt} s into the scan`);

    while (credential.renewAt !== undefined) {
      await clock.sleep(Math.max(minRenewMs, credential.renewAt - now()));
      if (stopped) return;
      try {
        credential = await credential.renew();
        if (stopped) return;
        await action('replacer/action/removeRule', { description: RULE });
        await setRule(credential);
      } catch (error) {
        fail('renewal', error.message);
        return;
      }
      state.renewals += 1;
    }
  })();

  return {
    state,
    stop: async () => {
      stopped = true;
      abort.abort();
      clock.cancel();
      await work;
    },
  };
}
