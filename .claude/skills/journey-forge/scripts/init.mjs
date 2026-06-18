#!/usr/bin/env node
// One-command bootstrap. Encapsulates the deterministic setup so a human types ONE line
// instead of scaffold → npm install → playwright install → parse. Run it directly with
// `node` (works even in a fresh repo that has no package.json yet — this is what creates
// it). Cross-platform (uses shell:true so npm/npx resolve on Windows too).
//
// Usage:
//   node .claude/skills/journey-forge/scripts/init.mjs --base-url https://example.org \
//        [--sitemap https://example.org/sitemap.xml] [--name my-e2e] \
//        [--skip-install] [--skip-browser]
//
// After it finishes, ask Claude Code: "Run journey-forge for <sitemap>" to author journeys.

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

function getFlag(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (name) => process.argv.includes(name);

const baseUrl = getFlag('--base-url');
const sitemap = getFlag('--sitemap');
const name = getFlag('--name');
if (!baseUrl) {
  console.error('ERROR: --base-url <url> is required.');
  console.error('Usage: node init.mjs --base-url <url> [--sitemap <url>] [--name <pkg>] [--skip-install] [--skip-browser]');
  process.exit(2);
}

// Resolve npm/npx to their .cmd shims on Windows so we can spawn WITHOUT shell:true
// (shell:true concatenates args unescaped — an injection risk on user-supplied URLs).
const isWin = process.platform === 'win32';
const bin = (name) => (isWin && (name === 'npm' || name === 'npx') ? `${name}.cmd` : name);

function run(label, cmd, args, { soft = false } = {}) {
  console.log(`\n▶ ${label}\n  ${cmd} ${args.join(' ')}`);
  const res = spawnSync(bin(cmd), args, { stdio: 'inherit', shell: false, cwd: process.cwd() });
  if (res.status !== 0) {
    if (soft) {
      console.warn(`\n⚠ ${label} did not complete (exit ${res.status}). The harness is still set up — re-run this step manually later.`);
      return false;
    }
    console.error(`\n✗ Step failed: ${label} (exit ${res.status}). Fix the error above and re-run init.`);
    process.exit(res.status ?? 1);
  }
  return true;
}

// 1. Scaffold the harness (writes package.json + config + fixtures + BasePage, idempotent).
const scaffoldArgs = ['--base-url', baseUrl];
if (name) scaffoldArgs.push('--name', name);
run('Scaffold harness', 'node', [join(HERE, 'scaffold.mjs'), ...scaffoldArgs]);

// 2. Install dependencies.
if (!has('--skip-install')) run('Install dependencies', 'npm', ['install']);
else console.log('\n• Skipping npm install (--skip-install)');

// 3. Install the Chromium browser binary.
if (!has('--skip-browser')) run('Install Chromium', 'npx', ['playwright', 'install', 'chromium']);
else console.log('\n• Skipping browser install (--skip-browser)');

// 4. Discover page types — only if a sitemap was given AND deps were installed
//    (the parser needs fast-xml-parser). Soft: a network hiccup here must not fail the
//    whole bootstrap, since scaffold + install already succeeded.
if (sitemap && !has('--skip-install')) {
  run('Parse + cluster sitemap', 'node', [join(HERE, 'parse-sitemap.mjs'), '--sitemap', sitemap], { soft: true });
} else if (sitemap) {
  console.log('\n• Skipping sitemap parse (deps not installed via --skip-install). Run `npm run forge:parse -- --sitemap <url>` after `npm install`.');
}

console.log('\n✅ Bootstrap complete.');
console.log('\nNext:');
if (!sitemap) {
  console.log('  • node .claude/skills/journey-forge/scripts/parse-sitemap.mjs --sitemap <your-sitemap-url>');
}
console.log('  • In Claude Code: "Run journey-forge for <sitemap-url>"  (authors journey drafts)');
console.log('  • Review journeys/, then: npm run forge:confirm -- --all');
console.log('  • In Claude Code: "Build all confirmed journeys"  →  npm test');
