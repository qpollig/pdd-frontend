import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { MOCK_ERROR_QUESTION_IDS } from '../src/api/errorQuestionsFixture';
import { loginWithYandex, pushNamedRoute } from './helpers';

const ticketPath = join(dirname(fileURLToPath(import.meta.url)), '../src/data/ticket-1.json');
const questions = JSON.parse(readFileSync(ticketPath, 'utf8')) as Array<{
  id: string;
  question: string;
  answers: Array<{ answer_text: string; is_correct: boolean }>;
  answer_tip: string;
}>;

const errorQuestions = MOCK_ERROR_QUESTION_IDS.map((id) => {
  const item = questions.find((question) => question.id === id);
  if (!item) {
    throw new Error(`Missing fixture question ${id}`);
  }
  return item;
});

test.describe('Errors mode', () => {
  test('login → dashboard → errors → answer → feedback → finish → dashboard', async ({ page }) => {
    await loginWithYandex(page);

    await page.getByRole('button', { name: 'Ошибки' }).click();
    await expect(page.getByText('Ошибки', { exact: true }).first()).toBeVisible();

    for (let index = 0; index < errorQuestions.length; index += 1) {
      const item = errorQuestions[index];
      const correct = item.answers.find((answer) => answer.is_correct);
      if (!correct) {
        throw new Error(`Question ${item.id} has no correct option`);
      }

      await expect(page.getByRole('heading', { name: item.question })).toBeVisible();
      await page.getByRole('button', { name: correct.answer_text, exact: true }).click();

      await expect(page.getByRole('status', { name: 'Результат ответа' })).toHaveText('Верно');
      await expect(page.getByRole('region', { name: 'Пояснение' })).toContainText(
        item.answer_tip.slice(0, 40),
      );

      if (index < errorQuestions.length - 1) {
        await page.getByRole('button', { name: 'Следующий вопрос' }).click();
      } else {
        await page.getByRole('button', { name: 'Завершить проработку ошибок' }).click();
      }
    }

    const result = page.getByRole('dialog', { name: 'Результат проработки ошибок' });
    await expect(result).toBeVisible();
    await expect(result.getByRole('paragraph').filter({ hasText: 'Ошибки' })).toBeVisible();
    await expect(result.getByText('Поздравляю! 0 ошибок.')).toBeVisible();
    await expect(result.getByRole('button', { name: 'Вернуться к теории' })).toBeVisible();
    await expect(result.getByRole('button', { name: 'К следующей ошибке' })).toHaveCount(0);

    await result.getByRole('button', { name: 'На главную' }).click();
    await expect(page.getByRole('heading', { name: 'Главная' })).toBeVisible();
  });

  test('remaining errors after finish open a fresh errors session', async ({ page }) => {
    await loginWithYandex(page);
    await page.getByRole('button', { name: 'Ошибки' }).click();

    for (let index = 0; index < errorQuestions.length; index += 1) {
      const item = errorQuestions[index];
      const wantCorrect = index < errorQuestions.length - 1;
      const option = item.answers.find((answer) => answer.is_correct === wantCorrect);
      if (!option) {
        throw new Error(`Missing option for ${item.id}`);
      }

      await expect(page.getByRole('heading', { name: item.question })).toBeVisible();
      await page.getByRole('button', { name: option.answer_text, exact: true }).click();

      if (index < errorQuestions.length - 1) {
        await page.getByRole('button', { name: 'Следующий вопрос' }).click();
      } else {
        await page.getByRole('button', { name: 'Завершить проработку ошибок' }).click();
      }
    }

    const leftover = errorQuestions[errorQuestions.length - 1];
    const result = page.getByRole('dialog', { name: 'Результат проработки ошибок' });
    await expect(result).toBeVisible();
    await expect(result.getByRole('button', { name: 'К следующей ошибке' })).toBeVisible();
    await expect(result.getByRole('button', { name: 'Вернуться к теории' })).toHaveCount(0);

    await result.getByRole('button', { name: 'К следующей ошибке' }).click();
    await expect(page.getByRole('dialog', { name: 'Результат проработки ошибок' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: leftover.question })).toBeVisible();
    await expect(page.getByRole('status', { name: 'Результат ответа' })).toHaveCount(0);
    await expect(
      page.getByRole('navigation', { name: 'Навигация по вопросам билета' }).getByRole('button'),
    ).toHaveCount(1);
  });

  test('login with empty error history shows empty state', async ({ page }) => {
    await page.goto('./auth?errors=none');
    await page.getByRole('button', { name: 'Войти через Яндекс' }).click();
    await expect(page.getByRole('heading', { name: 'Главная' })).toBeVisible();

    // D2: with errors_count === 0 the Dashboard "Ошибки" card is disabled and does not navigate
    // (see dashboard.spec.ts) — reach the empty Errors screen directly to keep covering it.
    const errorsButton = page.getByRole('button', { name: 'Ошибки' });
    await expect(errorsButton).toBeDisabled();
    await pushNamedRoute(page, 'errors-session', { mode: 'errors' });
    await expect(page.getByText('Ошибок для проработки пока нет')).toBeVisible();
    await expect(page.getByRole('button', { name: 'К теории' })).toBeVisible();
  });
});
