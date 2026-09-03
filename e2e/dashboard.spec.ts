import { expect, test, type Page } from '@playwright/test';
import { loginWithYandex } from './helpers';

async function expectNoHorizontalOverflow(page: Page) {
  const overflowed = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(overflowed).toBe(false);
}

test.describe('Dashboard hierarchy', () => {
  test('leads with one primary learning action, other modes stay secondary', async ({ page }) => {
    await loginWithYandex(page);

    const primary = page.getByRole('button', { name: 'Начать обучение' });
    await expect(primary).toBeVisible();

    await expect(page.getByRole('button', { name: 'Ошибки' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Экзамен ГИБДД' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Билеты' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Получить Premium-доступ' })).toBeVisible();

    await primary.click();
    await expect(page.getByRole('heading', { name: /Билет 1/ })).toBeVisible();
  });

  for (const width of [320, 390, 414, 768, 1440] as const) {
    test(`dashboard has no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await loginWithYandex(page);
      await expect(page.getByRole('button', { name: 'Начать обучение' })).toBeVisible();
      await expectNoHorizontalOverflow(page);
    });
  }
});
