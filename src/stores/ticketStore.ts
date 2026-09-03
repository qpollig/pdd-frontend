import { defineStore } from 'pinia';
import { computed, reactive, ref } from 'vue';
import { apiClient } from '../api/client';
import { EXAM_TIME_LIMIT_SECONDS } from '../domain/examRules';
import type { Question } from '../domain/question';
import type { AnswerResultPayload, QuestionState, TicketMode, TicketProgress } from '../types/ticket';

function defaultQuestionState(): QuestionState {
  return {
    status: 'unanswered',
    selectedAnswerId: null,
    isFavorite: false,
    correctAnswerId: null,
  };
}

/** Seeds isFavorite from the question's own is_favorite (openapi.json QuestionOut), not a local guess. */
function questionState(question: Question): QuestionState {
  return { ...defaultQuestionState(), isFavorite: question.isFavorite };
}

function emptyProgress(questions: Question[], exam?: { remainingSeconds: number }): TicketProgress {
  return {
    currentIndex: 0,
    questionStates: questions.map((question) => questionState(question)),
    remainingSeconds: exam?.remainingSeconds ?? null,
    examStatus: exam ? 'in_progress' : null,
  };
}

export const useTicketStore = defineStore('ticket', () => {
  const progress = reactive<Record<string, TicketProgress>>({});
  const mode = ref<TicketMode | null>(null);

  const hasTimer = computed(() => mode.value === 'exam');

  function initTicket(ticketId: string, questions: Question[]) {
    if (progress[ticketId]) return;
    progress[ticketId] = emptyProgress(questions);
  }

  function startTicket(
    ticketId: string,
    questions: Question[],
    nextMode: TicketMode,
    options?: { remainingSeconds?: number },
  ) {
    mode.value = nextMode;
    if (nextMode === 'errors') {
      progress[ticketId] = emptyProgress(questions);
      return;
    }
    if (nextMode === 'exam') {
      progress[ticketId] = emptyProgress(questions, {
        remainingSeconds: options?.remainingSeconds ?? EXAM_TIME_LIMIT_SECONDS,
      });
      return;
    }
    initTicket(ticketId, questions);
  }

  function goToQuestion(ticketId: string, index: number) {
    progress[ticketId].currentIndex = index;
  }

  function goToNextQuestion(ticketId: string) {
    const ticket = progress[ticketId];
    if (!ticket) return;
    if (ticket.currentIndex < ticket.questionStates.length - 1) {
      ticket.currentIndex += 1;
    }
  }

  function applyAnswerResult(ticketId: string, result: AnswerResultPayload) {
    const ticket = progress[ticketId];
    if (!ticket) return;
    const state = ticket.questionStates[ticket.currentIndex];
    if (state.status !== 'unanswered') return;
    state.selectedAnswerId = result.selectedAnswerId;
    if (mode.value === 'exam') {
      state.status = 'answered';
      state.correctAnswerId = null;
      return;
    }
    state.status = result.isCorrect ? 'correct' : 'incorrect';
    state.correctAnswerId = result.correctAnswerId;
  }

  function appendQuestionSlots(ticketId: string, count: number) {
    const ticket = progress[ticketId];
    if (!ticket || count <= 0) return;
    for (let index = 0; index < count; index += 1) {
      ticket.questionStates.push(defaultQuestionState());
    }
  }

  function tickExamTimer(ticketId: string) {
    const ticket = progress[ticketId];
    if (!ticket || ticket.examStatus !== 'in_progress' || ticket.remainingSeconds == null) return;
    if (ticket.remainingSeconds <= 0) {
      ticket.examStatus = 'timed_out';
      return;
    }
    ticket.remainingSeconds -= 1;
    if (ticket.remainingSeconds <= 0) {
      ticket.examStatus = 'timed_out';
    }
  }

  function stopExam(ticketId: string, status: 'finished' | 'timed_out') {
    const ticket = progress[ticketId];
    if (!ticket) return;
    ticket.examStatus = status;
  }

  /**
   * openapi.json POST/DELETE /api/v1/questions/{question_id}/favorite. `questionId` must be the
   * Question UUID (question.id), not the question's index in the ticket. On API failure the local
   * state is left unchanged rather than optimistically flipped.
   */
  async function toggleFavorite(ticketId: string, questionId: string) {
    const ticket = progress[ticketId];
    if (!ticket) return;
    const state = ticket.questionStates[ticket.currentIndex];
    if (!state) return;
    try {
      const result = state.isFavorite
        ? await apiClient.removeFavorite(questionId)
        : await apiClient.addFavorite(questionId);
      state.isFavorite = result.isFavorite;
    } catch {
      // Leave local favorite state unchanged on failure.
    }
  }

  function getTicketStats(ticketId: string) {
    const ticket = progress[ticketId];
    if (!ticket) return { total: 0, answered: 0, correct: 0, favorites: 0 };
    const states = ticket.questionStates;
    return {
      total: states.length,
      answered: states.filter((s) => s.status !== 'unanswered').length,
      correct: states.filter((s) => s.status === 'correct').length,
      favorites: states.filter((s) => s.isFavorite).length,
    };
  }

  function isTicketComplete(ticketId: string) {
    const stats = getTicketStats(ticketId);
    return stats.total > 0 && stats.answered === stats.total;
  }

  function isLastQuestion(ticketId: string) {
    const ticket = progress[ticketId];
    if (!ticket) return false;
    return ticket.currentIndex === ticket.questionStates.length - 1;
  }

  return {
    progress,
    mode,
    hasTimer,
    initTicket,
    startTicket,
    goToQuestion,
    goToNextQuestion,
    applyAnswerResult,
    appendQuestionSlots,
    tickExamTimer,
    stopExam,
    toggleFavorite,
    getTicketStats,
    isTicketComplete,
    isLastQuestion,
  };
});
