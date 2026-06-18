# Journey authoring guide (natural language)

Journeys are **plain-English markdown** that humans write and enrich. The skill reads the
prose, grounds it against the live page, and generates Playwright code. You never write
selectors or JSON — just describe what a user does and what should happen.

## File: `journeys/<page-type>.journey.md`

```markdown
---
pageType: get-care-browse-conditions-detail   # matches the registry key (don't change)
exemplarUrl: /get-care/browse/conditions/back-pain   # the page to test this template on
risk: read-only                                 # or destructive-form (assert-only)
status: draft                                   # draft -> confirmed (the review gate)
---

# Condition detail page

Optional context for yourself and the agent (grounding notes, caveats).

## Renders core content
The page shows a main heading (the condition name) and the main content area.

## Schedule an appointment
From a condition page, click **Schedule an appointment** and you should land on the
scheduling page.
```

Each `## Heading` becomes one test. The text under it is the journey, in your words.

## How to write a journey (the only 3 rules)

1. **Put visible UI text in bold** — the exact words a user sees on the link/button/field:
   **Schedule an appointment**, **Back to news**, **Get directions**. This is what lets the
   agent find the element reliably (it matches the accessible name).
2. **Say what should happen** — what becomes visible, what text appears, or which page you
   land on ("you should land on `/get-care/news`"). That becomes the assertion.
3. **One behavior per `##` section.** Keep each journey to a single intent; add more
   sections for more flows.

You can write prose or a bullet list of steps — both work:

```markdown
## Search for care
- Open the site search
- Type **cardiology**
- The search box should contain what you typed
```

## Tips for good (fail-proof) journeys

- Prefer **stable** things: headings, landmarks, navigation, primary CTAs — not exact
  marketing copy or counts that change.
- Assert **outcomes** ("you land on the scheduling page"), not implementation.
- Don't describe arbitrary waits or timing — the generated code auto-waits.
- For **form/transactional** pages (`risk: destructive-form`): describe checking that the
  form/fields render and validation fires — **never** "submit the form". Real submission is
  staging-only and gated; keep prose assert-only.

## You don't need to write these — they're automatic

- **Responsive** — every journey already runs on desktop, tablet, and mobile. Don't write
  separate "on mobile" journeys; if an affordance moves on small screens, the page object is
  made viewport-aware during build.
- **Accessibility** — an axe-core WCAG A/AA scan runs per page type on every viewport
  automatically (`tests/accessibility.spec.ts`). Don't write a11y journeys by hand.

## The workflow

1. Edit/add `## ...` sections in the journey markdown (plain English).
2. `npm run forge:confirm -- <pageType>` (or `--all`) — your approval gate.
3. Ask Claude Code: **"build all confirmed journeys"** — it grounds each bolded phrase
   against the live page, generates/updates the Page Object + spec, runs the tests, and
   self-heals until green.
4. `npm test` whenever you like.

### Starting a journey for a BRAND-NEW page type
If the page type isn't in `npm run forge:status` yet (the sitemap clustering didn't carve it
out — e.g. a listing page inside a detail subtree), register it first so it can build:
```
npm run forge:add -- <pageType> --exemplar /path/to/exemplar
```
That scaffolds a draft `journeys/<pageType>.journey.md` (if absent) and adds the registry
entry. Then enrich → confirm → build as above. (Already wrote the `.journey.md` by hand?
`forge:add -- <pageType>` reads its frontmatter — no flags needed.)

## How the agent turns your prose into code (for reference)

- A bolded phrase → a grounded locator, preferring `getByRole(name)` /
  `getByLabel` / `getByPlaceholder` (see `locator-strategy.md`). It snapshots `exemplarUrl`
  via the Playwright CLI (`inspect-page.mjs` → `ariaSnapshot`) to confirm the real element.
- "click X" → `await pageObject.x.click()`; "you land on /path" →
  `await expect(page).toHaveURL(/path/)`; "shows/visible" → `toBeVisible()`; "contains Y" →
  `toContainText('Y')`.
- Shared affordances mentioned across many pages (global search, header nav) go into
  `pages/BasePage.ts`; page-type-specific ones into `pages/<Type>Page.ts`.
- Output templates: `pom-template.ts.md`, `test-template.spec.ts.md`.
