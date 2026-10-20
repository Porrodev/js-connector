import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { report, VERSION } from './index.js';
import { buildReport } from './report.js';
import { DEFAULT_URL } from './send.js';

const HELP = `porro-report ${VERSION}

Sends a signed, read-only report about this project's packages and runtime
to Porro. Nothing connects into your site.

  porro-report                     Report this build (reads PORRO_KEY)
  porro-report connect <key>       Send the first report and add the build hook
  porro-report --dry-run           Print the report instead of sending it

Options
  --url=<url>     Porro's address (default ${DEFAULT_URL}, or PORRO_URL)
  --dir=<path>    Project folder (default: current folder)
`;

/**
 * @param {string[]} argv
 * @param {{ env: NodeJS.ProcessEnv, cwd: string, fetch?: typeof fetch, log?: (s: string) => void }} context
 * @returns {Promise<number>} exit code
 */
export async function run(argv, { env, cwd, fetch, log = (s) => process.stdout.write(`${s}\n`) }) {
    const args = argv.filter((a) => !a.startsWith('--'));
    const flag = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
    const has = (name) => argv.includes(`--${name}`);
    const dir = flag('dir') ? join(cwd, flag('dir')) : cwd;
    const url = flag('url') ?? env.PORRO_URL ?? DEFAULT_URL;

    if (has('help') || args[0] === 'help') {
        log(HELP);
        return 0;
    }

    if (has('dry-run')) {
        log(JSON.stringify(buildReport({ dir, trigger: 'manual', version: VERSION, env }), null, 2));
        return 0;
    }

    try {
        if (args[0] === 'connect') {
            return await connect(args[1], { dir, url, fetch, log, defaultUrl: url === DEFAULT_URL });
        }

        // A build without a key (local, or a preview deploy) is fine: skip.
        if (!env.PORRO_KEY) {
            log('porro-report: no PORRO_KEY set, skipping. Set it in your host’s production environment.');
            return 0;
        }

        const { report: sent } = await report({ dir, token: env.PORRO_KEY, url, trigger: 'deploy', fetch });
        log(`porro-report: sent ${sent.lock.packages?.length ?? 0} packages to Porro.`);

        return 0;
    } catch (error) {
        log(`porro-report: ${error.message}`);

        // Never fail someone's deploy over a report. Only connect, which a
        // person runs by hand, exits with an error.
        return args[0] === 'connect' ? 1 : 0;
    }
}

async function connect(token, { dir, url, fetch, log, defaultUrl }) {
    if (!token) {
        log('Usage: porro-report connect <site key>   (the porro_… key from Porro)');
        return 1;
    }

    const { report: sent } = await report({ dir, token, url, trigger: 'connect', fetch });
    log(`✓ First report sent: ${sent.lock.packages?.length ?? 0} packages${sent.layers[0] ? `, ${sent.layers[0].name} ${sent.layers[0].version}` : ''}.`);

    if (addBuildHook(dir)) {
        log('✓ Added "&& porro-report" to your build script in package.json. Commit it.');
    } else {
        log('✓ package.json already runs porro-report after each build.');
    }

    log('');
    log('Last step: add these to your host’s production environment variables');
    log('(Forge, Laravel Cloud, Cloudflare, Vercel, Netlify…), not to the repo:');
    log('');
    log(`  PORRO_KEY=${token}`);
    if (!defaultUrl) log(`  PORRO_URL=${url}`);
    log('');
    log('Every production build then reports to Porro. Builds without the key skip it.');

    return 0;
}

/**
 * Run porro-report after every build.
 *
 * @param {string} dir
 * @returns {boolean} whether package.json changed
 */
export function addBuildHook(dir) {
    const file = join(dir, 'package.json');
    const raw = readFileSync(file, 'utf8');
    const manifest = JSON.parse(raw);
    const scripts = (manifest.scripts ??= {});

    if (Object.values(scripts).some((s) => String(s).includes('porro-report'))) return false;

    // Appended to the build script itself: pnpm and Yarn 2+ skip "post"
    // hooks by default, but every package manager runs this.
    if (scripts.build) {
        scripts.build = `${scripts.build} && porro-report`;
    } else {
        scripts.postbuild = 'porro-report';
    }

    const indent = /^(\s+)"/m.exec(raw)?.[1] ?? '  ';
    writeFileSync(file, `${JSON.stringify(manifest, null, indent)}\n`);

    return true;
}
