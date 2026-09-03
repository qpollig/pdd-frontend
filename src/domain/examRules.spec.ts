import { afterEach, describe, expect, it } from 'vitest';
import type { FixtureQuestion } from '../types/ticket';
import {
  EXAM_BASE_QUESTION_COUNT,
  EXAM_ELIGIBLE_MISTAKE_MAX,
  EXAM_EXTRA_PER_ELIGIBLE_MISTAKE,
  EXAM_TIME_LIMIT_SECONDS,
  computeExamPassed,
  extrasToAddForBaseMistake,
  formatExamClock,
  pickExtraQuestions,
  resolveExamTimeLimitSeconds,
} from './examRules';

function q(id: string, topic: string): FixtureQuestion {
  return {
    title: id,
    ticket_number: 'Билет 1',
    ticket_category: 'A,B',
    image: './images/no_image.jpg',
    question: id,
    answers: [
      { answer_text: 'A', is_correct: true },
      { answer_text: 'B', is_correct: false },
    ],
    correct_answer: 'Правильный ответ: 1',
    answer_tip: 'tip',
    topic: [topic],
    id,
  };
}

describe('examRules TZ §3.2', () => {
  it('uses 20 base questions and 1200 seconds', () => {
    expect(EXAM_BASE_QUESTION_COUNT).toBe(20);
    expect(EXAM_TIME_LIMIT_SECONDS).toBe(1200);
    expect(EXAM_EXTRA_PER_ELIGIBLE_MISTAKE).toBe(5);
    expect(EXAM_ELIGIBLE_MISTAKE_MAX).toBe(2);
  });

  it('adds 5 extras for the first and second base mistakes and none after that', () => {
    expect(extrasToAddForBaseMistake(0)).toBe(5);
    expect(extrasToAddForBaseMistake(1)).toBe(5);
    expect(extrasToAddForBaseMistake(2)).toBe(0);
    expect(extrasToAddForBaseMistake(3)).toBe(0);
  });

  it('passes with 0 mistakes and no extras', () => {
    expect(
      computeExamPassed({
        baseMistakes: 0,
        extraMistakes: 0,
        unanswered: 0,
        timedOut: false,
      }),
    ).toBe(true);
  });

  it('passes with 1–2 base mistakes when extras have no mistakes', () => {
    expect(
      computeExamPassed({
        baseMistakes: 1,
        extraMistakes: 0,
        unanswered: 0,
        timedOut: false,
      }),
    ).toBe(true);
    expect(
      computeExamPassed({
        baseMistakes: 2,
        extraMistakes: 0,
        unanswered: 0,
        timedOut: false,
      }),
    ).toBe(true);
  });

  it('fails on extra-question mistakes, 3+ base mistakes, unanswered, or timeout with gaps', () => {
    expect(
      computeExamPassed({
        baseMistakes: 1,
        extraMistakes: 1,
        unanswered: 0,
        timedOut: false,
      }),
    ).toBe(false);
    expect(
      computeExamPassed({
        baseMistakes: 3,
        extraMistakes: 0,
        unanswered: 0,
        timedOut: false,
      }),
    ).toBe(false);
    expect(
      computeExamPassed({
        baseMistakes: 0,
        extraMistakes: 0,
        unanswered: 1,
        timedOut: true,
      }),
    ).toBe(false);
    expect(
      computeExamPassed({
        baseMistakes: 0,
        extraMistakes: 0,
        unanswered: 1,
        timedOut: false,
      }),
    ).toBe(false);
  });

  it('formats the exam clock as MM:SS', () => {
    expect(formatExamClock(1200)).toBe('20:00');
    expect(formatExamClock(1199)).toBe('19:59');
    expect(formatExamClock(0)).toBe('00:00');
  });

  it('picks extra questions from the same topic before cloning', () => {
    const bank = [q('a', 'signs'), q('b', 'signs'), q('c', 'other')];
    const extras = pickExtraQuestions(bank, new Set(['a']), 'signs', 5);
    expect(extras).toHaveLength(5);
    expect(extras[0]?.id).toBe('b');
    expect(extras.slice(1).every((item) => item.topic.includes('signs'))).toBe(true);
    expect(new Set(extras.map((item) => item.id)).size).toBe(5);
  });
});

describe('resolveExamTimeLimitSeconds', () => {
  afterEach(() => {
    delete (window as Window & { __AV_TEST_EXAM_SECONDS__?: number }).__AV_TEST_EXAM_SECONDS__;
  });

  it('defaults to the production 1200s limit, not a backend value (openapi.json has no such field)', () => {
    expect(resolveExamTimeLimitSeconds()).toBe(EXAM_TIME_LIMIT_SECONDS);
  });

  it('honors a positive test-only override', () => {
    (window as Window & { __AV_TEST_EXAM_SECONDS__?: number }).__AV_TEST_EXAM_SECONDS__ = 2;
    expect(resolveExamTimeLimitSeconds()).toBe(2);
  });

  it('ignores a non-positive or non-finite override', () => {
    (window as Window & { __AV_TEST_EXAM_SECONDS__?: number }).__AV_TEST_EXAM_SECONDS__ = 0;
    expect(resolveExamTimeLimitSeconds()).toBe(EXAM_TIME_LIMIT_SECONDS);
  });
});
