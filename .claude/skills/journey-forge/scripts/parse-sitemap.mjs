#!/usr/bin/env node
// DETERMINISTIC sitemap → page-type clustering + registry diff.
//
// Why deterministic (not agentic): clustering 500+ URLs by eye is unreliable and
// burns tokens. This script gives the skill a stable, reproducible page-type map
// and a precise NEW/UNCHANGED/CHANGED/REMOVED diff so re-runs only touch what moved.
//
// Usage:
//   node parse-sitemap.mjs --sitemap <url> [--min-cluster 5] [--section-depth 2]
//                          [--registry page-types.registry.json]
//                          [--out sitemap-snapshot.json] [--json]
//
// Output: writes the snapshot file, and prints a human summary (or --json for the
// raw { snapshot, diff } the skill consumes).

import { XMLParser } from 'fast-xml-parser';
import { writeFileSync } from 'node:fs';
import { fingerprintPageType, readRegistry, diffPageTypes } from './registry-lib.mjs';

// ---------- args ----------
function parseArgs(argv) {
  const args = {
    minCluster: 5,
    sectionDepth: 2,
    registry: 'page-types.registry.json',
    out: 'sitemap-snapshot.json',
    json: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--sitemap') args.sitemap = argv[++i];
    else if (a === '--min-cluster') args.minCluster = parseInt(argv[++i], 10);
    else if (a === '--section-depth') args.sectionDepth = parseInt(argv[++i], 10);
    else if (a === '--registry') args.registry = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--json') args.json = true;
  }
  if (!args.sitemap) {
    console.error('ERROR: --sitemap <url> is required');
    process.exit(2);
  }
  return args;
}

// ---------- fetch + parse (handles sitemap-index recursion) ----------
async function fetchText(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'journey-forge-sitemap/1.0' } });
  if (!res.ok) throw new Error(`Fetch ${url} -> HTTP ${res.status}`);
  return res.text();
}

const xml = new XMLParser({ ignoreAttributes: true, trimValues: true });

function asArray(x) {
  return x == null ? [] : Array.isArray(x) ? x : [x];
}

async function collectUrls(sitemapUrl, seen = new Set()) {
  if (seen.has(sitemapUrl)) return [];
  seen.add(sitemapUrl);
  const doc = xml.parse(await fetchText(sitemapUrl));

  // sitemap-index: <sitemapindex><sitemap><loc>...</loc></sitemap></sitemapindex>
  if (doc.sitemapindex) {
    const children = asArray(doc.sitemapindex.sitemap).map((s) => s.loc).filter(Boolean);
    const nested = await Promise.all(children.map((c) => collectUrls(c, seen)));
    return nested.flat();
  }
  // urlset: <urlset><url><loc>...</loc></url></urlset>
  if (doc.urlset) {
    return asArray(doc.urlset.url).map((u) => u.loc).filter(Boolean);
  }
  return [];
}

// ---------- clustering ----------
// Goal: turn many URLs into a SMALL set of page TYPES (AEM templates), where every
// page below a section root is the same template regardless of nesting depth.
//
// Algorithm:
//  1. Reduce each URL to a clean path; compute segment depth.
//  2. Find "section roots": a directory with >= minCluster direct leaf children,
//     no deeper than (commonBaseDepth + sectionDepth). The depth cap is what stops
//     deep sub-sections (e.g. /clinics/msk/*) from splintering into their own type —
//     they roll UP to the nearest allowed root (/clinics/**).
//  3. Assign every URL to its DEEPEST root ancestor (most specific section wins);
//     URLs with no root ancestor become singletons.
//  4. A rolled-up section uses pattern `<root>/**`; a singleton uses its exact path.
function toPath(u) {
  try {
    return new URL(u).pathname.replace(/\/+$/, '') || '/';
  } catch {
    return null;
  }
}
const depthOf = (p) => (p === '/' ? 0 : p.split('/').filter(Boolean).length);

function commonBaseDepth(paths) {
  const segLists = paths.map((p) => p.split('/').filter(Boolean));
  if (segLists.length === 0) return 0;
  let d = 0;
  for (let i = 0; ; i++) {
    const seg = segLists[0][i];
    if (seg === undefined) break;
    if (segLists.every((s) => s[i] === seg)) d++;
    else break;
  }
  return d;
}

function clusterUrls(urls, minCluster, sectionDepth) {
  const paths = urls.map(toPath).filter(Boolean);
  const pathSet = new Set(paths);
  const baseDepth = commonBaseDepth(paths);
  const maxRootDepth = baseDepth + sectionDepth;

  // direct leaf children per parent (a child is a "leaf" if no other path extends it)
  const isLeaf = (p) => ![...pathSet].some((q) => q !== p && q.startsWith(p + '/'));
  const directLeafKids = new Map();
  for (const p of paths) {
    const idx = p.lastIndexOf('/');
    const parent = idx <= 0 ? '/' : p.slice(0, idx);
    if (!isLeaf(p)) continue;
    if (!directLeafKids.has(parent)) directLeafKids.set(parent, 0);
    directLeafKids.set(parent, directLeafKids.get(parent) + 1);
  }

  const roots = [];
  for (const [parent, count] of directLeafKids) {
    if (parent === '/') continue;
    if (count >= minCluster && depthOf(parent) <= maxRootDepth) roots.push(parent);
  }
  roots.sort((a, b) => depthOf(b) - depthOf(a)); // deepest first

  const deepestRoot = (p) => roots.find((r) => p === r || p.startsWith(r + '/')) ?? null;

  const pageTypes = {};
  const keyFor = (pattern) =>
    pattern
      .replace(/^\//, '')
      .replace(/\/\*\*$/, '')
      .replace(/\//g, '-')
      .replace(/[^a-z0-9-]/gi, '-') || 'root';

  for (const p of paths) {
    const root = deepestRoot(p);
    const pattern = root ? `${root}/**` : p;
    const matchKind = root ? 'subtree' : 'exact';
    const key = root ? keyFor(pattern) + '-detail' : keyFor(pattern);
    if (!pageTypes[key]) {
      pageTypes[key] = {
        label: labelFor(pattern, matchKind),
        clusterPattern: pattern,
        matchKind,
        urls: new Set(),
        // Type-level risk derives from the SECTION pattern, never from individual
        // member slugs (one "contact-lens" article must not flag 153 news pages).
        risk: looksLikeForm(pattern) ? 'destructive-form' : 'read-only',
      };
    }
    pageTypes[key].urls.add(p);
  }

  // finalize: urlCount, exemplars, fingerprint
  const origin = new URL(urls[0]).origin;
  const finalized = {};
  for (const [key, pt] of Object.entries(pageTypes)) {
    const urlList = [...pt.urls].sort();
    const entry = {
      label: pt.label,
      clusterPattern: pt.clusterPattern,
      matchKind: pt.matchKind,
      urlCount: urlList.length,
      exemplarUrls: urlList.slice(0, 3).map((u) => origin + u),
      risk: pt.risk,
    };
    entry.fingerprint = fingerprintPageType(entry);
    finalized[key] = entry;
  }
  return finalized;
}

// Surface high-value transactional pages so they are never hidden inside a grab-bag
// type — the skill should author a dedicated assert-only journey for each.
function findNotableForms(urls) {
  const origin = new URL(urls[0]).origin;
  return urls
    .map(toPath)
    .filter(Boolean)
    .filter((p) => looksLikeForm(p))
    .map((p) => origin + p);
}

function labelFor(pattern, matchKind) {
  const base = pattern.replace(/\/\*\*$/, '').split('/').filter(Boolean).pop() || 'home';
  const words = base.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return matchKind === 'subtree' ? `${words} detail page` : `${words} page`;
}

// Two-tier so bulk content slugs don't false-positive:
//  - SUBSTRING signals are strongly transactional and rare in article slugs.
//  - EXACT-SEGMENT signals (contact/give/...) only count when they are the whole
//    last path segment, so "contact-lens-health" (a news article) is NOT a form.
const FORM_SUBSTRING = /(appointment|schedule|checkout|payment|billing)/i;
const FORM_EXACT_SEGMENT = new Set([
  'contact', 'give', 'donate', 'apply', 'register', 'signup', 'sign-up', 'subscribe',
]);
function looksLikeForm(path) {
  if (FORM_SUBSTRING.test(path)) return true;
  const last = path.replace(/\/\*\*$/, '').split('/').filter(Boolean).pop() ?? '';
  return FORM_EXACT_SEGMENT.has(last.toLowerCase());
}

// ---------- main ----------
const args = parseArgs(process.argv.slice(2));
const urls = await collectUrls(args.sitemap);
if (urls.length === 0) {
  console.error('ERROR: no <loc> URLs found in sitemap (or nested sitemaps).');
  process.exit(1);
}

const discovered = clusterUrls(urls, args.minCluster, args.sectionDepth);
const notableForms = findNotableForms(urls);
const registry = readRegistry(args.registry);
const existingPaths = new Set(urls.map(toPath).filter(Boolean));
const diff = diffPageTypes(discovered, registry, existingPaths);

const snapshot = {
  sitemapUrl: args.sitemap,
  totalUrls: urls.length,
  minCluster: args.minCluster,
  sectionDepth: args.sectionDepth,
  pageTypeCount: Object.keys(discovered).length,
  notableForms,
  pageTypes: discovered,
};
writeFileSync(args.out, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');

if (args.json) {
  process.stdout.write(JSON.stringify({ snapshot, diff }, null, 2) + '\n');
} else {
  console.log(`\nSitemap: ${args.sitemap}`);
  console.log(`Total URLs: ${urls.length}  ->  ${snapshot.pageTypeCount} page types (min-cluster=${args.minCluster}, section-depth=${args.sectionDepth})\n`);
  const rows = Object.entries(discovered)
    .sort((a, b) => b[1].urlCount - a[1].urlCount)
    .map(([key, pt]) => `  ${String(pt.urlCount).padStart(4)}  ${key.padEnd(34)} ${pt.risk === 'destructive-form' ? '[FORM]' : '      '} ${pt.clusterPattern}`);
  console.log(rows.join('\n'));
  if (notableForms.length) {
    console.log(`\nNotable transactional URLs (author dedicated ASSERT-ONLY journeys):`);
    console.log(notableForms.map((u) => `  - ${u}`).join('\n'));
  }
  console.log(`\nDiff vs registry (${args.registry}):`);
  console.log(`  NEW       (${diff.new.length}): ${diff.new.join(', ') || '-'}`);
  console.log(`  UNCHANGED (${diff.unchanged.length}): ${diff.unchanged.join(', ') || '-'}`);
  console.log(`  CHANGED   (${diff.changed.length}): ${diff.changed.join(', ') || '-'}`);
  console.log(`  REMOVED   (${diff.removed.length}): ${diff.removed.join(', ') || '-'}`);
  console.log(`\nSnapshot written: ${args.out}`);
}
