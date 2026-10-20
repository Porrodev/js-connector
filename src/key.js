import { createHash, createPrivateKey, randomBytes, sign } from 'node:crypto';

// The same token and signing scheme as the PHP connectors (porro/php-core):
// porro_<site ULID, lowercase>_<32-byte Ed25519 seed, base64url>.
const TOKEN = /^porro_([0-9a-z]{26})_([A-Za-z0-9_-]{43})$/;

// PKCS#8 wrapper for a raw Ed25519 seed, so Node's crypto can load it.
const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

/**
 * @param {string} token
 * @returns {{ siteId: string, seed: Buffer }}
 */
export function parseToken(token) {
    const match = TOKEN.exec(String(token ?? '').trim());

    if (!match) {
        throw new Error(
            'That isn’t a Porro site key. It starts with porro_ and is shown once when you create it.',
        );
    }

    return {
        siteId: match[1].toUpperCase(),
        seed: Buffer.from(match[2], 'base64url'),
    };
}

/**
 * The signed message: timestamp, nonce and the body's SHA-256, one per line.
 *
 * @param {string} timestamp
 * @param {string} nonce
 * @param {string} body
 */
export function message(timestamp, nonce, body) {
    const hash = createHash('sha256').update(body, 'utf8').digest('hex');

    return `${timestamp}\n${nonce}\n${hash}`;
}

/**
 * Headers for one signed request.
 *
 * @param {{ siteId: string, seed: Buffer }} key
 * @param {string} body
 * @param {number} [now] unix seconds, for tests
 */
export function signedHeaders(key, body, now = Math.floor(Date.now() / 1000)) {
    const timestamp = String(now);
    const nonce = randomBytes(18).toString('base64url');
    const privateKey = createPrivateKey({
        key: Buffer.concat([PKCS8_PREFIX, key.seed]),
        format: 'der',
        type: 'pkcs8',
    });
    const signature = sign(
        null,
        Buffer.from(message(timestamp, nonce, body), 'utf8'),
        privateKey,
    ).toString('base64');

    return {
        'X-Porro-Site': key.siteId,
        'X-Porro-Timestamp': timestamp,
        'X-Porro-Nonce': nonce,
        'X-Porro-Signature': signature,
    };
}
