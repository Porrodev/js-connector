import { readFileSync } from 'node:fs';
import { buildReport } from './report.js';
import { parseToken } from './key.js';
import { DEFAULT_URL, send } from './send.js';

export { buildReport } from './report.js';
export { parseToken, signedHeaders, message } from './key.js';
export { parseNpm, parsePnpm, parseYarn, readLock } from './lockfile.js';
export { send, DEFAULT_URL } from './send.js';

export const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

/**
 * Build and send a report. If Porro hasn't seen this lock file and the
 * report didn't carry its packages, send them as it asks.
 *
 * @param {{ dir: string, token: string, url?: string, trigger: 'deploy' | 'connect' | 'manual', fetch?: typeof fetch }} options
 */
export async function report({ dir, token, url = DEFAULT_URL, trigger, fetch }) {
    const key = parseToken(token);
    const body = buildReport({ dir, trigger, version: VERSION });
    const answer = await send(key, body, { url, version: VERSION, fetch });

    return { report: body, answer };
}
