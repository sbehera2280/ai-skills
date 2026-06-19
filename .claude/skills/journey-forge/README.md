# journey-forge — usage guide

Turn an XML sitemap into self-verifying Playwright E2E journeys, one per unique page type
(template). You describe each journey in **plain English**; the skill grounds it against the
live page and generates the test code, then runs it and self-heals to green. Re-runnable and
idempotent — a new page type only adds its own code; passing tests are never disturbed.

`SKILL.md` is the agent-facing procedure (what Claude follows). This file is the **human
quickstart**.

## The sequence — what to run, when, and where

Two steps are "ask Claude" (grounding + writing code need the model); everything else is one
command in your terminal. **Where** tells you which is which.

| # | When / goal | Run this | Where |
|---|-------------|----------|-------|
| 1 | One-time bootstrap of a repo (scaffold harness + install + browser + first parse) | `node .claude/skills/journey-forge/scripts/init.mjs --base-url <url> --sitemap <url>` | **Terminal** |
| 2 | Author a draft journey for every discovered page type | *"Run journey-forge for `<sitemap-url>`"* | **Claude** |
| 3 | Enrich each journey in plain English (add `## ...` flows; bold the visible UI text) | edit `journeys/*.journey.md` | **Editor** |
| 4 | Approve journeys for build (the human review gate) | `npm run forge:confirm -- --all` | **Terminal** |
| 5 | Generate code + self-verify across all viewports until green | *"Build all confirmed journeys"* | **Claude** |
| 6 | Run the suite whenever you like | `npm test` | **Terminal** |

> Already bootstrapped? Skip step 1 — use `npm run setup` once to install, then start at step 2.

## As-needed commands

| Goal | Run this | Where |
|------|----------|-------|
| See the lifecycle table (what's ready / awaiting review / edited) | `npm run forge:status` | Terminal |
| Re-discover page types after the sitemap changes | `npm run forge:parse -- --sitemap <url>` | Terminal |
| Filter which sitemap URLs are in scope (drop staging test pages) | edit `forge.config.json`, or `npm run forge:parse -- --exclude "<regex>"` | Terminal / Editor |
| Add a page type the parser didn't surface (or register a hand-written journey) | `npm run forge:add -- <pageType> --exemplar <path>` | Terminal |
| Ground locators on a page by hand (prints the accessibility snapshot) | `npm run forge:inspect -- <url> [--click "Open search"]` | Terminal |
| Run one viewport / open the HTML report | `npx playwright test --project=mobile` · `npm run report` | Terminal |
| Send a journey back to draft | `npm run forge:confirm -- --unconfirm <pageType>` | Terminal |

## How the two axes work (status table)

Each page type moves along two independent tracks, both shown by `forge:status`:

- **journey** (frontmatter `status:` in `journeys/<type>.journey.md`): `draft → confirmed` —
  the human review gate. Code is generated only after a journey is **confirmed**.
- **build** (in `page-types.registry.json`): `discovered → generated → passing` / `failing` —
  what codegen + the verify loop produced.

Edit a confirmed journey and it re-flags as **"edited, rebuild"** (the `.md` is newer than its
generated spec), so enriching in English always triggers a rebuild of just that type.

## Filtering the sitemap (e.g. staging test pages)

A staging sitemap often lists throwaway **test / sandbox / preview** pages you don't want to
generate tests for. Control which URLs are in scope with `forge.config.json` at the repo root:

```json
{
  "include": [],
  "exclude": ["^/test/", "^/sandbox/", "/preview/", "-test$"]
}
```

- `include` / `exclude` are **JS regex**, matched **case-insensitively against the URL path**
  (e.g. `/get-care/news/back-pain`). A URL is kept when it matches an `include` (or there are
  none) **and** matches no `exclude`.
- **Empty/absent = no filtering** — behaves exactly as before.
- CLI overrides for one-off runs: `npm run forge:parse -- --exclude "^/test/" --include "^/get-care/"`
  (both repeatable; a flag replaces that array from the config).
- The parser prints how many URLs were dropped (with samples) and records the filters in
  `sitemap-snapshot.json` — nothing is dropped silently.

**Persist filters in `forge.config.json` (commit it).** The skill is idempotent: if you only
ever pass filters as flags, every re-run must re-supply identical flags or the registry diff
churns (test pages reappear as `NEW`, then vanish as `REMOVED`). The committed config keeps
re-runs reproducible and the filter set reviewable in PRs.

## Adding a new page type later

**From the sitemap:** re-run step 1 (or `npm run forge:parse`). The diff lists the new type
as `NEW`; ask Claude to build it — only that type is generated, then the full suite proves
nothing regressed.

**By hand** (a distinct template the clustering didn't carve out — e.g. a `/news` *listing*
buried inside the `/news/**` *detail* subtree, or a one-off page):
```bash
npm run forge:add -- <pageType> --exemplar /path/to/exemplar   # --label, --risk optional
```
This registers the type (so it shows in `forge:status`) and scaffolds a draft journey if you
haven't written one. If you wrote `journeys/<pageType>.journey.md` first, `forge:add` reads
its frontmatter — no flags needed. Then enrich → confirm → ask Claude to build.
`forge:status` also nudges you to register any on-disk journey it finds unregistered.

## Distributing to another project

The skill is **self-contained**: copy `.claude/skills/journey-forge/` into any repo (it
carries the harness templates in `assets/scaffold/`), then run the step-1 `init.mjs` command
pointed at that site's sitemap. Because you invoke it with `node`, it works even before a
`package.json` exists. Nothing else from this repo is required.

## No MCP server required

Grounding (reading a page's accessibility tree to pick real locators) runs entirely through
the **Playwright CLI** — `scripts/inspect-page.mjs` drives headless Chromium and prints
`page.locator('body').ariaSnapshot()`, the same tree the Playwright MCP server would expose.
This is deliberate: environments that **block MCP** can still use the skill with zero loss of
robustness (the test runner never used MCP either). Nothing to configure, nothing
platform-specific to launch. For affordances revealed by interaction:
```bash
npm run forge:inspect -- <url> --click "Open search" --wait-for "Search for"
```

## Cross-cutting coverage (automatic, every page type)

- **Responsive matrix** — every spec runs on three Chromium viewports (`desktop` / `tablet` /
  `mobile`). Run one with `npx playwright test --project=mobile`.
- **Accessibility** — `tests/accessibility.spec.ts` runs an axe-core (WCAG A/AA) scan per page
  type on every viewport, failing on serious/critical violations. Pre-existing site defects go
  in `a11y-baseline.json` (accepted + documented) so the gate stays green for known debt but
  catches any **new** regression.

## Safety

- **Forms are assert-only.** Transactional pages verify render + affordances + client
  validation, never a real submit. A real submit requires `ALLOW_FORM_SUBMIT=1` **and**
  `BASE_URL === STAGING_URL`; the `routeGuard` fixture blocks mutating requests otherwise.
- Tests cover **one exemplar per page type**, not every URL — that's the point of collapsing
  the sitemap into templates.

## Recommended permissions

To let the verify loop run without prompts, add to `.claude/settings.json`:
```json
{ "permissions": { "allow": [
  "Bash(npm run forge:parse:*)",
  "Bash(npx playwright test:*)",
  "Bash(npx playwright install:*)",
  "Bash(node .claude/skills/journey-forge/scripts/inspect-page.mjs:*)"
] } }
```
(Or run `/fewer-permission-prompts` after the first run.) **Cross-platform:** Node scripts,
`npm run …`, Playwright, and the tests are all platform-neutral — no Git Bash or WSL needed.
Prerequisite everywhere: Node.js 18+.
