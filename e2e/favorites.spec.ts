import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { loginWithYandex } from './helpers';

const ticketPath = join(dirname(fileURLToPath(import.meta.url)), '../src/data/ticket-1.json');
const questions = JSON.parse(readFileSync(ticketPath, 'utf8')) as Array<{
  id: string;
  question: string;
  answers: Array<{ answer_text: string; is_correct: boolean }>;
}>;
/** MockApiClient serves the same fixture bank for every ticket — order_index 0 is always this question. */
const firstQuestion = questions[0]!;

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

  test('login with no favorites shows the empty state', async ({ page }) => {
    await loginWithYandex(page);

    await page.getByRole('button', { name: 'Избранное' }).click();
    await expect(page.getByText('Пока нет избранных вопросов')).toBeVisible();
    await expect(page.getByRole('button', { name: 'К билетам' })).toBeVisible();
  });

  /**
   * Regression: leaving the empty Favorites session (0 questions) for a different ticket used to
   * crash TicketPlayer for one render tick — TicketSessionScreen's fallback branch rendered the
   * stale currentTicket (still Favorites' empty questions array) because the new route's `mode`
   * had already flipped to 'theory' before catalogStore.loadTicket() cleared/replaced it.
   */
  test('leaving the empty Favorites session for a ticket does not crash the player', async ({ page }) => {
    await loginWithYandex(page);

    await page.getByRole('button', { name: 'Избранное' }).click();
    await expect(page.getByRole('button', { name: 'К билетам' })).toBeVisible();

    await page.getByRole('button', { name: 'К билетам' }).click();
    await expect(page.getByRole('heading', { name: 'Билеты' })).toBeVisible();

    await page.getByRole('link', { name: /^Билет 2 / }).click();
    await expect(page.getByRole('heading', { name: /Билет 2/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: firstQuestion.question })).toBeVisible();
  });

  test('a favorited question can be opened, answered and finished from Favorites', async ({ page }) => {
    await loginWithYandex(page);

    await page.getByRole('button', { name: 'Билеты' }).click();
    await page.getByRole('link', { name: /^Билет 1 / }).click();
    await expect(page.getByRole('heading', { name: firstQuestion.question })).toBeVisible();
    await page.getByRole('button', { name: 'Добавить в избранное' }).click();
    await expect(page.getByRole('button', { name: 'В избранном' })).toBeVisible();

    await page.getByRole('button', { name: 'Назад' }).click();
    await expect(page.getByRole('heading', { name: 'Билеты' })).toBeVisible();
    await page.getByRole('link', { name: 'Главная' }).click();

    await page.getByRole('button', { name: 'Избранное' }).click();
    await expect(page.getByRole('heading', { name: 'Избранное' })).toBeVisible();
    await expect(page.getByRole('heading', { name: firstQuestion.question })).toBeVisible();

    const correct = firstQuestion.answers.find((answer) => answer.is_correct);
    if (!correct) throw new Error(`Question ${firstQuestion.id} has no correct option`);
    await page.getByRole('button', { name: correct.answer_text, exact: true }).click();
    await page.getByRole('button', { name: 'Завершить проработку избранного' }).click();

    const result = page.getByRole('dialog', { name: 'Результат проработки избранного' });
    await expect(result).toBeVisible();
    await result.getByRole('button', { name: 'На главную' }).click();
    await expect(page.getByRole('heading', { name: 'Главная' })).toBeVisible();
  });
});
