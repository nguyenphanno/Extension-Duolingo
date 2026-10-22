/**
 * AddCopyright.mjs — stamps every source file with the project's copyright line.
 *
 * Idempotent by design: a file that already mentions the holder is skipped, so
 * this can run on every build without stacking headers. JSON is skipped because
 * it has no comment syntax, and `dist/` is never touched.
 *
 * Usage:  node Scripts/AddCopyright.mjs [--check]
 *         --check exits 1 if any file is missing the header (CI-friendly).
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, extname } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const HOLDER = 'github.com/nguyenphanno';
const LINE = 'Copyright github.com/nguyenphanno © 2026. All rights reserved';

/** Which trees to walk, and which extensions carry comments. */
const TARGETS = [
  { dir: 'src', ext: ['.ts', '.tsx', '.css', '.html'] },
  { dir: 'Scripts', ext: ['.mjs', '.js'] },
];

const CHECK = process.argv.includes('--check');

/** Comment syntax per extension. */
function commentFor(file) {
  switch (extname(file)) {
    case '.css':
      return `/* ${LINE} */`;
    case '.html':
      return `<!-- ${LINE} -->`;
    default:
      return `// ${LINE}`;
  }
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function collect() {
  const files = [];
  for (const target of TARGETS) {
    for (const file of walk(join(ROOT, target.dir))) {
      if (target.ext.includes(extname(file))) files.push(file);
    }
  }
  return files;
}

function main() {
  const files = collect();
  const missing = [];
  let stamped = 0;

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    if (source.includes(HOLDER)) continue;
    missing.push(relative(ROOT, file));
    if (CHECK) continue;

    // Keep any shebang first — a comment above it would break execution.
    if (source.startsWith('#!')) {
      const newline = source.indexOf('\n');
      const head = source.slice(0, newline + 1);
      writeFileSync(file, `${head}${commentFor(file)}\n${source.slice(newline + 1)}`);
    } else {
      writeFileSync(file, `${commentFor(file)}\n${source}`);
    }
    stamped += 1;
  }

  if (CHECK) {
    if (missing.length) {
      console.error(`[copyright] ${missing.length} file(s) missing the header:`);
      for (const file of missing) console.error(`  ${file}`);
      process.exit(1);
    }
    console.log(`[copyright] all ${files.length} file(s) carry the header.`);
    return;
  }

  console.log(`[copyright] stamped ${stamped} file(s), ${files.length - stamped} already had it.`);
}

main();
