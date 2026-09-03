import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { loginWithYandex } from './helpers';

const ticketPath = join(dirname(fileURLToPath(import.meta.url)), '../src/data/ticket-1.json');
const questions = JSON.parse(readFileSync(ticketPath, 'utf8')) as Array<{
  question: string;
  answers: Array<{ answer_text: string; is_correct: boolean }>;
  answer_tip: string;
}>;

test.describe('Theory mode', () => {
  test('login → dashboard → theory → ticket → immediate feedback → next → result', async ({
    page,
  }) => {
    await loginWithYandex(page);

    await page.getByRole('button', { name: 'Билеты' }).click();
    await expect(page.getByRole('heading', { name: 'Билеты' })).toBeVisible();

    await page.getByRole('link', { name: /^Билет 1 / }).click();
    await expect(page.getByText('Теория', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: /Билет 1/ })).toBeVisible();
    await expect(page.getByRole('timer')).toHaveCount(0);

    for (let index = 0; index < questions.length; index += 1) {
      const item = questions[index];
      const correct = item.answers.find((answer) => answer.is_correct);
      if (!correct) {
        throw new Error(`Question ${index + 1} has no correct option`);
      }

      await expect(page.getByRole('heading', { name: item.question })).toBeVisible();
      await page.getByRole('button', { name: correct.answer_text, exact: true }).click();

      await expect(page.getByRole('status', { name: 'Результат ответа' })).toHaveText('Верно');
      await expect(page.getByRole('region', { name: 'Пояснение' })).toContainText(
        item.answer_tip.slice(0, 40),
      );

      if (index < questions.length - 1) {
        await page.getByRole('button', { name: 'Следующий вопрос' }).click();
      } else {
        await page.getByRole('button', { name: 'Завершить билет' }).click();
      }
    }

    const result = page.getByRole('dialog', { name: 'Результат билета' });
    await expect(result).toBeVisible();
    await expect(result.getByText('Теория')).toBeVisible();
    await expect(result.getByText('Поздравляю! 0 ошибок.')).toBeVisible();
    await expect(result.getByRole('button', { name: 'Следующий билет' })).toBeVisible();
    await expect(result.getByRole('button', { name: 'К билетам' })).toBeVisible();
    await expect(result.getByRole('button', { name: 'На главную' })).toBeVisible();

    await result.getByRole('button', { name: 'Следующий билет' }).click();
    await expect(page.getByRole('dialog', { name: 'Результат билета' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /Билет 2/ })).toBeVisible();
    await expect(page).toHaveURL(/\/tickets\/00000000-0000-4000-8000-000000000002/);
    await expect(page.getByRole('heading', { name: questions[0].question })).toBeVisible();
    await expect(page.getByRole('status', { name: 'Результат ответа' })).toHaveCount(0);
  });
});
