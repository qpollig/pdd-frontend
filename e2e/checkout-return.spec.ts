import { expect, test } from '@playwright/test';
import { initMockCheckoutInPlace, loginWithYandex, openHeaderLink, pushNamedRoute } from './helpers';

/**
 * D1: the live backend's BILLING_RETURN_URL lands on /profile?checkout=success (confirmed
 * 2026-09-08, see D1 report) — there is no dedicated /checkout/return route. `?checkout=success`
 * only means "back from the payment redirect", never proof Premium is active; these tests exercise
 * the bounded polling that turns it into a real, backend-confirmed state (useCheckoutReturn).
 *
 * The full real-browser-redirect round trip is covered in e2e/checkout.spec.ts, but MockApiClient's
 * checkout-activation timer does not survive that reload (a fresh JS instance, by design — see D1
 * report), so "eventually shows Premium" is exercised here instead, via
 * __AV_TEST_CHECKOUT_INIT__ (arms the real activation timer in-process, no reload) combined with
 * SPA-internal navigation to the return URL — real polling, real timing, no faked success.
 */
test.describe('Checkout return', () => {
  test('shows a checking state, then Premium once the mock backend confirms it', async ({ page }) => {
    await loginWithYandex(page);
    await initMockCheckoutInPlace(page);

    await pushNamedRoute(page, 'profile', { checkout: 'success' });
    await expect(page.getByTestId('checkout-return-checking')).toBeVisible();

    await expect(page.getByTestId('checkout-return-success')).toBeVisible({ timeout: 6000 });
    await expect(page.getByText('Premium', { exact: true }).first()).toBeVisible();

    // Same session.user the rest of the app reads — Dashboard sees it too, not a second source of truth.
    await openHeaderLink(page, 'Главная');
    await expect(page.getByRole('button', { name: 'Получить Premium-доступ' })).toHaveCount(0);
  });

  test('manually visiting checkout=success without ever paying never shows a fake success', async ({ page }) => {
    await loginWithYandex(page);

    await pushNamedRoute(page, 'profile', { checkout: 'success' });
    await expect(page.getByTestId('checkout-return-checking')).toBeVisible();

    await expect(page.getByTestId('checkout-return-timeout')).toBeVisible({ timeout: 12_000 });
    await expect(page.getByText('Платёж обрабатывается')).toBeVisible();
    await expect(page.getByTestId('checkout-return-success')).toHaveCount(0);
  });

  test('revisiting checkout=success once Premium is already active shows success immediately', async ({
    page,
  }) => {
    await page.goto('./auth?premium=1');
    await page.getByRole('button', { name: 'Войти через Яндекс' }).click();
    await expect(page.getByRole('heading', { name: 'Главная' })).toBeVisible();

    await pushNamedRoute(page, 'profile', { checkout: 'success' });

    await expect(page.getByTestId('checkout-return-success')).toBeVisible();
    await expect(page.getByTestId('checkout-return-checking')).toHaveCount(0);
  });

  test('a plain profile visit without the checkout query is unaffected', async ({ page }) => {
    await loginWithYandex(page);
    await openHeaderLink(page, 'Профиль');

    await expect(page.getByRole('heading', { name: 'Профиль' })).toBeVisible();
    await expect(page.getByTestId('checkout-return-checking')).toHaveCount(0);
    await expect(page.getByTestId('checkout-return-success')).toHaveCount(0);
    await expect(page.getByTestId('checkout-return-timeout')).toHaveCount(0);
  });
});
