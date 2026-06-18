#!/usr/bin/env node
// Register a NEW page type that the sitemap clustering didn't carve out on its own — e.g.
// a listing/template you want to split from a subtree, or a one-off page. This is the
// on-ramp for hand-authored journeys: it adds a `page-types.registry.json` entry so the
// type shows up in `forge:status` and flows through the build like any other.
//
// If journeys/<pageType>.journey.md already exists, its frontmatter (exemplarUrl, risk) is
// read and the prose is left untouched. If it doesn't exist, a draft journey is scaffolded
// from a template so you can enrich it in plain English, then `npm run forge:confirm`.
//
// Usage:
//   node add-journey.mjs <pageType> [options]
//     --exemplar <url|path>   exemplar to test (required when creating a new journey;
//                             for an existing journey it's read from frontmatter)
//     --label "<text>"        human-readable label (default: derived from <pageType>)
//     --risk read-only|destructive-form    (default: existing frontmatter, else read-only)
//     --pattern <path>        clusterPattern (default: the exemplar's path)
//     --url-count <n>         how many URLs this type covers (default: 1)
//     --force                 overwrite an existing registry entry (e.g. to re-point it)
//     --registry <path>       (default: page-types.registry.json)
//     --journeys <dir>        (default: journeys)

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseFrontmatter } from './frontmatter.mjs';
import { readRegistry, writeRegistry, fingerprintPageType } from './registry-lib.mjs';

function parseArgs(argv) {
  const a = { urlCount: 1, registry: 'page-types.registry.json', journeys: 'journeys', _: [] };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--exemplar') a.exemplar = argv[++i];
    else if (v === '--label') a.label = argv[++i];
    else if (v === '--risk') a.risk = argv[++i];
    else if (v === '--pattern') a.pattern = argv[++i];
    else if (v === '--url-count') a.urlCount = Number(argv[++i]);
    else if (v === '--force') a.force = true;
    else if (v === '--registry') a.registry = argv[++i];
    else if (v === '--journeys') a.journeys = argv[++i];
    else a._.push(v);
  }
  return a;
}

const args = parseArgs(process.argv.slice(2));
const pageType = args._[0];
if (!pageType) {
  console.error('Usage: add-journey.mjs <pageType> [--exemplar <url>] [--label ..] [--risk ..] [--pattern ..]');
  process.exit(2);
}
if (args.risk && !['read-only', 'destructive-form'].includes(args.risk)) {
  console.error(`--risk must be read-only or destructive-form (got "${args.risk}")`);
  process.exit(2);
}

const titleCase = (s) => s.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const journeyPath = join(args.journeys, `${pageType}.journey.md`);

// 1. Resolve journey: read existing frontmatter, or scaffold a draft.
let exemplar = args.exemplar;
let risk = args.risk;
let journeyExisted = existsSync(journeyPath);

if (journeyExisted) {
  const { data } = parseFrontmatter(readFileSync(journeyPath, 'utf8'));
  exemplar = exemplar ?? data.exemplarUrl;
  risk = risk ?? data.risk;
  if (data.pageType && data.pageType !== pageType) {
    console.error(
      `Journey ${journeyPath} declares pageType "${data.pageType}" but you passed "${pageType}". Fix one so they match.`,
    );
    process.exit(2);
  }
}
risk = risk ?? 'read-only';

if (!exemplar) {
  console.error(`--exemplar <url|path> is required (no journey file to read it from at ${journeyPath}).`);
  process.exit(2);
}

// 2. Resolve the exemplar to an absolute URL + its path. Origin comes from BASE_URL, an
//    absolute --exemplar, or an existing registry entry.
const registry = readRegistry(args.registry) ?? { pageTypes: {} };
registry.pageTypes ??= {};

function resolveOrigin() {
  if (process.env.BASE_URL) return new URL(process.env.BASE_URL).origin;
  if (/^https?:\/\//i.test(exemplar)) return new URL(exemplar).origin;
  const any = Object.values(registry.pageTypes).find((p) => p.exemplarUrls?.[0]);
  if (any) return new URL(any.exemplarUrls[0]).origin;
  return null;
}
const origin = resolveOrigin();
if (!/^https?:\/\//i.test(exemplar) && !origin) {
  console.error('Cannot resolve an absolute exemplar URL. Pass a full https:// URL or set BASE_URL.');
  process.exit(2);
}
const exemplarUrl = /^https?:\/\//i.test(exemplar) ? exemplar : origin + (exemplar.startsWith('/') ? '' : '/') + exemplar;
const exemplarPath = new URL(exemplarUrl).pathname;
const clusterPattern = args.pattern ?? exemplarPath;

// 3. Guard against clobbering a built type.
const existing = registry.pageTypes[pageType];
if (existing && !args.force) {
  console.error(
    `Registry already has "${pageType}" (build status: ${existing.status ?? 'discovered'}).\n` +
      `Re-run with --force to overwrite it, or just edit the journey + ask Claude to rebuild.`,
  );
  process.exit(2);
}

// 4. Scaffold a draft journey if none exists.
if (!journeyExisted) {
  mkdirSync(args.journeys, { recursive: true });
  const label = args.label ?? titleCase(pageType);
  const tmpl = `---
pageType: ${pageType}
exemplarUrl: ${exemplarPath}
risk: ${risk}
status: draft
---

# ${label}

One-line description of this page type.

## Renders core content
The page shows its main heading and the main content region.

<!--
HOW TO ADD A JOURNEY: copy a "## ..." block, describe it in plain English, put visible
link/button text in **bold**, say what should happen. Then \`npm run forge:confirm\` and ask
Claude Code to "build confirmed journeys".
-->
`;
  writeFileSync(journeyPath, tmpl, 'utf8');
}

// 5. Upsert the registry entry. matchKind 'manual' marks a human-managed type that a future
//    `forge:parse` must never report as `removed`.
const entry = {
  label: args.label ?? existing?.label ?? titleCase(pageType),
  clusterPattern,
  matchKind: 'manual',
  urlCount: args.urlCount,
  exemplarUrls: [exemplarUrl],
  risk,
  journeySpec: journeyPath,
  status: existing?.status && args.force ? 'discovered' : existing?.status ?? 'discovered',
};
if (args.force) entry.status = 'discovered';
entry.fingerprint = fingerprintPageType(entry);
registry.pageTypes[pageType] = { ...existing, ...entry };
writeRegistry(args.registry, registry);

console.log(`Registered page type "${pageType}".`);
console.log(`  journey:  ${journeyPath}${journeyExisted ? '' : '  (new draft scaffolded)'}`);
console.log(`  exemplar: ${exemplarUrl}`);
console.log(`  risk:     ${risk}    pattern: ${clusterPattern}`);
console.log('');
if (!journeyExisted) {
  console.log('Next: enrich the draft in plain English, then `npm run forge:confirm -- ' + pageType + '`,');
  console.log('      then ask Claude Code to "build confirmed journeys".');
} else {
  console.log('Next: `npm run forge:status` (it now appears). If confirmed, ask Claude Code to');
  console.log('      "build confirmed journeys"; if still draft, `npm run forge:confirm -- ' + pageType + '` first.');
}
