import { type Page, type Locator } from '@playwright/test';

/**
 * Generic base for all page objects. Centralizes navigation, consent/cookie dismissal,
 * and load-state waiting. Site-specific SHARED affordances (e.g. a global header search,
 * primary nav) should be added here by journey-forge when grounding reveals they appear
 * across page types — see the "site-specific shared locators" marker below.
 */
export class BasePage {
  readonly page: Page;

  // --- site-specific shared locators (journey-forge appends here) ---

  constructor(page: Page) {
    this.page = page;
  }

  /** Navigate (baseURL-relative) and settle the page for assertions. */
  async open(path: string): Promise<void> {
    await this.page.goto(path, { waitUntil: 'domcontentloaded' });
    await this.dismissConsentBanner();
  }

  /**
   * Best-effort dismissal of common cookie/consent overlays. Must never throw — a
   * missing banner is the normal case. Overlays otherwise intercept clicks.
   */
  async dismissConsentBanner(): Promise<void> {
    const candidates: Locator[] = [
      this.page.getByRole('button', { name: /accept all|accept cookies|i accept|got it|agree/i }),
      this.page.getByRole('button', { name: /^accept$/i }),
    ];
    for (const c of candidates) {
      try {
        if (await c.first().isVisible({ timeout: 1500 })) {
          await c.first().click({ timeout: 2000 });
          return;
        }
      } catch {
        // ignore — banner not present or already gone
      }
    }
  }
}
