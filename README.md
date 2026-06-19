# ai-skills

A library of Claude Code skills, shared across our team. Each skill lives under
`.claude/skills/<name>/` and is **self-contained** — drop it into any repo and it bootstraps
everything it needs.

## Skills

| Skill | What it does | Guide |
|-------|--------------|-------|
| **journey-forge** | Turns an XML sitemap into self-verifying Playwright E2E journeys — one per unique page type. You describe each journey in plain English; it grounds against the live page, generates the test code, runs it, and self-heals to green. No MCP server required. | [`.claude/skills/journey-forge/README.md`](.claude/skills/journey-forge/README.md) |

## Using a skill in your own project

The skill is portable. From your project's repo root:

```bash
# 1. Copy the skill in (or add this repo as a git submodule / subtree).
cp -R /path/to/ai-skills/.claude/skills/journey-forge .claude/skills/

# 2. One command bootstraps the harness, installs deps + the browser, and parses the sitemap.
#    Works even before your repo has a package.json, because you invoke it with node:
node .claude/skills/journey-forge/scripts/init.mjs \
  --base-url https://your-site.org \
  --sitemap https://your-site.org/sitemap.xml
```

Then, in Claude Code (launched from that repo): *"Run journey-forge for `<sitemap-url>`"* →
enrich the drafts in plain English → `npm run forge:confirm -- --all` → *"Build all confirmed
journeys"* → `npm test`. Full step-by-step (and which steps run in the terminal vs in Claude)
is in the [journey-forge guide](.claude/skills/journey-forge/README.md).

## Testing a skill in place (for skill developers)

You can also try a skill directly inside a clone of this repo:

```bash
git clone https://github.com/sbehera2280/ai-skills.git
cd ai-skills
node .claude/skills/journey-forge/scripts/init.mjs \
  --base-url https://stage.utmedicine.org \
  --sitemap https://stage.utmedicine.org/sitemap-utmedicine-en-us.xml
# then open Claude Code here and follow the guide
```

The bootstrap generates a Playwright harness (`package.json`, configs, `journeys/`, `pages/`,
`tests/`, …) at the repo root. **These are intentionally git-ignored** (see `.gitignore`) so
the repo stays a clean skill library — only `.claude/skills/**` is tracked. Don't commit the
generated files.

## Requirements

Node.js 18+. Cross-platform (macOS / Linux / Windows) — no Git Bash or WSL needed, and no MCP
server (grounding uses the Playwright CLI directly).
