import { type Page, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

/**
 * Run an axe-core accessibility scan and fail on any SERIOUS or CRITICAL WCAG A/AA
 * violation. Serious/critical are the high-confidence, low-false-positive impacts — a
 * sensible gate for an external site (moderate/minor are reported but not gated).
 *
 * `ignoreRules` is a per-page BASELINE of accepted, pre-existing violation rule ids (e.g.
 * the site already ships an `image-alt` bug you've logged upstream). Baselined rules are
 * still scanned and printed, but don't fail the run — so the gate stays green for known
 * debt while catching any NEW regression.
 *
 * Reusable from any spec or journey: `await expectNoSeriousA11yViolations(page)`.
 */
export async function expectNoSeriousA11yViolations(
  page: Page,
  { tags = ['wcag2a', 'wcag2aa'], ignoreRules = [] }: { tags?: string[]; ignoreRules?: string[] } = {},
): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(tags).analyze();
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  const baselined = serious.filter((v) => ignoreRules.includes(v.id));
  const failing = serious.filter((v) => !ignoreRules.includes(v.id));
  if (baselined.length) {
    console.log(
      `  a11y baseline (accepted, pre-existing): ${baselined.map((v) => `${v.id}×${v.nodes.length}`).join(', ')}`,
    );
  }
  const detail = failing
    .map((v) => `- ${v.id} (${v.impact}) ×${v.nodes.length}: ${v.help}`)
    .join('\n');
  expect(failing, `NEW serious/critical a11y violations:\n${detail || '(none)'}`).toHaveLength(0);
}
