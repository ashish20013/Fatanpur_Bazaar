#!/usr/bin/env node
// Builds the two folders (and zips) that go to Hostinger:
//
//   release/api/   → api.<domain>   entry: dist/main.js   (Hostinger runs `npm install` here)
//   release/web/   → <domain>       entry: server.js      (everything already inside — no install)
//
// Why a script instead of "upload the repo": the server must never build (a Next build peaks at
// ~850 MB — HOSTING_CAPACITY §5), and the API's package.json points at a workspace package
// (@fb/shared-types) that npm on the server cannot find. Here that package is vendored next to
// the API and referenced as `file:`, so a plain `npm install` on the server works.
//
// Usage (on your own computer, after `npm ci`):
//   node scripts/make-release.mjs           → builds both apps, then packs
//   node scripts/make-release.mjs --no-build → packs what is already built
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const out = join(root, 'release');
const run = (cmd, cwd = root) => execSync(cmd, { cwd, stdio: 'inherit' });
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

if (!process.argv.includes('--no-build')) {
  // One after the other, never together — two builds at once is what runs a small box out of RAM.
  run('npm run build:api');
  run('npm run build --workspace=apps/web');
}

for (const need of ['apps/api/dist/main.js', 'packages/shared-types/dist/index.js', 'apps/web/.next/standalone/apps/web/server.js']) {
  if (!existsSync(join(root, need))) {
    console.error(`✖ ${need} नहीं मिला — पहले build चलाएँ (या --no-build हटा दें)।`);
    process.exit(1);
  }
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// ───────────────────────────── API ─────────────────────────────
const api = join(out, 'api');
cpSync(join(root, 'apps/api/dist'), join(api, 'dist'), { recursive: true });
const vendor = join(api, 'vendor/shared-types');
cpSync(join(root, 'packages/shared-types/dist'), join(vendor, 'dist'), { recursive: true });
const st = readJson(join(root, 'packages/shared-types/package.json'));
writeFileSync(join(vendor, 'package.json'), JSON.stringify({ name: st.name, version: st.version, private: true, main: st.main, types: st.types }, null, 2));

const apiPkg = readJson(join(root, 'apps/api/package.json'));
const deps = { ...apiPkg.dependencies, '@fb/shared-types': 'file:./vendor/shared-types' };
writeFileSync(
  join(api, 'package.json'),
  JSON.stringify(
    {
      name: 'fatanpur-api',
      version: apiPkg.version,
      private: true,
      main: 'dist/main.js',
      engines: { node: '>=22' },
      scripts: {
        start: 'node dist/main.js',
        migrate: 'node dist/cli.js migrate',
        seed: 'node dist/cli.js seed',
        'seed:admin': 'node dist/cli.js seed-admin',
        cron: 'node dist/cli.js cron',
        doctor: 'node dist/cli.js doctor',
      },
      dependencies: deps,
    },
    null,
    2,
  ),
);
cpSync(join(root, 'apps/api/.env.example'), join(api, '.env.example'));

// Seed storage files (category photos) — the deploy copies them into the shared storage
// directory so that seeded DB paths resolve to real files on disk.
const seedCat = join(root, 'apps/api/storage/uploads/categories/seed');
if (existsSync(seedCat)) cpSync(seedCat, join(api, 'storage-seed/uploads/categories/seed'), { recursive: true });

// ───────────────────────────── WEB ─────────────────────────────
// Next's standalone output keeps the monorepo shape (apps/web/server.js + node_modules at the top).
// Flattened here so the entry is simply server.js, with the traced node_modules beside it.
const web = join(out, 'web');
const sa = join(root, 'apps/web/.next/standalone');
cpSync(join(sa, 'apps/web'), web, { recursive: true });
cpSync(join(sa, 'node_modules'), join(web, 'node_modules'), { recursive: true, verbatimSymlinks: true });
cpSync(join(root, 'apps/web/public'), join(web, 'public'), { recursive: true });
cpSync(join(root, 'apps/web/.next/static'), join(web, '.next/static'), { recursive: true });
// The standalone package.json is the monorepo's — replace it with one that has nothing to install,
// so a panel that runs `npm install` anyway finds nothing to add and nothing to prune.
const traced = Object.fromEntries(
  ['next', 'react', 'react-dom', 'sharp'].filter((n) => existsSync(join(web, 'node_modules', n, 'package.json'))).map((n) => [n, readJson(join(web, 'node_modules', n, 'package.json')).version]),
);
writeFileSync(join(web, 'package.json'), JSON.stringify({ name: 'fatanpur-web', private: true, main: 'server.js', engines: { node: '>=22' }, scripts: { start: 'node server.js' }, dependencies: traced }, null, 2));
rmSync(join(web, '.env.local'), { force: true }); // never ship the developer's secrets
rmSync(join(web, '.env'), { force: true });
cpSync(join(root, 'apps/web/.env.example'), join(web, '.env.example'));

// Next.js loadEnvConfig() loads .env.production at startup (priority 4). Without it the server
// has no API_INTERNAL_URL and falls back to the public URL for server→API calls — that fails
// on Hostinger because the server cannot reach its own public domain, breaking ISR revalidation
// (sitemap, product pages, etc.). rsync excludes .env and .env.local but NOT .env.production.
writeFileSync(
  join(web, '.env.production'),
  [
    '# Auto-generated by make-release.mjs — runtime env for the Next.js standalone server.',
    '# Next.js loads this via loadEnvConfig() when NODE_ENV=production.',
    '# NEXT_PUBLIC_* vars are already inlined in the client bundle at build time;',
    '# these are here so server-side code (ISR, rewrites, API calls) resolves them at runtime too.',
    '',
    '# Hostinger shared hosting: Passenger assigns dynamic ports, so localhost:3000 does NOT',
    '# reach the API. Use the public URL — adds a TLS hop but is the only reliable path.',
    'API_INTERNAL_URL=https://api.fatanpurbazaar.com',
    '',
    '# Public URLs — must match what was inlined during CI build.',
    'NEXT_PUBLIC_API_URL=https://api.fatanpurbazaar.com',
    'NEXT_PUBLIC_SITE_URL=https://fatanpurbazaar.com',
    '',
  ].join('\n'),
);

// ───────────────────────────── zips ─────────────────────────────
try {
  run('zip -qr ../fatanpur-api.zip . -x "node_modules/*"', api);
  run('zip -qry ../fatanpur-web.zip .', web);
  console.log('\n✔ release/fatanpur-api.zip  → api.<डोमेन> (Node.js app, entry: dist/main.js)');
  console.log('✔ release/fatanpur-web.zip  → <डोमेन>     (Node.js app, entry: server.js)');
} catch {
  console.log('\n(zip नहीं मिला — release/api और release/web फ़ोल्डर को खुद zip कर लें)');
}
