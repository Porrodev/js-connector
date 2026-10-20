import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseNpm, parsePnpm, parseYarn, readLock } from '../src/lockfile.js';

const fixture = (name) => readFileSync(new URL(`fixtures/${name}`, import.meta.url), 'utf8');
const app = new URL('fixtures/nuxt-app/', import.meta.url).pathname;

test('reads package-lock.json, keeping nested copies and skipping workspace links', () => {
    const lock = readLock(app, JSON.parse(fixture('nuxt-app/package.json')));

    assert.equal(lock.file, 'package-lock.json');
    assert.match(lock.hash, /^[0-9a-f]{64}$/);
    assert.deepEqual(lock.packages, [
        { name: '@nuxt/kit', version: '3.13.2', dev: false, direct: false },
        { name: 'nuxt', version: '3.13.2', dev: false, direct: true },
        { name: 'semver', version: '6.3.1', dev: false, direct: false },
        { name: 'semver', version: '7.6.3', dev: false, direct: false },
        { name: 'typescript', version: '5.6.3', dev: true, direct: true },
        { name: 'vue', version: '3.5.12', dev: false, direct: true },
    ]);
});

test('reads package-lock.json v1 trees', () => {
    const packages = parseNpm(JSON.stringify({
        lockfileVersion: 1,
        dependencies: { vue: { version: '2.7.16', dependencies: { lodash: { version: '4.17.20', dev: true } } } },
    }));

    assert.deepEqual(packages, [
        { name: 'vue', version: '2.7.16', dev: false, topLevel: true },
        { name: 'lodash', version: '4.17.20', dev: true, topLevel: false },
    ]);
});

test('reads pnpm v9 and v6 lock files', () => {
    assert.deepEqual(parsePnpm(fixture('pnpm-v9.yaml')), [
        { name: '@nuxt/kit', version: '3.13.2' },
        { name: 'nuxt', version: '3.13.2' },
        { name: 'vue', version: '3.5.12' },
    ]);

    assert.deepEqual(parsePnpm(fixture('pnpm-v6.yaml')), [
        { name: 'nuxt', version: '3.8.0', dev: false },
        { name: 'typescript', version: '5.2.2', dev: true },
        { name: '@vue/shared', version: '3.3.8', dev: false },
    ]);
});

test('reads classic and Berry yarn.lock files', () => {
    const expected = [
        { name: '@nuxt/kit', version: '3.13.2' },
        { name: 'nuxt', version: '3.13.2' },
    ];

    assert.deepEqual(parseYarn(fixture('yarn-v1.lock')), expected);
    assert.deepEqual(parseYarn(fixture('yarn-berry.lock')), expected);
});
