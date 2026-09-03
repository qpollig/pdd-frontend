import type { FixtureQuestion } from '../types/ticket';

/** ТЗ §3.2 Экзамен ГИБДД: 20 основных вопросов. */
export const EXAM_BASE_QUESTION_COUNT = 20;

/** ТЗ §4.3 session/start time_limit_seconds для gibdd_exam. */
export const EXAM_TIME_LIMIT_SECONDS = 1200;

/** ТЗ §3.2: +5 доп. вопросов за 1–2 ошибки по теме. */
export const EXAM_EXTRA_PER_ELIGIBLE_MISTAKE = 5;

/** ТЗ §3.2: доп. вопросы только за 1–2 ошибки (не за третью и далее). */
export const EXAM_ELIGIBLE_MISTAKE_MAX = 2;

/**
 * Сколько доп. вопросов добавить за очередную ошибку на основном вопросе.
 * `previousBaseMistakes` — число ошибок на базовых вопросах до этой.
 */
export function extrasToAddForBaseMistake(previousBaseMistakes: number): number {
  const nextCount = previousBaseMistakes + 1;
  if (nextCount >= 1 && nextCount <= EXAM_ELIGIBLE_MISTAKE_MAX) {
    return EXAM_EXTRA_PER_ELIGIBLE_MISTAKE;
  }
  return 0;
}

export function computeExamPassed(input: {
  baseMistakes: number;
  extraMistakes: number;
  unanswered: number;
  timedOut: boolean;
}): boolean {
  if (input.unanswered > 0) return false;
  if (input.extraMistakes > 0) return false;
  if (input.baseMistakes > EXAM_ELIGIBLE_MISTAKE_MAX) return false;
  if (input.timedOut && input.unanswered > 0) return false;
  return true;
}

/**
 * Test-only override for the exam duration. openapi.json SessionStartResponse carries no
 * time_limit_seconds field — the limit is a pure frontend rule (ТЗ §3.2), not backend state.
 */
export function resolveExamTimeLimitSeconds(): number {
  if (typeof window === 'undefined') return EXAM_TIME_LIMIT_SECONDS;
  const value = (window as Window & { __AV_TEST_EXAM_SECONDS__?: number }).__AV_TEST_EXAM_SECONDS__;
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : EXAM_TIME_LIMIT_SECONDS;
}

export function formatExamClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

/**
 * Выбор доп. вопросов той же темы.
 * ASSUMPTION: полного банка 800 вопросов нет — если уникальных по теме не хватает,
 * клонируем вопрос темы с новым id (детерминированно).
 */
export function pickExtraQuestions(
  bank: FixtureQuestion[],
  alreadyUsedIds: Set<string>,
  topic: string | undefined,
  count: number,
): FixtureQuestion[] {
  if (count <= 0) return [];
  const extras: FixtureQuestion[] = [];
  const sameTopic = bank.filter((question) =>
    topic ? question.topic.includes(topic) : true,
  );
  for (const question of sameTopic) {
    if (extras.length >= count) break;
    if (alreadyUsedIds.has(question.id)) continue;
    extras.push(question);
    alreadyUsedIds.add(question.id);
  }

  const source = sameTopic[0] ?? bank[0];
  let cloneIndex = 1;
  while (extras.length < count && source) {
    const id = `${source.id}__extra__${cloneIndex}`;
    cloneIndex += 1;
    if (alreadyUsedIds.has(id)) continue;
    alreadyUsedIds.add(id);
    extras.push({
      ...source,
      id,
      answers: source.answers.map((answer) => ({ ...answer })),
      topic: [...source.topic],
    });
  }
  return extras;
}
