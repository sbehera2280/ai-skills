// Shared helpers for the page-types registry — the idempotency backbone.
// Pure Node, no deps. Used by parse-sitemap.mjs and (optionally) the skill loop.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

/** Stable short hash used as a page type's diff key / fingerprint seed. */
export function sha256(input) {
  return 'sha256:' + createHash('sha256').update(input).digest('hex').slice(0, 16);
}

/** Deterministic fingerprint of a page type's *defining signal*.
 *  Defaults to the cluster pattern + url count bucket. The skill can later
 *  recompute a richer fingerprint that folds in sampled DOM landmark roles. */
export function fingerprintPageType({ clusterPattern, urlCount }) {
  const bucket = urlCount <= 1 ? 'single' : urlCount < 10 ? 'small' : 'bulk';
  return sha256(`${clusterPattern}|${bucket}`);
}

export function readRegistry(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new Error(`Registry at ${path} is not valid JSON: ${err.message}`);
  }
}

export function writeRegistry(path, registry) {
  writeFileSync(path, JSON.stringify(registry, null, 2) + '\n', 'utf8');
}

/**
 * Diff freshly-discovered page types against the existing registry.
 * Returns { new, unchanged, changed, removed } as arrays of page-type keys.
 *  - new:        key absent from registry
 *  - unchanged:  key present AND fingerprint matches (skip untouched)
 *  - changed:    key present BUT fingerprint differs (needs review before regen)
 *  - removed:    key in registry but no longer in the sitemap
 *
 * `existingPaths` (optional Set of current sitemap paths) lets manually PROMOTED
 * exact-match types (e.g. a form page lifted out of a grab-bag) count as `unchanged`
 * as long as their URL still exists — so they aren't falsely reported `removed`.
 * Types added by hand via `add-journey.mjs` (matchKind 'manual') are human-managed and
 * are never auto-reported `removed`, regardless of the sitemap.
 */
export function diffPageTypes(discovered, registry, existingPaths = null) {
  const prev = registry?.pageTypes ?? {};
  const result = { new: [], unchanged: [], changed: [], removed: [] };

  for (const [key, dt] of Object.entries(discovered)) {
    const existing = prev[key];
    if (!existing) {
      result.new.push(key);
    } else if (existing.fingerprint === dt.fingerprint) {
      result.unchanged.push(key);
    } else {
      result.changed.push(key);
    }
  }
  for (const [key, entry] of Object.entries(prev)) {
    if (discovered[key]) continue;
    const stillPresent =
      entry.matchKind === 'manual' ||
      (existingPaths && entry.matchKind === 'exact' && existingPaths.has(entry.clusterPattern));
    if (stillPresent) result.unchanged.push(key); // managed/promoted type, still valid
    else result.removed.push(key);
  }
  return result;
}
