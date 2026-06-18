#!/usr/bin/env node
// Flip a journey's review gate from "draft" to "confirmed" (or back). Confirmed journeys
// are the input to the agentic codegen phase. This is the explicit, version-controlled
// human approval step — the diff shows up in a PR.
//
// Journeys are natural-language markdown (journeys/<type>.journey.md) with a small
// frontmatter block; this only touches the `status:` field, never the prose.
//
// Usage:
//   node confirm.mjs --all                     # confirm every draft journey
//   node confirm.mjs <pageType> [<pageType>..] # confirm specific page types
//   node confirm.mjs --unconfirm <pageType>    # send back to draft

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseFrontmatter, setFrontmatterKey } from './frontmatter.mjs';

const journeysDir = 'journeys';
const args = process.argv.slice(2);
const all = args.includes('--all');
const unconfirm = args.includes('--unconfirm');
const targetStatus = unconfirm ? 'draft' : 'confirmed';
const types = args.filter((a) => !a.startsWith('--'));

if (!existsSync(journeysDir)) {
  console.error(`No ${journeysDir}/ directory found.`);
  process.exit(1);
}
if (!all && types.length === 0) {
  console.error('Usage: confirm.mjs --all | <pageType> [...] | --unconfirm <pageType>');
  process.exit(2);
}

const changed = [];
for (const f of readdirSync(journeysDir)) {
  if (!f.endsWith('.journey.md')) continue;
  const path = join(journeysDir, f);
  const text = readFileSync(path, 'utf8');
  const { data } = parseFrontmatter(text);
  const match = all || types.includes(data.pageType);
  if (!match) continue;
  if ((data.status ?? 'draft') !== targetStatus) {
    writeFileSync(path, setFrontmatterKey(text, 'status', targetStatus), 'utf8');
    changed.push(`${data.pageType} -> ${targetStatus}`);
  }
}

console.log(changed.length ? changed.join('\n') : 'No journeys changed.');
console.log('\nNext: ask Claude Code to "build all confirmed journeys", or run `npm run forge:status`.');
