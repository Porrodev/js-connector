import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * @typedef {{ name: string, version: string, dev: boolean, direct: boolean }} Package
 * @typedef {{ file: string, hash: string, packages: Package[] }} Lock
 */

const FILES = ['package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock'];

/**
 * Read the project's lock file. Only names, versions and whether each
 * package is direct or dev leave the machine; the file itself never does.
 *
 * @param {string} dir
 * @param {{ dependencies?: object, devDependencies?: object, optionalDependencies?: object }} manifest package.json
 * @returns {Lock | null}
 */
export function readLock(dir, manifest) {
    const file = FILES.find((name) => existsSync(join(dir, name)));

    if (!file) return null;

    const raw = readFileSync(join(dir, file), 'utf8');
    const direct = new Set([
        ...Object.keys(manifest.dependencies ?? {}),
        ...Object.keys(manifest.optionalDependencies ?? {}),
        ...Object.keys(manifest.devDependencies ?? {}),
    ]);
    const devDirect = new Set(Object.keys(manifest.devDependencies ?? {}));

    const parsed =
        file === 'pnpm-lock.yaml'
            ? parsePnpm(raw)
            : file === 'yarn.lock'
              ? parseYarn(raw)
              : parseNpm(raw);

    const packages = unique(parsed).map((pkg) => ({
        name: pkg.name,
        version: pkg.version,
        // Lock files that don't mark dev packages fall back to package.json
        // for the direct ones.
        dev: pkg.dev ?? devDirect.has(pkg.name),
        direct: direct.has(pkg.name) && (pkg.topLevel ?? true),
    }));

    return {
        file,
        hash: createHash('sha256').update(raw, 'utf8').digest('hex'),
        packages,
    };
}

/**
 * package-lock.json v2/v3 (and v1 as a fallback).
 *
 * @param {string} raw
 */
export function parseNpm(raw) {
    const lock = JSON.parse(raw);
    const out = [];

    if (lock.packages) {
        for (const [path, entry] of Object.entries(lock.packages)) {
            // "" is the project itself; links point at workspace folders.
            if (!path || entry.link || !entry.version) continue;

            const name = entry.name ?? path.slice(path.lastIndexOf('node_modules/') + 13);
            const topLevel = path === `node_modules/${name}`;

            out.push({ name, version: entry.version, dev: Boolean(entry.dev), topLevel });
        }

        return out;
    }

    // v1: a nested "dependencies" tree.
    const walk = (deps, depth) => {
        for (const [name, entry] of Object.entries(deps ?? {})) {
            if (entry.version && !entry.version.startsWith('file:')) {
                out.push({ name, version: entry.version, dev: Boolean(entry.dev), topLevel: depth === 0 });
            }
            walk(entry.dependencies, depth + 1);
        }
    };
    walk(lock.dependencies, 0);

    return out;
}

/**
 * pnpm-lock.yaml v6–v9: the "packages:" keys carry name and version.
 *
 * @param {string} raw
 */
export function parsePnpm(raw) {
    const out = [];
    let inPackages = false;
    let current = null;

    for (const line of raw.split('\n')) {
        if (/^\S/.test(line)) {
            inPackages = line.startsWith('packages:');
            current = null;
            continue;
        }

        if (!inPackages) continue;

        // Two-space keys: "  /name@1.2.3:", "  '@scope/name@1.2.3(peer@1)':"
        const key = /^ {2}(['"]?)\/?(.+?)\1:\s*$/.exec(line);

        if (key) {
            const spec = key[2].replace(/\(.*$/, '');
            const at = spec.lastIndexOf('@');

            current = at > 0 ? { name: spec.slice(0, at), version: spec.slice(at + 1) } : null;
            if (current) out.push(current);
            continue;
        }

        // v6 marks dev-only packages.
        if (current && /^ {4}dev: true/.test(line)) current.dev = true;
        if (current && /^ {4}dev: false/.test(line)) current.dev = false;
    }

    return out.filter((pkg) => /^\d/.test(pkg.version));
}

/**
 * yarn.lock, classic (v1) or Berry (v2+).
 *
 * @param {string} raw
 */
export function parseYarn(raw) {
    const out = [];
    let name = null;

    for (const line of raw.split('\n')) {
        if (/^\S/.test(line) && !line.startsWith('#') && line.trim().endsWith(':')) {
            // '"@scope/name@npm:^1.0.0", "@scope/name@npm:^1.1.0":' → '@scope/name'
            const first = line.split(',')[0].replace(/^"|"?:?\s*$/g, '').replace(/"$/, '');
            const at = first.indexOf('@', 1);

            name = at > 0 ? first.slice(0, at) : null;
            if (name === '__metadata') name = null;
            continue;
        }

        const version = /^ {2}version:? "?([^"\s]+)"?/.exec(line);

        if (name && version) {
            // Berry lists the project and workspaces too, as 0.0.0-use.local.
            if (!version[1].includes('use.local')) out.push({ name, version: version[1] });
            name = null;
        }
    }

    return out;
}

/**
 * One entry per name and version, preferring the top-level copy's flags.
 *
 * @param {Array<Package & { topLevel?: boolean }>} packages
 */
function unique(packages) {
    const seen = new Map();

    for (const pkg of packages) {
        const key = `${pkg.name}@${pkg.version}`;
        const existing = seen.get(key);

        if (!existing || (pkg.topLevel && !existing.topLevel)) seen.set(key, pkg);
    }

    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
}
