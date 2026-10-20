import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { addBuildHook, run } from '../src/cli.js';

const fixture = new URL('fixtures/nuxt-app/', import.meta.url).pathname;
const token = `porro_01jabcdefghjkmnpqrstvwxyz0_${randomBytes(32).toString('base64url')}`;

function project() {
    const dir = mkdtempSync(join(tmpdir(), 'porro-connector-'));
    cpSync(fixture, dir, { recursive: true });
    return dir;
}

function fakePorro(status = 202, answer = { ok: true, need_lock: false }) {
    const calls = [];
    const fetch = async (url, init) => {
        calls.push({ url, init, body: JSON.parse(init.body) });
        return new Response(JSON.stringify(answer), { status });
    };
    return { calls, fetch };
}

test('skips quietly without a key, so local and preview builds pass', async () => {
    const logs = [];
    const code = await run([], { env: {}, cwd: project(), log: (s) => logs.push(s) });

    assert.equal(code, 0);
    assert.match(logs[0], /no PORRO_KEY set, skipping/);
});

test('sends a signed deploy report to Porro', async () => {
    const porro = fakePorro();
    const code = await run([], { env: { PORRO_KEY: token, PORRO_URL: 'http://porro.test/' }, cwd: project(), fetch: porro.fetch, log: () => {} });

    assert.equal(code, 0);
    assert.equal(porro.calls.length, 1);
    assert.equal(porro.calls[0].url, 'http://porro.test/api/v1/reports');
    assert.equal(porro.calls[0].body.trigger, 'deploy');
    assert.equal(porro.calls[0].init.headers['X-Porro-Site'], '01JABCDEFGHJKMNPQRSTVWXYZ0');
    assert.ok(porro.calls[0].init.headers['X-Porro-Signature']);
});

test('never fails a deploy when Porro refuses or is down', async () => {
    const refused = fakePorro(401, { ok: false, error: 'Invalid signature.' });
    const logs = [];

    assert.equal(await run([], { env: { PORRO_KEY: token }, cwd: project(), fetch: refused.fetch, log: (s) => logs.push(s) }), 0);
    assert.match(logs.at(-1), /Porro refused the report \(401\): Invalid signature\./);
    assert.equal(refused.calls.length, 1, 'client errors are not retried');
});

test('connect sends the first report, hooks the build and shows the key to set', async () => {
    const dir = project();
    const porro = fakePorro();
    const logs = [];
    const code = await run(['connect', token], { env: {}, cwd: dir, fetch: porro.fetch, log: (s) => logs.push(s) });
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));

    assert.equal(code, 0);
    assert.equal(porro.calls[0].body.trigger, 'connect');
    assert.equal(manifest.scripts.build, 'nuxt build && porro-connector');
    assert.ok(logs.includes(`  PORRO_KEY=${token}`));
    assert.equal(addBuildHook(dir), false, 'only added once');
    rmSync(dir, { recursive: true });
});

test('connect fails loudly on a bad key, since a person is running it', async () => {
    const logs = [];

    assert.equal(await run(['connect', 'nope'], { env: {}, cwd: project(), log: (s) => logs.push(s) }), 1);
    assert.match(logs[0], /isn’t a Porro site key/);
});
