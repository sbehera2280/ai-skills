# Spec template

Generate `tests/<page-type>.spec.ts` from this — one `test()` per journey path. Uses the
custom fixtures (consent auto-dismissed) and the page object. Web-first assertions only.

```ts
import { test, expect } from '../fixtures/test-fixtures';
import { ConditionsDetailPage } from '../pages/ConditionsDetailPage';

const EXEMPLAR = '/get-care/browse/conditions/diabetes';

test.describe('Condition detail page', () => {
  test('renders core content', async ({ page }) => {
    const p = new ConditionsDetailPage(page);
    await p.goto(EXEMPLAR);
    await p.expectLoaded();
  });

  test('primary CTA navigates to scheduling', async ({ page }) => {
    const p = new ConditionsDetailPage(page);
    await p.goto(EXEMPLAR);
    // Guard optional elements so a missing CTA SKIPS rather than FAILS noisily.
    test.skip((await p.scheduleCta.count()) === 0, 'No scheduling CTA on this exemplar');
    await p.scheduleCta.first().click();
    await expect(page).toHaveURL(/schedule-an-appointment/i);
  });
});
```

## FORM page types (assert-only) — `risk: destructive-form`

```ts
import { test, expect } from '../fixtures/test-fixtures';
import { ScheduleAppointmentPage } from '../pages/ScheduleAppointmentPage';

const ALLOW_SUBMIT =
  process.env.ALLOW_FORM_SUBMIT === '1' &&
  !!process.env.STAGING_URL &&
  process.env.BASE_URL === process.env.STAGING_URL;

test.describe('Schedule an appointment (assert-only)', () => {
  test('form renders with required fields', async ({ page }) => {
    const p = new ScheduleAppointmentPage(page);
    await p.goto('/get-care/schedule-an-appointment');
    await expect(p.form).toBeVisible();
    await expect(p.submit).toBeEnabled();
  });

  test('empty submit triggers client-side validation', async ({ page }) => {
    const p = new ScheduleAppointmentPage(page);
    await p.goto('/get-care/schedule-an-appointment');
    await p.submit.click();
    // Assert validation surfaced — NOT a successful submission.
    await expect(p.anyValidationMessage).toBeVisible();
    await expect(page).not.toHaveURL(/thank-you|confirmation|success/i);
  });

  test('full submit (staging only, gated)', async ({ page }) => {
    test.skip(!ALLOW_SUBMIT, 'Real submit disabled (set ALLOW_FORM_SUBMIT=1 on STAGING_URL)');
    const p = new ScheduleAppointmentPage(page);
    await p.goto('/get-care/schedule-an-appointment');
    await p.fillSynthetic();
    await p.submit.click();
    await expect(page).toHaveURL(/thank-you|confirmation|success/i);
  });
});
```

## Rules
- Import `test`/`expect` from the fixtures file, not `@playwright/test`, so consent
  dismissal and route guards apply.
- One behavior per `test()`. Each test re-navigates (no shared state between tests).
- Use `test.skip(condition, reason)` for elements that legitimately vary across exemplars.
- Never `waitForTimeout`. Never assert volatile copy. Never submit a real form on prod.
