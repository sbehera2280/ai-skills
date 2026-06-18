#!/usr/bin/env node
// Reports the lifecycle state of every page type so a human (and the skill) can see at a
// glance what needs review and what is ready to build. Two independent axes:
//   - journeyStatus (in journeys/<type>.journey.json):  none | draft | confirmed
//       the HUMAN REVIEW GATE. Drafts await review; confirmed are approved to build.
//   - buildStatus (in page-types.registry.json):        discovered | generated | passing | failing
//       what codegen + the verify loop has produced.
//
// "Ready to build" = journeyStatus=confirmed AND buildStatus != passing.
//
// Usage: node forge-status.mjs [--registry page-types.registry.json] [--journeys journeys] [--json]

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseFrontmatter } from './frontmatter.mjs';

function mtime(path) {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : def;
}
const registryPath = arg('--registry', 'page-types.registry.json');
const journeysDir = arg('--journeys', 'journeys');
const asJson = process.argv.includes('--json');

const registry = existsSync(registryPath)
  ? JSON.parse(readFileSync(registryPath, 'utf8'))
  : { pageTypes: {} };

const journeyByType = {};
if (existsSync(journeysDir)) {
  for (const f of readdirSync(journeysDir)) {
    if (!f.endsWith('.journey.md')) continue;
    const path = join(journeysDir, f);
    try {
      const { data } = parseFrontmatter(readFileSync(path, 'utf8'));
      if (data.pageType) journeyByType[data.pageType] = { status: data.status ?? 'draft', path };
    } catch {
      // ignore malformed journey file
    }
  }
}

const rows = Object.entries(registry.pageTypes ?? {}).map(([key, pt]) => {
  const journey = journeyByType[key];
  const journeyStatus = journey?.status ?? 'none';
  const buildStatus = pt.status ?? 'discovered';
  // A confirmed journey edited AFTER its spec was generated needs a rebuild even if it
  // was previously passing — so enriching a journey in plain English re-flags it.
  const changedSinceBuild =
    journeyStatus === 'confirmed' && !!pt.spec && mtime(journey.path) > mtime(pt.spec);
  const readyToBuild =
    journeyStatus === 'confirmed' && (buildStatus !== 'passing' || changedSinceBuild);
  const needsReview = journeyStatus === 'draft';
  return { pageType: key, urlCount: pt.urlCount ?? 0, risk: pt.risk ?? 'read-only', journeyStatus, buildStatus, readyToBuild, needsReview, changedSinceBuild };
});

// Journey files on disk with no registry entry — they won't build until registered.
const registeredTypes = new Set(Object.keys(registry.pageTypes ?? {}));
const unregistered = Object.keys(journeyByType).filter((t) => !registeredTypes.has(t));

const summary = {
  total: rows.length,
  needJourneyAuthoring: rows.filter((r) => r.journeyStatus === 'none').length,
  awaitingReview: rows.filter((r) => r.needsReview).length,
  readyToBuild: rows.filter((r) => r.readyToBuild).length,
  passing: rows.filter((r) => r.buildStatus === 'passing').length,
  unregistered,
};

if (asJson) {
  process.stdout.write(JSON.stringify({ summary, rows }, null, 2) + '\n');
} else {
  console.log('\n  pageType                              urls  risk             journey     build');
  console.log('  ' + '-'.repeat(86));
  for (const r of rows.sort((a, b) => b.urlCount - a.urlCount)) {
    const flag = r.changedSinceBuild
      ? ' <- edited, rebuild'
      : r.readyToBuild
        ? ' <- ready to build'
        : r.needsReview
          ? ' <- review'
          : '';
    console.log(
      `  ${r.pageType.padEnd(36)} ${String(r.urlCount).padStart(4)}  ${r.risk.padEnd(16)} ${r.journeyStatus.padEnd(11)} ${r.buildStatus}${flag}`,
    );
  }
  console.log(
    `\n  ${summary.total} types | ${summary.needJourneyAuthoring} need journey | ${summary.awaitingReview} awaiting review | ${summary.readyToBuild} ready to build | ${summary.passing} passing`,
  );
  if (unregistered.length) {
    console.log(
      `\n  ⚠ ${unregistered.length} unregistered journey(s) — not in the registry, won't build:`,
    );
    for (const t of unregistered) console.log(`      ${t}   → npm run forge:add -- ${t}`);
  }
  console.log('');
}
