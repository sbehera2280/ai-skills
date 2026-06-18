#!/usr/bin/env node
// Bootstraps a target project with the Playwright harness bundled inside this skill.
// Idempotent: writes each file ONLY if it is absent, so it is safe to re-run and never
// clobbers a project's customizations. This is what makes the skill self-contained —
// drop the skill folder into any repo and `forge:scaffold` stands up the harness.
//
// Usage:
//   node scaffold.mjs --base-url https://example.org [--name my-e2e]

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(HERE, '..', 'assets', 'scaffold');
const TARGET = process.cwd();

function parseArgs(argv) {
  const a = { name: 'sitemap-e2e' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--base-url') a.baseUrl = argv[++i];
    else if (argv[i] === '--name') a.name = argv[++i];
  }
  if (!a.baseUrl) {
    console.error('ERROR: --base-url <url> is required');
    process.exit(2);
  }
  return a;
}

const args = parseArgs(process.argv.slice(2));
const subst = (s) =>
  s
    .replaceAll('{{BASE_URL}}', args.baseUrl)
    .replaceAll('{{PROJECT_NAME}}', args.name);

const created = [];
const skipped = [];

// (assetRelPath, targetRelPath, isTemplate)
const files = [
  ['package.json.tmpl', 'package.json', true],
  ['playwright.config.ts', 'playwright.config.ts', true],
  ['tsconfig.json', 'tsconfig.json', false],
  ['env.example', '.env.example', true],
  ['gitignore', '.gitignore', false],
  ['fixtures/test-fixtures.ts', 'fixtures/test-fixtures.ts', false],
  ['fixtures/a11y.ts', 'fixtures/a11y.ts', false],
  ['pages/BasePage.ts', 'pages/BasePage.ts', false],
  ['a11y-baseline.json', 'a11y-baseline.json', false],
  ['accessibility.spec.ts', 'tests/accessibility.spec.ts', false],
];

for (const [src, dest, isTmpl] of files) {
  const out = join(TARGET, dest);
  if (existsSync(out)) {
    skipped.push(dest);
    continue;
  }
  mkdirSync(dirname(out), { recursive: true });
  let content = readFileSync(join(ASSETS, src), 'utf8');
  if (isTmpl) content = subst(content);
  writeFileSync(out, content, 'utf8');
  created.push(dest);
}

// Ensure the output directories exist.
for (const d of ['journeys', 'pages', 'tests', 'fixtures']) {
  const p = join(TARGET, d);
  if (!existsSync(p)) {
    mkdirSync(p, { recursive: true });
    created.push(d + '/');
  }
}

console.log('Scaffold complete.');
console.log('  created:', created.length ? created.join(', ') : '(none)');
console.log('  skipped (already present):', skipped.length ? skipped.join(', ') : '(none)');
console.log('\nNext: npm install && npx playwright install chromium');
console.log('Then: npm run forge:parse -- --sitemap <your-sitemap-url>');
