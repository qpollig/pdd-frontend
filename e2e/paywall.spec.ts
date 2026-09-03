import { expect, test, type Page } from '@playwright/test';
import { loginWithYandex, openHeaderLink, pushNamedRoute } from './helpers';

async function loginPremium(page: Page) {
  await page.goto('./auth?premium=1');
  await page.getByRole('button', { name: 'Войти через Яндекс' }).click();
  await expect(page.getByRole('heading', { name: 'Главная' })).toBeVisible();
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflowed = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(overflowed).toBe(false);
}

test.describe('Paywall', () => {
  test('free user sees offer, price and reaches checkout', async ({ page }) => {
    await loginWithYandex(page);
    await page.getByRole('button', { name: 'Получить Premium-доступ' }).click();

    await expect(page.getByRole('heading', { name: 'Premium', exact: true })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Premium: без ограничений по жизням' }),
    ).toBeVisible();
    await expect(page.getByText('3D-видеоразборы каверзных ситуаций на дорогах')).toBeVisible();
    await expect(page.getByText('Бесконечные жизни', { exact: false })).toBeVisible();
    await expect(page.getByText('3 дня за 1 ₽ → 299 ₽/мес')).toBeVisible();

    const purchase = page.getByRole('button', { name: 'Подключить Premium' });
    await expect(purchase).toBeVisible();
    await purchase.click();
    await expect(page.getByRole('heading', { name: 'Оформление' })).toBeVisible();
    await expect(page).toHaveURL(/\/checkout/);
  });

  test('premium user sees active state without purchase CTA', async ({ page }) => {
    await loginPremium(page);
    await expect(page.getByText('Premium', { exact: true }).first()).toBeVisible();
    await openHeaderLink(page, 'Профиль');
    await expect(page.getByRole('heading', { name: 'Профиль' })).toBeVisible();
    // Already-Premium users get no redundant "Premium" CTA on Profile (nothing left to purchase).
    await expect(page.getByRole('button', { name: 'Premium', exact: true })).toHaveCount(0);

    await pushNamedRoute(page, 'paywall');
    await expect(page.getByRole('heading', { name: 'Premium уже активен' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Подключить Premium' })).toHaveCount(0);
    await expect(page.getByTestId('paywall-purchase-cta')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'На главную' })).toBeVisible();
  });

  for (const width of [320, 390, 414] as const) {
    test(`paywall has no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await loginWithYandex(page);
      await page.getByRole('button', { name: 'Получить Premium-доступ' }).click();
      await expect(page.getByText('3 дня за 1 ₽ → 299 ₽/мес')).toBeVisible();
      await expectNoHorizontalOverflow(page);
    });
  }

  test('paywall has no horizontal overflow at 1440px', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginWithYandex(page);
    await page.getByRole('button', { name: 'Получить Premium-доступ' }).click();
    await expect(page.getByText('3 дня за 1 ₽ → 299 ₽/мес')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
