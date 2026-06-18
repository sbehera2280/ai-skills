#!/usr/bin/env node
// Primary locator-grounding tool. Drives a real Chromium via the Playwright library
// (NO MCP server required — the org may block MCP) and prints the observable structure of
// a live page so generated locators are grounded, never guessed.
//
// Output per URL:
//   - ariaSnapshot : the full role-annotated accessibility tree (the exact equivalent of
//                    the Playwright MCP `browser_snapshot`; this is what you ground against)
//   - title, h1, landmarks, forms, links, buttons : a curated, human-readable digest
//
// To ground affordances that only appear AFTER interaction (e.g. a search box behind an
// "Open search" toggle), apply pre-snapshot actions:
//   --click "<accessible name>"   (repeatable)  click a button/link/field by name first
//   --wait-for "<name|text>"      after the clicks, wait for this to become visible
//
// Usage:
//   node inspect-page.mjs <url> [<url> ...]
//   node inspect-page.mjs https://site/page --click "Open search" --wait-for "Search for"

import { chromium } from '@playwright/test';

function parseArgs(argv) {
  const a = { urls: [], clicks: [], waitFor: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--click') a.clicks.push(argv[++i]);
    else if (argv[i] === '--wait-for') a.waitFor = argv[++i];
    else a.urls.push(argv[i]);
  }
  return a;
}

const args = parseArgs(process.argv.slice(2));
if (args.urls.length === 0) {
  console.error('Usage: node inspect-page.mjs <url> [<url> ...] [--click "<name>"]... [--wait-for "<name>"]');
  process.exit(2);
}

// A name-based locator that matches the way a user (and the accessibility tree) sees an
// element: by role+accessible-name first, then placeholder, then visible text.
function nameLocator(page, name) {
  const re = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  return page
    .getByRole('button', { name: re })
    .or(page.getByRole('link', { name: re }))
    .or(page.getByRole('textbox', { name: re }))
    .or(page.getByRole('combobox', { name: re }))
    .or(page.getByPlaceholder(re))
    .or(page.getByText(re));
}

const browser = await chromium.launch();
try {
  for (const url of args.urls) {
    const page = await browser.newPage();
    const out = { url, error: null, actions: [] };
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });

      // Pre-snapshot interaction (reveal hydrated/collapsed UI before grounding).
      for (const name of args.clicks) {
        await nameLocator(page, name).first().click({ timeout: 15_000 });
        out.actions.push(`click: ${name}`);
      }
      if (args.waitFor) {
        await nameLocator(page, args.waitFor).first().waitFor({ state: 'visible', timeout: 15_000 });
        out.actions.push(`wait-for: ${args.waitFor}`);
      }

      // The full accessibility tree — ground every locator against this.
      out.ariaSnapshot = await page.locator('body').ariaSnapshot();

      // Curated digest (a convenience layer the raw snapshot doesn't give you).
      out.title = await page.title();
      out.h1 = await page.getByRole('heading', { level: 1 }).allInnerTexts();
      out.landmarks = {
        main: await page.getByRole('main').count(),
        navigation: await page.getByRole('navigation').count(),
        contentinfo: await page.getByRole('contentinfo').count(),
        search: await page.getByRole('search').count(),
        form: await page.locator('form').count(),
      };
      out.forms = await page.evaluate(() =>
        [...document.querySelectorAll('form')].slice(0, 3).map((f) => ({
          fields: [...f.querySelectorAll('input,select,textarea')].slice(0, 12).map((el) => ({
            tag: el.tagName.toLowerCase(),
            type: el.getAttribute('type'),
            name: el.getAttribute('name'),
            required: el.hasAttribute('required'),
            label:
              el.getAttribute('aria-label') ||
              (el.id && document.querySelector(`label[for="${el.id}"]`)?.textContent?.trim()) ||
              el.getAttribute('placeholder') ||
              null,
          })),
          submit: [...f.querySelectorAll('button,[type=submit]')]
            .map((b) => b.textContent?.trim() || b.getAttribute('value'))
            .filter(Boolean)
            .slice(0, 3),
        })),
      );
      out.links = (await page.getByRole('link').allInnerTexts())
        .map((t) => t.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .slice(0, 25);
      out.buttons = (await page.getByRole('button').allInnerTexts())
        .map((t) => t.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .slice(0, 15);
    } catch (err) {
      out.error = err.message;
    } finally {
      await page.close();
    }
    console.log(JSON.stringify(out, null, 2));
  }
} finally {
  await browser.close();
}
