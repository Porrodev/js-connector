# @porro/js-connector

Porro's connector for JavaScript sites. It sends a signed, read-only report to [Porro](https://porro.dev) on every build: the framework and Node versions, and the packages in your lock file, so Porro can raise security advisories, updates waiting and versions past support.

It runs at build time, so it works wherever you build: Forge, Laravel Cloud, Cloudflare Pages, Vercel, Netlify or your own CI. Nothing connects into your site, and nothing runs in production.

## Install

```bash
npm install --save-dev @porro/js-connector
npx @porro/js-connector connect porro_your_site_key
```

`connect` sends the first report and adds `&& porro-connector` to your `build` script. Commit that change.

Then add the key to your host's **production** environment variables, not the repo:

```
PORRO_KEY=porro_your_site_key
```

Every production build reports to Porro. A build without `PORRO_KEY` (your machine, preview deploys) skips it, and a failed report never fails your build.

## What it sends

- Node's version, and the framework's (Nuxt, Next, Astro, SvelteKit, Remix, Angular, Vue, React, Svelte or Vite)
- The deploy environment (from `VERCEL_ENV`, Netlify's `CONTEXT`, `CF_PAGES_BRANCH` or `NODE_ENV`; set `PORRO_ENV` to override)
- Each package's name and version from `package-lock.json`, `pnpm-lock.yaml` or `yarn.lock`, and whether it's direct or dev
- A SHA-256 of the lock file
- Whether source maps are published with the site

Never: source code, the lock file itself, environment variable values or secrets. Run `npx @porro/js-connector --dry-run` to see exactly what would be sent.

Advisories are matched on Porro's side against the latest lock file it has, so a new advisory raises an alert without waiting for your next build.

## Options

| Option | |
| --- | --- |
| `--dry-run` | Print the report instead of sending it |
| `--url=<url>` or `PORRO_URL` | Porro's address, if not `https://app.porro.dev` |
| `--dir=<path>` | Project folder, if not the current one |

Reports are signed with Ed25519 using your site key, the same scheme as Porro's [PHP connectors](https://github.com/Porrodev/php-core).

## Licence

MIT
