import { readFileSync } from 'node:fs';
import { test } from '../fixtures/test-fixtures';
import { BasePage } from '../pages/BasePage';
import { expectNoSeriousA11yViolations } from '../fixtures/a11y';

/**
 * Cross-cutting accessibility coverage: one axe-core scan per page TYPE (using its
 * registry exemplar), running on every viewport project (desktop/tablet/mobile). New
 * page types are picked up automatically — no edits needed here when you add one.
 */
type Registry = {
  pageTypes: Record<string, { exemplarUrls?: string[]; label?: string }>;
};
let registry: Registry = { pageTypes: {} };
try {
  registry = JSON.parse(readFileSync('page-types.registry.json', 'utf8'));
} catch {
  // no registry yet (fresh scaffold, before first parse) → no a11y tests generated
}

// Per-page baseline of accepted, pre-existing site violations (see a11y-baseline.json).
type Baseline = { pageTypes?: Record<string, string[]> };
let baseline: Baseline = {};
try {
  baseline = JSON.parse(readFileSync('a11y-baseline.json', 'utf8'));
} catch {
  // no baseline file → enforce all serious/critical
}

for (const [key, pt] of Object.entries(registry.pageTypes)) {
  const exemplar = pt.exemplarUrls?.[0];
  if (!exemplar) continue;
  const path = new URL(exemplar).pathname;
  const ignoreRules = baseline.pageTypes?.[key] ?? [];

  test(`a11y: ${key} has no NEW serious/critical WCAG A/AA violations`, async ({ page }) => {
    await new BasePage(page).open(path);
    await expectNoSeriousA11yViolations(page, { ignoreRules });
  });
}
