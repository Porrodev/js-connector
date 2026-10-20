import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildReport, environment } from '../src/report.js';

const app = new URL('fixtures/nuxt-app/', import.meta.url).pathname;

test('reports Node, the framework, the lock file and published source maps', () => {
    const report = buildReport({ dir: app, trigger: 'deploy', version: '0.1.0', env: { NODE_ENV: 'production' } });

    assert.equal(report.schema, 1);
    assert.equal(report.mode, 'deploy');
    assert.equal(report.trigger, 'deploy');
    assert.deepEqual(report.connector, { name: '@porro/js-connector', version: '0.1.0' });
    assert.equal(report.runtime.name, 'node');
    assert.equal(report.runtime.version, process.versions.node);
    assert.deepEqual(report.platform, { name: 'node', version: '3.13.2', environment: 'production' });
    assert.deepEqual(report.layers, [{ name: 'nuxt', version: '3.13.2' }, { name: 'vue', version: '3.5.12' }]);
    assert.equal(report.lock.ecosystem, 'npm');
    assert.equal(report.lock.packages.length, 6);
    assert.deepEqual(report.health.checks, [{
        name: 'Source maps',
        status: 'warning',
        summary: '1 published with the site, so anyone can read the original source',
    }]);
    assert.equal(report.php, undefined);
});

test('works out the environment from the host', () => {
    assert.equal(environment({ VERCEL_ENV: 'preview' }), 'preview');
    assert.equal(environment({ CONTEXT: 'deploy-preview' }), 'deploy-preview');
    assert.equal(environment({ CF_PAGES_BRANCH: 'main' }), 'production');
    assert.equal(environment({ CF_PAGES_BRANCH: 'feature/x' }), 'preview');
    assert.equal(environment({ PORRO_ENV: 'staging', NODE_ENV: 'production' }), 'staging');
    assert.equal(environment({}), 'production');
});
