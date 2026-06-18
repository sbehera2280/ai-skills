# Locator strategy — how to pick FAIL-PROOF locators

The single biggest cause of flaky E2E tests is brittle locators. Follow this priority
order. **Every locator must be grounded in what you actually observed** in the live
accessibility snapshot (`scripts/inspect-page.mjs`, which prints `ariaSnapshot()` via the
Playwright CLI — no MCP server), never guessed from memory.

## Priority order (use the first that uniquely resolves)

1. **Role + accessible name** — `page.getByRole('button', { name: 'Schedule an appointment' })`
   The most robust: mirrors how users and assistive tech find things, survives CSS/markup churn.
2. **Label / placeholder / text** — `getByLabel('Email')`, `getByPlaceholder('Search')`,
   `getByText('No results found')` (prefer `{ exact: false }` only when needed).
3. **Test id** — `getByTestId('clinic-card')` when the site exposes `data-testid`/`data-test`.
4. **Scoped CSS as a last resort** — only when no accessible handle exists; scope it
   (`section.results >> .card`) and add a comment explaining why a11y wasn't available.

## Hard rules (the test-template enforces these)

- **NEVER** `waitForTimeout` / arbitrary sleeps. Rely on web-first auto-waiting assertions
  (`await expect(locator).toBeVisible()`), which retry until the `expect` timeout.
- **NEVER** assert on volatile content (counts, dates, marketing copy) unless it IS the
  point of the journey. Assert on structure, roles, and navigation outcomes.
- Prefer `getByRole('heading', { level: 1 })` over text for the page H1 — content varies
  across the 138 condition pages, the H1 ROLE does not.
- Disambiguate with `.first()`, `.filter()`, or a scoping container — not `nth(7)`.
- For navigation, assert the OUTCOME: `await expect(page).toHaveURL(/schedule-an-appointment/)`.
- Use `baseURL`-relative paths in `page.goto('/get-care/...')`, never hard-coded origins.

## Grounding procedure (per page type, during generation)

1. `node scripts/inspect-page.mjs <exemplarUrl>` — prints the `ariaSnapshot` accessibility
   tree plus a curated digest (title, H1s, landmarks, forms, links, buttons).
2. Read the tree. Pick locators from real roles/names in it. If a needed element has no
   accessible name, note it and fall back down the priority list (record why).
3. For an element that only appears after interaction (e.g. a search box behind an "Open
   search" toggle), re-run with `--click "<name>"` (repeatable) and optionally
   `--wait-for "<name>"` so the revealed element shows up in the snapshot.
4. Dismiss cookie/consent overlays first (the shared fixture does this) so they don't
   intercept clicks.
