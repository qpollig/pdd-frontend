import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../api/client';
import type { Question } from '../domain/question';
import { useTicketStore } from './ticketStore';

function makeQuestion(id: string): Question {
  return {
    id,
    orderIndex: 0,
    text: `Вопрос ${id}`,
    imageUrl: null,
    videoUrl: null,
    explanation: 'tip',
    isFavorite: false,
    answers: [
      { id: `${id}::a0`, orderIndex: 0, text: 'A', isCorrect: true },
      { id: `${id}::a1`, orderIndex: 1, text: 'B', isCorrect: false },
    ],
  };
}

function makeQuestions(count: number): Question[] {
  return Array.from({ length: count }, (_, index) => makeQuestion(String(index)));
}

const questions = makeQuestions(20);
const twoQuestions = questions.slice(0, 2);

describe('ticketStore Theory mode', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('creates a ticket session in theory mode', () => {
    const store = useTicketStore();
    store.startTicket('ticket-1', twoQuestions, 'theory');

    expect(store.mode).toBe('theory');
    expect(store.progress['ticket-1']?.currentIndex).toBe(0);
    expect(store.hasTimer).toBe(false);
  });

  it('records correct/incorrect from the API result, not a local recast', () => {
    const store = useTicketStore();
    store.startTicket('ticket-1', twoQuestions, 'theory');

    store.applyAnswerResult('ticket-1', {
      selectedAnswerId: '0::a0',
      isCorrect: false,
      correctAnswerId: '0::a1',
    });

    const state = store.progress['ticket-1']?.questionStates[0];
    expect(state?.status).toBe('incorrect');
    expect(state?.selectedAnswerId).toBe('0::a0');
    expect(state?.correctAnswerId).toBe('0::a1');
  });

  it('keeps the current question after an answer so feedback can be read', () => {
    const store = useTicketStore();
    store.startTicket('ticket-1', twoQuestions, 'theory');
    store.applyAnswerResult('ticket-1', {
      selectedAnswerId: '0::a1',
      isCorrect: true,
      correctAnswerId: '0::a1',
    });

    expect(store.progress['ticket-1']?.currentIndex).toBe(0);
  });

  it('moves to the next question only on an explicit next action', () => {
    const store = useTicketStore();
    store.startTicket('ticket-1', twoQuestions, 'theory');
    store.applyAnswerResult('ticket-1', {
      selectedAnswerId: '0::a1',
      isCorrect: true,
      correctAnswerId: '0::a1',
    });

    store.goToNextQuestion('ticket-1');

    expect(store.progress['ticket-1']?.currentIndex).toBe(1);
  });

  it('marks the ticket complete after the last question is answered', () => {
    const store = useTicketStore();
    store.startTicket('ticket-1', twoQuestions, 'theory');
    store.applyAnswerResult('ticket-1', {
      selectedAnswerId: '0::a1',
      isCorrect: true,
      correctAnswerId: '0::a1',
    });
    store.goToNextQuestion('ticket-1');
    store.applyAnswerResult('ticket-1', {
      selectedAnswerId: '1::a0',
      isCorrect: true,
      correctAnswerId: '1::a0',
    });

    expect(store.isTicketComplete('ticket-1')).toBe(true);
    expect(store.getTicketStats('ticket-1')).toEqual({
      total: 2,
      answered: 2,
      correct: 2,
      favorites: 0,
    });
  });

  it('does not store lives on the ticket progress', () => {
    const store = useTicketStore();
    store.startTicket('ticket-1', twoQuestions, 'theory');
    expect('lives' in store.progress['ticket-1']!).toBe(false);
    expect(store.progress['ticket-1']).not.toHaveProperty('lives_current');
  });
});

describe('ticketStore Errors mode', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('creates a session in errors mode', () => {
    const store = useTicketStore();
    store.startTicket('errors-session', twoQuestions, 'errors');

    expect(store.mode).toBe('errors');
    expect(store.hasTimer).toBe(false);
    expect(store.progress['errors-session']?.questionStates).toHaveLength(2);
  });

  it('advances and completes an Errors session with the same progress model', () => {
    const store = useTicketStore();
    store.startTicket('errors-session', twoQuestions, 'errors');

    store.applyAnswerResult('errors-session', {
      selectedAnswerId: '0::a1',
      isCorrect: true,
      correctAnswerId: '0::a1',
    });
    expect(store.progress['errors-session']?.currentIndex).toBe(0);

    store.goToNextQuestion('errors-session');
    expect(store.progress['errors-session']?.currentIndex).toBe(1);

    store.applyAnswerResult('errors-session', {
      selectedAnswerId: '1::a0',
      isCorrect: false,
      correctAnswerId: '1::a1',
    });

    expect(store.isTicketComplete('errors-session')).toBe(true);
    expect(store.getTicketStats('errors-session')).toEqual({
      total: 2,
      answered: 2,
      correct: 1,
      favorites: 0,
    });
  });

  it('resets Errors progress on a new start so a later empty or shorter set is not mixed', () => {
    const store = useTicketStore();
    store.startTicket('errors-session', twoQuestions, 'errors');
    store.applyAnswerResult('errors-session', {
      selectedAnswerId: '0::a1',
      isCorrect: true,
      correctAnswerId: '0::a1',
    });

    store.startTicket('errors-session', [twoQuestions[0]!], 'errors');

    expect(store.progress['errors-session']?.currentIndex).toBe(0);
    expect(store.progress['errors-session']?.questionStates[0]?.status).toBe('unanswered');
    expect(store.progress['errors-session']?.questionStates).toHaveLength(1);
  });
});

describe('ticketStore Exam mode', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates a 20-question exam session with a timer', () => {
    const store = useTicketStore();
    store.startTicket('exam-gibdd', questions, 'exam', { remainingSeconds: 1200 });

    expect(store.mode).toBe('exam');
    expect(store.hasTimer).toBe(true);
    expect(store.progress['exam-gibdd']?.questionStates).toHaveLength(20);
    expect(store.progress['exam-gibdd']?.remainingSeconds).toBe(1200);
    expect(store.progress['exam-gibdd']?.examStatus).toBe('in_progress');
  });

  it('records an exam answer as answered without revealing correctness', () => {
    const store = useTicketStore();
    store.startTicket('exam-gibdd', twoQuestions, 'exam', { remainingSeconds: 1200 });
    store.applyAnswerResult('exam-gibdd', {
      selectedAnswerId: '0::a0',
      isCorrect: false,
      correctAnswerId: '0::a1',
    });

    const state = store.progress['exam-gibdd']?.questionStates[0];
    expect(state?.status).toBe('answered');
    expect(state?.selectedAnswerId).toBe('0::a0');
    expect(state?.correctAnswerId).toBeNull();
  });

  it('grows the required question slots when extras are appended', () => {
    const store = useTicketStore();
    store.startTicket('exam-gibdd', twoQuestions, 'exam', { remainingSeconds: 1200 });
    store.appendQuestionSlots('exam-gibdd', 5);
    expect(store.progress['exam-gibdd']?.questionStates).toHaveLength(7);
    expect(store.getTicketStats('exam-gibdd').total).toBe(7);
  });

  it('decrements remaining time and stops at timeout', () => {
    vi.useFakeTimers();
    const store = useTicketStore();
    store.startTicket('exam-gibdd', twoQuestions, 'exam', { remainingSeconds: 2 });

    store.tickExamTimer('exam-gibdd');
    expect(store.progress['exam-gibdd']?.remainingSeconds).toBe(1);
    expect(store.progress['exam-gibdd']?.examStatus).toBe('in_progress');

    store.tickExamTimer('exam-gibdd');
    expect(store.progress['exam-gibdd']?.remainingSeconds).toBe(0);
    expect(store.progress['exam-gibdd']?.examStatus).toBe('timed_out');

    store.tickExamTimer('exam-gibdd');
    expect(store.progress['exam-gibdd']?.remainingSeconds).toBe(0);
  });

  it('stopExam freezes the timer status', () => {
    const store = useTicketStore();
    store.startTicket('exam-gibdd', twoQuestions, 'exam', { remainingSeconds: 10 });
    store.stopExam('exam-gibdd', 'finished');
    store.tickExamTimer('exam-gibdd');
    expect(store.progress['exam-gibdd']?.remainingSeconds).toBe(10);
    expect(store.progress['exam-gibdd']?.examStatus).toBe('finished');
  });

  it('replaces a finished exam with a fresh session on startTicket', () => {
    const store = useTicketStore();
    store.startTicket('exam-gibdd', twoQuestions, 'exam', { remainingSeconds: 10 });
    store.applyAnswerResult('exam-gibdd', {
      selectedAnswerId: '0::a0',
      isCorrect: true,
      correctAnswerId: '0::a0',
    });
    store.stopExam('exam-gibdd', 'finished');

    store.startTicket('exam-gibdd', twoQuestions, 'exam', { remainingSeconds: 1200 });

    expect(store.progress['exam-gibdd']?.examStatus).toBe('in_progress');
    expect(store.progress['exam-gibdd']?.remainingSeconds).toBe(1200);
    expect(store.progress['exam-gibdd']?.currentIndex).toBe(0);
    expect(store.progress['exam-gibdd']?.questionStates[0]?.status).toBe('unanswered');
  });
});

describe('ticketStore favorites', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
  });

  it('seeds isFavorite from the question itself, not a local default', () => {
    const store = useTicketStore();
    const favoriteQuestion = { ...makeQuestion('fav'), isFavorite: true };
    store.startTicket('ticket-1', [favoriteQuestion], 'theory');

    expect(store.progress['ticket-1']?.questionStates[0]?.isFavorite).toBe(true);
  });

  it('calls addFavorite with the question UUID and applies the API result', async () => {
    const spy = vi.spyOn(apiClient, 'addFavorite').mockResolvedValue({
      questionId: '0',
      isFavorite: true,
    });
    const store = useTicketStore();
    store.startTicket('ticket-1', twoQuestions, 'theory');

    await store.toggleFavorite('ticket-1', '0');

    expect(spy).toHaveBeenCalledWith('0');
    expect(store.progress['ticket-1']?.questionStates[0]?.isFavorite).toBe(true);
  });

  it('calls removeFavorite (not addFavorite) when the question is already favorited', async () => {
    const addSpy = vi.spyOn(apiClient, 'addFavorite').mockResolvedValue({
      questionId: '0',
      isFavorite: true,
    });
    const removeSpy = vi.spyOn(apiClient, 'removeFavorite').mockResolvedValue({
      questionId: '0',
      isFavorite: false,
    });
    const store = useTicketStore();
    store.startTicket('ticket-1', twoQuestions, 'theory');

    await store.toggleFavorite('ticket-1', '0');
    await store.toggleFavorite('ticket-1', '0');

    expect(addSpy).toHaveBeenCalledTimes(1);
    expect(removeSpy).toHaveBeenCalledTimes(1);
    expect(store.progress['ticket-1']?.questionStates[0]?.isFavorite).toBe(false);
  });

  it('leaves local favorite state unchanged when the API call fails', async () => {
    vi.spyOn(apiClient, 'addFavorite').mockRejectedValue(new Error('QUESTION_NOT_FOUND'));
    const store = useTicketStore();
    store.startTicket('ticket-1', twoQuestions, 'theory');

    await store.toggleFavorite('ticket-1', '0');

    expect(store.progress['ticket-1']?.questionStates[0]?.isFavorite).toBe(false);
  });
});
