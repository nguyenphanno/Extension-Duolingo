/**
 * Build.mjs — single-pass bundler for the MV3 extension.
 *
 * Why not a full framework CLI? Extension bundles need three different output
 * shapes (IIFE for the service worker + content script, IIFE pages for the
 * React apps) and every artifact must land in a flat `dist/` root so the
 * manifest paths stay trivial. esbuild does that in one call, in ~50ms.
 *
 * Usage:  node Scripts/Build.mjs [--watch]
 */
import * as esbuild from 'esbuild';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const DIST = join(ROOT, 'dist');
const WATCH = process.argv.includes('--watch');

/** Every entry emits `<Name>.js` (+ `<Name>.css` when the graph imports CSS). */
const ENTRIES = {
  Popup: 'src/Apps/Popup/PopupMain.tsx',
  Options: 'src/Apps/Options/OptionsMain.tsx',
  SidePanel: 'src/Apps/SidePanel/SidePanelMain.tsx',
  Preview: 'src/Apps/Preview/PreviewMain.tsx',
  ServiceWorker: 'src/Background/ServiceWorker.ts',
  ContentScript: 'src/Content/ContentScript.ts',
};

const HTML_APPS = ['Popup', 'Options', 'SidePanel', 'Preview'];

const ALIAS = {
  '@Shared': join(ROOT, 'src/Shared'),
  '@Core': join(ROOT, 'src/Core'),
  '@Ui': join(ROOT, 'src/Ui'),
  '@Background': join(ROOT, 'src/Background'),
};

function syncStatic() {
  if (!WATCH) rmSync(DIST, { recursive: true, force: true });
  mkdirSync(DIST, { recursive: true });

  for (const app of HTML_APPS) {
    const from = join(ROOT, 'src/Apps', app, `${app}.html`);
    if (existsSync(from)) cpSync(from, join(DIST, `${app}.html`));
  }

  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const manifest = JSON.parse(readFileSync(join(ROOT, 'src/Manifest/Manifest.json'), 'utf8'));
  manifest.version = pkg.version;
  writeFileSync(join(DIST, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  if (existsSync(join(ROOT, 'public'))) {
    cpSync(join(ROOT, 'public'), DIST, { recursive: true });
  }
}

/** @type {import('esbuild').BuildOptions} */
const buildOptions = {
  entryPoints: ENTRIES,
  outdir: DIST,
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome114', 'edge114'],
  jsx: 'automatic',
  charset: 'utf8',
  alias: ALIAS,
  entryNames: '[name]',
  assetNames: 'assets/[name]-[hash]',
  loader: {
    '.woff2': 'file',
    '.woff': 'file',
    '.png': 'file',
    '.svg': 'file',
  },
  define: {
    'process.env.NODE_ENV': WATCH ? '"development"' : '"production"',
  },
  minify: !WATCH,
  sourcemap: WATCH ? 'inline' : false,
  legalComments: 'none',
  logLevel: 'info',
  metafile: true,
};

async function main() {
  syncStatic();

  if (WATCH) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log('\n[duo] watching — load "dist/" as an unpacked extension.\n');
  } else {
    const result = await esbuild.build(buildOptions);
    const bytes = Object.values(result.metafile.outputs).reduce((sum, o) => sum + o.bytes, 0);
    console.log(`\n[duo] build ok — ${(bytes / 1024).toFixed(1)} kB in dist/\n`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
