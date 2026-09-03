import { expect, test, type Page } from '@playwright/test';
import { loginWithYandex, openHeaderLink, pushNamedRoute } from './helpers';

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

  test('free user can complete mock checkout and see Premium on dashboard and profile', async ({
    page,
  }) => {
    await loginWithYandex(page);
    await openCheckoutFromPaywall(page);
    await expect(page.getByText('3 дня за 1 ₽ → 299 ₽/мес')).toBeVisible();
    await expect(page.getByText('будет автоматически списываться 299 ₽ в месяц', { exact: false })).toBeVisible();

    await fillPlaceholderCard(page);
    await page.getByTestId('checkout-pay-cta').click();

    await expect(page.getByTestId('checkout-success')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Premium подключён' })).toBeVisible();
    await page.getByTestId('checkout-success-cta').click();

    await expect(page.getByRole('heading', { name: 'Главная' })).toBeVisible();
    await expect(page.getByText('Premium', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Получить Premium-доступ' })).toHaveCount(0);

    await openHeaderLink(page, 'Профиль');
    await expect(page.getByRole('heading', { name: 'Профиль' })).toBeVisible();
    await expect(page.getByText('Premium', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Пробный период')).toBeVisible();
  });

  test('failed mock payment can be retried', async ({ page }) => {
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
    await expect(page.getByTestId('checkout-success')).toBeVisible();
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

  test('double submit sends one mock payment', async ({ page }) => {
    await loginWithYandex(page);
    await openCheckoutFromPaywall(page);
    await fillPlaceholderCard(page);
    const cta = page.getByTestId('checkout-pay-cta');
    await Promise.all([cta.click(), cta.click()]);
    await expect(page.getByTestId('checkout-success')).toBeVisible();
    const calls = await page.evaluate(
      () => (window as Window & { __AV_TEST_CHECKOUT_CALLS__?: number }).__AV_TEST_CHECKOUT_CALLS__,
    );
    expect(calls).toBe(1);
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
