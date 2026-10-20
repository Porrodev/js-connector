import assert from 'node:assert/strict';
import { createPublicKey, createPrivateKey, randomBytes, verify } from 'node:crypto';
import { test } from 'node:test';
import { message, parseToken, signedHeaders } from '../src/key.js';

const seed = randomBytes(32);
const token = `porro_01jabcdefghjkmnpqrstvwxyz0_${seed.toString('base64url')}`;

test('parses a site key into the site id and seed', () => {
    const key = parseToken(token);

    assert.equal(key.siteId, '01JABCDEFGHJKMNPQRSTVWXYZ0');
    assert.deepEqual(key.seed, seed);
    assert.throws(() => parseToken('lk_site_nope'), /isn’t a Porro site key/);
});

test('signs timestamp, nonce and body hash with the site key', () => {
    const key = parseToken(token);
    const body = '{"schema":1}';
    const headers = signedHeaders(key, body, 1_800_000_000);

    assert.equal(headers['X-Porro-Site'], key.siteId);
    assert.equal(headers['X-Porro-Timestamp'], '1800000000');
    assert.match(headers['X-Porro-Nonce'], /^[A-Za-z0-9_-]{24}$/);

    const privateKey = createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]), format: 'der', type: 'pkcs8' });
    const publicKey = createPublicKey(privateKey);
    const signed = message('1800000000', headers['X-Porro-Nonce'], body);

    assert.match(signed.split('\n')[2], /^[0-9a-f]{64}$/, 'body hash is lowercase hex');
    assert.ok(verify(null, Buffer.from(signed), publicKey, Buffer.from(headers['X-Porro-Signature'], 'base64')));
});
