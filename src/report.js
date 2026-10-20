import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { readLock } from './lockfile.js';

export const CONNECTOR = 'porro-report';

// The framework a site is built with, most specific first. The first one
// installed becomes the site's platform in Porro.
const FRAMEWORKS = [
    'nuxt',
    'next',
    'astro',
    '@sveltejs/kit',
    '@remix-run/react',
    '@angular/core',
    'vue',
    'react',
    'svelte',
    'vite',
];

// Where each framework writes files that are served to visitors.
const PUBLIC_OUTPUT = ['.output/public', 'dist', 'build', '.next/static', 'out', '.svelte-kit/output/client'];

/**
 * @param {string} dir
 */
export function readManifest(dir) {
    const file = join(dir, 'package.json');

    if (!existsSync(file)) {
        throw new Error(`No package.json in ${dir}. Run porro-report from the project folder.`);
    }

    return JSON.parse(readFileSync(file, 'utf8'));
}

/**
 * Build the report Porro expects (schema 1, as the PHP connectors send),
 * with Node in place of PHP. Facts about software only: no source, no
 * environment values.
 *
 * @param {{ dir: string, trigger: 'deploy' | 'connect' | 'manual', version: string, env?: NodeJS.ProcessEnv }} options
 */
export function buildReport({ dir, trigger, version, env = process.env }) {
    const manifest = readManifest(dir);
    const lock = readLock(dir, manifest);
    const installed = new Map((lock?.packages ?? []).filter((p) => p.direct).map((p) => [p.name, p.version]));

    const layers = FRAMEWORKS.filter((name) => installed.has(name))
        .slice(0, 3)
        .map((name) => ({ name: layerName(name), version: installed.get(name) }));

    return {
        schema: 1,
        connector: { name: CONNECTOR, version },
        sent_at: new Date().toISOString(),
        trigger,
        // Reports arrive on each build, not on a schedule.
        mode: 'deploy',
        runtime: { name: 'node', version: process.versions.node },
        platform: {
            name: 'node',
            version: layers[0]?.version ?? null,
            environment: environment(env),
        },
        layers,
        health: { checks: checks(dir) },
        lock: lock
            ? { ecosystem: 'npm', hash: lock.hash, packages: lock.packages.slice(0, 5000) }
            : { ecosystem: 'npm', hash: null, packages: null },
    };
}

/**
 * "@sveltejs/kit" → "sveltekit"; everything else keeps its name.
 *
 * @param {string} name
 */
function layerName(name) {
    return { '@sveltejs/kit': 'sveltekit', '@remix-run/react': 'remix', '@angular/core': 'angular' }[name] ?? name;
}

/**
 * The deploy's environment, from the host's own variables where it sets them.
 *
 * @param {NodeJS.ProcessEnv} env
 */
export function environment(env) {
    if (env.PORRO_ENV) return env.PORRO_ENV;
    if (env.VERCEL_ENV) return env.VERCEL_ENV;
    if (env.CONTEXT) return env.CONTEXT === 'production' ? 'production' : env.CONTEXT; // Netlify
    if (env.CF_PAGES_BRANCH) return env.CF_PAGES_BRANCH === (env.PORRO_PRODUCTION_BRANCH ?? 'main') ? 'production' : 'preview';

    return env.NODE_ENV ?? 'production';
}

/**
 * Things worth knowing about the build, in the same shape as
 * spatie/laravel-health results so Porro raises them as findings.
 *
 * @param {string} dir
 */
export function checks(dir) {
    const found = [];
    const maps = PUBLIC_OUTPUT.map((folder) => join(dir, folder)).filter(existsSync).reduce((total, folder) => total + countMaps(folder), 0);

    if (maps > 0) {
        found.push({
            name: 'Source maps',
            status: 'warning',
            summary: `${maps} published with the site, so anyone can read the original source`,
        });
    }

    return found;
}

/**
 * @param {string} folder
 */
function countMaps(folder, depth = 0) {
    if (depth > 6) return 0;

    let total = 0;

    for (const name of readdirSync(folder)) {
        const path = join(folder, name);

        if (name === 'node_modules') continue;
        if (statSync(path).isDirectory()) total += countMaps(path, depth + 1);
        else if (name.endsWith('.js.map') || name.endsWith('.css.map')) total++;
    }

    return total;
}
