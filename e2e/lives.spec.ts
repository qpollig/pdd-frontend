import { expect, test } from '@playwright/test';
import { MOCK_INITIAL_LIVES, MOCK_LIVES_MAX } from '../src/api/livesFixture';
import { loginWithYandex, openHeaderLink } from './helpers';

test.describe('Freemium lives', () => {
  test('wrong answer updates lives on the player and dashboard', async ({ page }) => {
    await loginWithYandex(page);

    const initial = `${MOCK_INITIAL_LIVES} / ${MOCK_LIVES_MAX}`;
    const afterWrong = `${MOCK_INITIAL_LIVES - 1} / ${MOCK_LIVES_MAX}`;

    const dashboardLives = page.getByRole('status', { name: 'Жизни' });
    await expect(dashboardLives).toBeVisible();
    await expect(dashboardLives).toContainText(initial);

    await page.getByRole('button', { name: 'Начать обучение' }).click();
    await expect(page.getByRole('heading', { name: /Билет 1/ })).toBeVisible();
    await expect(page.getByRole('status', { name: 'Жизни' })).toContainText(initial);

    await page
      .getByRole('button', {
        name: 'Остановившись непосредственно перед пешеходным переходом, чтобы уступить дорогу пешеходу',
      })
      .click();
    await expect(page.getByRole('status', { name: 'Жизни' })).toContainText(afterWrong);

    await page.getByRole('button', { name: 'Вопрос 2, не отвечен' }).click();
    await expect(
      page.getByRole('heading', { name: 'Разрешен ли Вам поворот на дорогу с грунтовым покрытием?' }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Назад' }).click();
    await expect(page.getByRole('heading', { name: 'Билеты' })).toBeVisible();
    await openHeaderLink(page, 'Главная');
    await expect(page.getByRole('heading', { name: 'Главная' })).toBeVisible();
    await expect(page.getByRole('status', { name: 'Жизни' })).toContainText(afterWrong);
  });
});
