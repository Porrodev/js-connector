import { signedHeaders } from './key.js';

export const DEFAULT_URL = 'https://app.porro.dev';

/**
 * Send one report, retrying twice if Porro can't be reached or errors.
 * Returns Porro's answer, e.g. { ok: true, need_lock: false }.
 *
 * @param {{ siteId: string, seed: Buffer }} key
 * @param {object} report
 * @param {{ url?: string, version: string, fetch?: typeof fetch, retries?: number }} options
 */
export async function send(key, report, { url = DEFAULT_URL, version, fetch: fetchImpl = fetch, retries = 2 }) {
    const endpoint = `${url.replace(/\/+$/, '')}/api/v1/reports`;
    const body = JSON.stringify(report);
    let lastError;

    for (let attempt = 0; attempt <= retries; attempt++) {
        if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));

        // A fresh nonce and signature each attempt, or Porro sees a replay.
        const headers = {
            ...signedHeaders(key, body),
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'User-Agent': `porro-js-connector/${version}`,
        };

        let response;

        try {
            response = await fetchImpl(endpoint, { method: 'POST', headers, body, signal: AbortSignal.timeout(15000) });
        } catch (error) {
            lastError = new Error(`Couldn’t reach Porro at ${url}: ${error.message}`);
            continue;
        }

        const answer = await response.json().catch(() => ({}));

        if (response.ok) return answer;

        lastError = new Error(`Porro refused the report (${response.status}): ${answer.error ?? 'no reason given'}`);

        // Only server errors are worth retrying.
        if (response.status < 500) break;
    }

    throw lastError;
}
