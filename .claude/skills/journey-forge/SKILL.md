---
name: journey-forge
description: >-
  Generate and self-verify production-grade Playwright E2E journey tests from an XML
  sitemap. Use when the user provides a sitemap URL and wants user-journey tests per
  unique page type/template, or asks to (re)generate, refresh, or add journeys for new
  page types. Clusters URLs into page types, authors multi-path journey specs, generates
  TypeScript Page-Object tests grounded by a live Playwright accessibility snapshot (via
  the CLI — no MCP server required), then runs `npx playwright test` and self-heals to
  green. Incremental and idempotent — only new or changed page types get new code; passing
  tests are left untouched.
---

# journey-forge

Turn any sitemap into self-verifying Playwright E2E journeys, one comprehensive journey
per **unique page type (template)**. Re-runnable: when a new page type appears later,
only its code is generated; existing passing tests are never disturbed.

## Operating principles

1. **Deterministic where it must be reliable.** Sitemap fetch → cluster → diff is a Node
   script (`scripts/parse-sitemap.mjs`). Never eyeball-cluster hundreds of URLs.
2. **Grounded, never guessed.** Every locator comes from a live accessibility snapshot of
   a real exemplar page, taken with the Playwright CLI (`scripts/inspect-page.mjs`, which
   prints `ariaSnapshot()` — no MCP server needed). See `reference/locator-strategy.md`.
3. **Fail-proof = web-first + self-heal.** Auto-waiting assertions only (no sleeps),
   retries, trace-on-failure, and a generate → run → read-error → re-observe → fix loop.
4. **Idempotent.** `page-types.registry.json` tracks each type's fingerprint + status;
   re-runs touch only `new`/`changed` types and a final full-suite run guards regressions.
5. **Safe by default.** Form/transactional pages are ASSERT-ONLY; real submits are gated
   to staging behind `ALLOW_FORM_SUBMIT=1`. The `routeGuard` fixture blocks mutating
   requests so an accidental submit can't reach production.

## Inputs

- **sitemap URL** (required).
- **BASE_URL** (optional; defaults to the sitemap origin). For form coverage, a
  **STAGING_URL** may be provided.
- Optionally a **specific page type / journey** to (re)generate.

## The two-phase, human-gated lifecycle

Journeys are **natural-language markdown** (`journeys/<type>.journey.md`) that humans write
and enrich in plain English. The skill reads the prose and generates Playwright code from
it — humans never touch selectors or JSON. See `reference/journey-authoring.md`.

Every journey moves through two independent axes:
- **journeyStatus** (frontmatter `status:` in `journeys/<type>.journey.md`): `draft` →
  `confirmed`. The HUMAN REVIEW GATE. Code is NOT generated until a journey is confirmed.
- **buildStatus** (in `page-types.registry.json`): `discovered` → `generated` → `passing`
  / `failing`. What codegen + the verify loop produced.

```
PHASE A (Discover + Author all journeys as DRAFTS)
        ↓
HUMAN reviews journeys/, edits, adds paths/journeys, then  `npm run forge:confirm`
        ↓
PHASE B (Build code for every CONFIRMED journey, batch, self-verify)
```

`npm run forge:status` shows exactly where each type sits (needs journey / awaiting review
/ ready to build / passing).

## Procedure

### Step 0 — Resolve inputs
Confirm the sitemap URL and `BASE_URL`. Confirm form policy = assert-only (default).
Note any `STAGING_URL`.

### Step 1 — Bootstrap (one command, self-contained, idempotent)
If `package.json` is absent, run the single bootstrap (works in a brand-new repo because
it's invoked with `node`, before any npm scripts exist):
```
node .claude/skills/journey-forge/scripts/init.mjs --base-url <origin> --sitemap <url>
```
`init.mjs` chains: `scaffold.mjs` (writes `package.json`, `playwright.config.ts`,
`tsconfig.json`, `.env.example`, `.gitignore`,
`fixtures/test-fixtures.ts`, `pages/BasePage.ts`, dirs — only if absent) → `npm install` →
`npx playwright install chromium` → `parse-sitemap.mjs`. Flags: `--name`, `--skip-install`,
`--skip-browser`. This is what makes the skill self-contained: copy
`.claude/skills/journey-forge/` into any repo and one command bootstraps everything.
(Already-scaffolded project: just `npm run setup`, then go to Step 2.)

### Step 2 — Parse + cluster + diff  [deterministic]
```
npm run forge:parse -- --sitemap <url>
```
Read the printed diff `{ new, unchanged, changed, removed }` and `notableForms`.
- **unchanged** passing types → do nothing (idempotency guarantee).
- Process **new** types. Process **changed** types only after explicit user confirmation.
- Review the cluster table; adjust `--min-cluster` / `--section-depth` if granularity is
  off. Split grab-bag types and promote any `notableForms` URL into its own
  `destructive-form` page type if it deserves a dedicated journey.

### PHASE A — Step 3 — Author natural-language journey DRAFTS for ALL target types
For each `new` page type (and any promoted form type):
- Pick an `exemplarUrl`. Snapshot it with `node scripts/inspect-page.mjs <url>` — it prints
  the real accessibility tree (`ariaSnapshot`) plus a curated digest. For affordances that
  only appear after interaction (e.g. a collapsed search), add `--click "<name>"`
  (repeatable) and optionally `--wait-for "<name>"` to snapshot the revealed state.
- Write `journeys/<type>.journey.md` — **plain-English** journeys (one `## Heading` per
  flow), with frontmatter `status: draft`. Follow `reference/journey-authoring.md`: bold the
  visible UI text, state outcomes, one behavior per section. Note grounding quirks
  (missing/duplicate H1, listing vs detail, collapsed search) as prose context. Do NOT put
  selectors or JSON in the journey — it is for humans to read and enrich.
- Do this for the WHOLE set so the human has every journey to review at once. Then STOP and
  report: "N journey drafts authored in natural language — read/enrich them in plain
  English, then `npm run forge:confirm -- --all` (or per type) and ask me to build."

### HUMAN GATE
The human reads `journeys/*.journey.md`, **enriches them in natural language** (adds/edits
`## ...` sections describing what a user does and what should happen — no code), and runs
`npm run forge:confirm -- --all | <type>...`. (They can send one back with `--unconfirm`.)

### PHASE B — Step 4 — Generate code from the CONFIRMED prose  [batch, agentic]
Run `npm run forge:status` and take every type where `journeyStatus=confirmed` and
`buildStatus≠passing`. For each, READ the natural-language journey, ground every bolded
phrase against the live page (`node scripts/inspect-page.mjs <url>`, adding `--click`/
`--wait-for` for interactive affordances) to resolve real locators, then:
- Generate `pages/<Type>Page.ts` (`reference/pom-template.ts.md`). Put cross-page shared
  affordances (global search, header nav) into `pages/BasePage.ts`.
- Generate `tests/<type>.spec.ts` (`reference/test-template.spec.ts.md`), one `test()` per
  `##` journey section, web-first assertions only, NO `waitForTimeout`, importing
  `test`/`expect` from `../fixtures/test-fixtures`. Guard optional elements with
  `test.skip(count===0, …)`.
- `npm run typecheck`, then set `buildStatus: "generated"`.

### Step 5 — Verify + self-heal  [deterministic runner]   MAX_RETRIES = 3
```
npx playwright test tests/<type>.spec.ts --reporter=list
```
- **Green** → `buildStatus: "passing"`, record `lastVerifiedAt` + `verifyAttempts`.
- **Red, attempts < MAX_RETRIES** → read the error/trace, re-observe the live page for the
  correct locator, fix ONLY the failing POM/spec, re-run. Prefer `expect(...).toPass()` for
  affordances that hydrate late (avoids flake without sleeps).
- **Still red at MAX_RETRIES** → quarantine with `test.fixme`, `buildStatus: "failing"`,
  record the error, report. Do NOT block other types.

### Step 6 — Final guard run
```
npm run typecheck && npx playwright test
```
Confirm previously-passing tests stay green (regression guard for idempotency). Write the
registry. Print the `forge:status` summary.

## Cross-cutting coverage (automatic, every page type)

Two concerns ride along with every journey — no extra authoring needed:

- **Responsive matrix.** `playwright.config.ts` defines three Chromium projects —
  `desktop` / `tablet` / `mobile` — so every spec runs on all three viewports. Affordances
  that move/collapse on small screens (hamburger nav, collapsed search) are handled by
  grounding against the mobile viewport and making the page object viewport-aware.
- **Accessibility.** `tests/accessibility.spec.ts` runs an axe-core scan (WCAG A/AA) on one
  exemplar per page type, on every viewport, failing on SERIOUS/CRITICAL violations. It
  auto-covers new page types (it reads the registry). Pre-existing site defects go in
  `a11y-baseline.json` (accepted + documented) so the gate stays green for known debt but
  fails on any NEW regression. When a first scan finds violations, record them in the
  baseline AND report them to the user as real findings (don't silently swallow).

What journey-forge intentionally does NOT do: LLM-vision or runtime "find the button"
assertions (nondeterministic — they break the fail-proof guarantee), and performance/CLS
(a separate tool). Visual diffing, if wanted, is deterministic `toHaveScreenshot()`.

## Re-running for a new page type later
Run Step 2; the diff shows the new type as `new`. Phase A authors just its draft → human
confirms → Phase B builds & verifies only it. Everything `unchanged`/already-`passing` is
skipped, and the final guard run proves nothing else broke.

### Adding a page type the parser didn't surface (manual journeys)
Sometimes a distinct template lives inside another type's subtree (e.g. a `/news` *listing*
absorbed into the `/news/**` *detail* cluster), or you just want a one-off page. To carve it
out by hand:
```
npm run forge:add -- <pageType> [--exemplar <url|path>] [--label "…"] [--risk read-only|destructive-form]
```
`add-journey.mjs` registers the type in `page-types.registry.json` (`matchKind: "manual"`,
`buildStatus: "discovered"`) so it appears in `forge:status` and builds like any other. If
`journeys/<pageType>.journey.md` already exists, its frontmatter is read and the prose left
untouched; otherwise a draft is scaffolded for you to enrich. Manual types are never reported
`removed` by a future `forge:parse`. Then: confirm (if draft) → ask to build. `forge:status`
also flags any on-disk journey that isn't yet registered, pointing you at this command.

## Files this skill owns
- `scripts/scaffold.mjs` — stand up the harness from `assets/scaffold/` (self-contained).
- `scripts/parse-sitemap.mjs`, `scripts/registry-lib.mjs` — deterministic clustering + diff.
- `scripts/forge-status.mjs` — lifecycle table; `scripts/confirm.mjs` — the human gate.
- `scripts/add-journey.mjs` — register a hand-added page type into the registry (and
  scaffold a draft journey if absent) so it shows up and builds.
- `scripts/frontmatter.mjs` — read/write journey markdown frontmatter (no deps).
- `scripts/inspect-page.mjs` — locator grounding: drives Chromium via the Playwright CLI
  and prints the live `ariaSnapshot` + a curated digest (no MCP). Supports `--click` /
  `--wait-for` to ground affordances revealed by interaction.
- `assets/scaffold/` — bundled harness templates (config, fixtures, generic BasePage).
- `reference/*.md` — journey-authoring guide, locator strategy, POM + spec templates.
- `assets/scaffold/` also ships the a11y harness: `fixtures/a11y.ts`,
  `tests/accessibility.spec.ts`, `a11y-baseline.json`, and a 3-viewport config.
- Generates (in the consuming project): `journeys/*.journey.md` (natural language),
  `pages/*Page.ts`, `tests/*.spec.ts`, `page-types.registry.json`, `a11y-baseline.json`,
  `sitemap-snapshot.json`.

## Permissions (optional, recommended)
To run the verify loop unattended, allow in your settings:
`Bash(npm run forge:parse:*)`, `Bash(npx playwright test:*)`, `Bash(npx playwright install:*)`,
and `Bash(node .claude/skills/journey-forge/scripts/inspect-page.mjs:*)`. No MCP server is
used. Run `/fewer-permission-prompts` after the first run.
