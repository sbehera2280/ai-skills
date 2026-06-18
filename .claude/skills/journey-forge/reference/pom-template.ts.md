# Page Object template

Generate `pages/<Type>Page.ts` from this. One class per page type. Locators are defined
once (grounded in the live snapshot); the spec calls high-level methods. Extends
`BasePage` for shared nav + consent handling.

```ts
import { type Page, type Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * <Type> page object.
 * Page type: <registry-key>   Pattern: <clusterPattern>
 * Locators grounded in the live accessibility snapshot on <date>.
 */
export class ConditionsDetailPage extends BasePage {
  readonly heading: Locator;
  readonly main: Locator;
  readonly scheduleCta: Locator;

  constructor(page: Page) {
    super(page);
    // Prefer role + accessible name. See reference/locator-strategy.md.
    this.heading = page.getByRole('heading', { level: 1 });
    this.main = page.getByRole('main');
    this.scheduleCta = page.getByRole('link', { name: /schedule an appointment/i });
  }

  async goto(path: string): Promise<void> {
    await this.open(path); // BasePage: goto + dismiss consent + wait for load state
  }

  async expectLoaded(): Promise<void> {
    await expect(this.heading).toBeVisible();
    await expect(this.main).toBeVisible();
  }
}
```

## Conventions
- No assertions in the constructor; expose `expect*` methods instead.
- Methods are verbs (`search`, `openFirstResult`); properties are nouns (`heading`).
- Reuse `BasePage.open()` so consent dismissal and load-state waiting are consistent.
- Keep locators resilient: regex names (`/schedule an appointment/i`) tolerate casing/spacing.
