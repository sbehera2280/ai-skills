import { test as base, expect, type Page } from '@playwright/test';

/**
 * Custom fixtures shared by every generated spec. Import `test`/`expect` from HERE
 * (not from '@playwright/test') so these safety rails apply automatically:
 *
 *  - routeGuard: aborts real form-submission / state-changing requests to the app's
 *    own origin UNLESS an explicit, staging-only flag is set. This makes accidental
 *    destructive POSTs against production impossible, even if a generated test submits.
 */

const ALLOW_FORM_SUBMIT =
  process.env.ALLOW_FORM_SUBMIT === '1' &&
  !!process.env.STAGING_URL &&
  process.env.BASE_URL === process.env.STAGING_URL;

const BLOCKED_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

type Fixtures = {
  page: Page;
};

export const test = base.extend<Fixtures>({
  page: async ({ page }, use) => {
    if (!ALLOW_FORM_SUBMIT) {
      await page.route('**/*', async (route) => {
        const req = route.request();
        const isMutation = BLOCKED_METHODS.has(req.method());
        const sameOrigin = (() => {
          try {
            return new URL(req.url()).host === new URL(page.url()).host;
          } catch {
            return false;
          }
        })();
        if (isMutation && sameOrigin) {
          await route.abort('blockedbyclient');
          return;
        }
        await route.continue();
      });
    }
    await use(page);
  },
});

export { expect };
