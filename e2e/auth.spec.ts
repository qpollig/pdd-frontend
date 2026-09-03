import { expect, test } from '@playwright/test';
import { loginWithYandex, openHeaderLink } from './helpers';

test.describe('Mock authentication', () => {
  test('Yandex mock login opens dashboard and keeps session on in-app navigation', async ({
    page,
  }) => {
    await loginWithYandex(page);
    await page.getByRole('button', { name: 'Билеты' }).click();
    await expect(page.getByRole('heading', { name: 'Билеты' })).toBeVisible();
    await openHeaderLink(page, 'Главная');
    await expect(page.getByRole('heading', { name: 'Главная' })).toBeVisible();
  });

  test('logout returns to the auth screen', async ({ page }) => {
    await loginWithYandex(page);
    await openHeaderLink(page, 'Профиль');
    await page.getByRole('button', { name: 'Выйти' }).click();
    await expect(page.getByRole('heading', { name: 'Вход' })).toBeVisible();
    await page.goto('./dashboard');
    await expect(page.getByRole('heading', { name: 'Вход' })).toBeVisible();
  });
});
