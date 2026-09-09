import { expect, test, type Page } from '@playwright/test';
import { loginWithYandex, pushNamedRoute } from './helpers';

async function expectNoHorizontalOverflow(page: Page) {
  const overflowed = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(overflowed).toBe(false);
}

async function fillPlaceholderCard(page: Page) {
  await page.getByTestId('checkout-card-number').fill('4242424242424242');
  await page.getByTestId('checkout-card-expiry').fill('12/30');
  await page.getByTestId('checkout-card-cvv').fill('123');
}

async function openCheckoutFromPaywall(page: Page) {
  await page.getByRole('button', { name: 'Получить Premium-доступ' }).click();
  await page.getByRole('button', { name: 'Подключить Premium' }).click();
  await expect(page.getByRole('heading', { name: 'Оформление' })).toBeVisible();
}

test.describe('Checkout', () => {
  test('anonymous user is sent to auth', async ({ page }) => {
    await page.goto('./checkout');
    await expect(page.getByRole('heading', { name: 'Вход' })).toBeVisible();
  });

  /**
   * D1: checkout/init only starts a redirect-oriented payment — it never resolves to a synchronous
   * success on this screen (see domain/checkout.ts). Paying really navigates the browser away to
   * confirmation_url (MockApiClient models that with a same-origin URL) and back, a real full-page
   * reload; auth survives it via the one-shot sessionStorage bridge (see sessionStore.spec.ts for
   * the bridge's own unit coverage) rather than anything visible here. Premium confirmation itself
   * is covered in e2e/checkout-return.spec.ts, since MockApiClient's activation timer — armed by
   * checkout() — does not survive this same reload (documented limitation, see D1 report).
   */
  test('paying navigates the browser to confirmation_url, and auth survives the reload back', async ({
    page,
  }) => {
    await loginWithYandex(page);
    await openCheckoutFromPaywall(page);
    await expect(page.getByText('3 дня за 1 ₽ → 299 ₽/мес')).toBeVisible();
    await expect(page.getByText('будет автоматически списываться 299 ₽ в месяц', { exact: false })).toBeVisible();

    await fillPlaceholderCard(page);
    await page.getByTestId('checkout-pay-cta').click();

    // Real browser navigation, not SPA routing — matches the live backend's actual redirect chain.
    await page.waitForURL(/checkout=success/);
    await expect(page.getByRole('heading', { name: 'Профиль' })).toBeVisible();
    // No bounce to /auth despite the full reload — the checkout auth bridge restored the session.
    await expect(page.getByRole('heading', { name: 'Вход' })).toHaveCount(0);
    await expect(page.getByTestId('checkout-return-checking')).toBeVisible();
  });

  test('failed mock payment can be retried, and a retry also redirects the browser', async ({ page }) => {
    await loginWithYandex(page);
    await openCheckoutFromPaywall(page);
    await fillPlaceholderCard(page);

    await page.evaluate(() => {
      (window as Window & { __AV_TEST_CHECKOUT_FAIL__?: boolean }).__AV_TEST_CHECKOUT_FAIL__ = true;
    });
    await page.getByTestId('checkout-pay-cta').click();
    await expect(page.getByText('Оплата не прошла')).toBeVisible();
    await expect(page.getByTestId('checkout-pay-cta')).toBeEnabled();

    await page.evaluate(() => {
      (window as Window & { __AV_TEST_CHECKOUT_FAIL__?: boolean }).__AV_TEST_CHECKOUT_FAIL__ = false;
    });
    await page.getByTestId('checkout-pay-cta').click();
    await page.waitForURL(/checkout=success/);
  });

  test('already Premium user sees active state and cannot pay again', async ({ page }) => {
    await page.goto('./auth?premium=1');
    await page.getByRole('button', { name: 'Войти через Яндекс' }).click();
    await expect(page.getByRole('heading', { name: 'Главная' })).toBeVisible();

    await pushNamedRoute(page, 'checkout');
    await expect(page.getByTestId('checkout-already-premium')).toBeVisible();
    await expect(page.getByTestId('checkout-pay-cta')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'На главную' })).toBeVisible();
  });

  test('double submit starts one mock payment', async ({ page }) => {
    await loginWithYandex(page);
    await openCheckoutFromPaywall(page);
    await fillPlaceholderCard(page);
    await expect(page.getByTestId('checkout-pay-cta')).toBeVisible();
    /**
     * Two separate page.locator().click() calls raced via Promise.all each run Playwright's own
     * actionability protocol (hover, wait for stability, then dispatch) against a button whose
     * submit handler starts navigating away almost immediately — the second call's wait can
     * resolve its element handle right as that navigation tears the node out, surfacing as
     * "element was detached from the DOM" under load (reproduced under stress: 1/15 runs). A real
     * double-click fires both native activation clicks in one synchronous browser turn, before
     * Vue or the navigation ever runs — dispatch it that way so the test proves the app-level
     * double-submit guard rather than racing Playwright's own automation timing.
     */
    await page.evaluate(() => {
      const button = document.querySelector<HTMLButtonElement>('[data-testid="checkout-pay-cta"]');
      button?.click();
      button?.click();
    });
    await page.waitForURL(/checkout=success/);
    // The counter is mirrored into sessionStorage because the redirect's full-page reload wipes
    // the __AV_TEST_CHECKOUT_CALLS__ window global before this assertion could read it.
    const calls = await page.evaluate(() => sessionStorage.getItem('__av_test_checkout_calls__'));
    expect(calls).toBe('1');
  });

  for (const width of [320, 390, 414] as const) {
    test(`checkout has no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await loginWithYandex(page);
      await openCheckoutFromPaywall(page);
      await expect(page.getByTestId('checkout-pay-cta')).toBeVisible();
      await expectNoHorizontalOverflow(page);

      await fillPlaceholderCard(page);
      await page.evaluate(() => {
        (window as Window & { __AV_TEST_CHECKOUT_FAIL__?: boolean }).__AV_TEST_CHECKOUT_FAIL__ = true;
      });
      await page.getByTestId('checkout-pay-cta').click();
      await expect(page.getByText('Оплата не прошла')).toBeVisible();
      await expectNoHorizontalOverflow(page);
    });
  }

  test('checkout has no horizontal overflow at 1440px', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginWithYandex(page);
    await openCheckoutFromPaywall(page);
    await expect(page.getByText('3 дня за 1 ₽ → 299 ₽/мес')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
