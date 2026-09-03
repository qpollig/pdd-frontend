import { expect, test } from '@playwright/test';
import { loginWithYandex } from './helpers';

test.describe('Favorites', () => {
  test('toggling a question favorite calls the Favorites API and updates the button', async ({ page }) => {
    await loginWithYandex(page);

    await page.getByRole('button', { name: 'Билеты' }).click();
    await page.getByRole('link', { name: /^Билет 1 / }).click();
    await expect(page.getByRole('heading', { name: /Билет 1/ })).toBeVisible();

    const favoriteButton = page.getByRole('button', { name: 'Добавить в избранное' });
    await expect(favoriteButton).toBeVisible();

    await favoriteButton.click();
    await expect(page.getByRole('button', { name: 'В избранном' })).toBeVisible();

    await page.getByRole('button', { name: 'В избранном' }).click();
    await expect(page.getByRole('button', { name: 'Добавить в избранное' })).toBeVisible();
  });
});
