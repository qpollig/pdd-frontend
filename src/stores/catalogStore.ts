import { defineStore } from 'pinia';
import { ref } from 'vue';
import { apiClient } from '../api/client';
import type { TicketCategory } from '../api/types';
import type { Ticket, Topic } from '../domain/catalog';
import { resolveExamTimeLimitSeconds } from '../domain/examRules';
import type { Question } from '../domain/question';
import {
  ERRORS_SESSION_TICKET_ID,
  EXAM_SESSION_TICKET_ID,
  FAVORITES_SESSION_TICKET_ID,
} from '../types/ticket';

/**
 * Ticket/topic metadata (from the catalog, GET /api/v1/topics) + the domain questions for the
 * active session. openapi.json has no single "ticket detail" endpoint — questions come from
 * startSession, metadata from the already-loaded catalog state. `category` is null for sessions
 * with no single ticket (errors/exam/topic practice); `topicTitle` is set only for topic sessions.
 */
interface ActiveTicketSession {
  id: string;
  number: number;
  category: TicketCategory | null;
  topicTitle?: string;
  questions: Question[];
}

/** POST /api/v1/tickets/session/start 403 detail (openapi.json) — Free user with no lives left. */
const OUT_OF_LIVES_CODE = 'OUT_OF_LIVES';

function isOutOfLivesError(cause: unknown): boolean {
  return cause instanceof Error && cause.message === OUT_OF_LIVES_CODE;
}

export const useCatalogStore = defineStore('catalog', () => {
  const tickets = ref<Ticket[]>([]);
  const topics = ref<Topic[]>([]);
  const currentTicket = ref<ActiveTicketSession | null>(null);
  /** Opaque session id from startSession — used for the whole theory/errors/exam session lifetime. */
  const activeSessionId = ref<string | null>(null);
  const examTimeLimitSeconds = ref<number | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  /** True when the last startSession call was rejected with 403 OUT_OF_LIVES — a distinct state
   * from `error`, so TicketSessionScreen can render the dedicated lives-recovery UI (Блок C). */
  const outOfLives = ref(false);

  async function loadCatalog() {
    loading.value = true;
    error.value = null;
    try {
      const catalog = await apiClient.getTopics();
      topics.value = catalog.topics;
      tickets.value = catalog.tickets;
    } catch {
      error.value = 'Не удалось загрузить билеты';
    } finally {
      loading.value = false;
    }
  }

  /** Loads the catalog once, lazily — for entry points that need ticket/topic metadata (e.g. a
   * direct link to a ticket session) without having visited the catalog screen first. */
  async function ensureCatalogLoaded() {
    if (tickets.value.length === 0 && topics.value.length === 0) {
      await loadCatalog();
    }
  }

  async function loadTicket(id: string) {
    loading.value = true;
    error.value = null;
    outOfLives.value = false;
    currentTicket.value = null;
    activeSessionId.value = null;
    try {
      await ensureCatalogLoaded();
      const meta = tickets.value.find((ticket) => ticket.id === id);
      if (!meta) throw new Error('TICKET_NOT_FOUND');
      const started = await apiClient.startSession({ mode: 'theory', ticketId: id });
      activeSessionId.value = started.sessionId;
      currentTicket.value = {
        id: meta.id,
        number: meta.number,
        category: meta.category,
        questions: started.questions,
      };
    } catch (cause) {
      if (isOutOfLivesError(cause)) {
        outOfLives.value = true;
      } else {
        error.value = 'Билет не найден';
      }
    } finally {
      loading.value = false;
    }
  }

  /** Practice session scoped to a topic (SessionStartRequest.topic_id) instead of a single ticket. */
  async function loadTopicSession(id: string) {
    loading.value = true;
    error.value = null;
    outOfLives.value = false;
    currentTicket.value = null;
    activeSessionId.value = null;
    try {
      await ensureCatalogLoaded();
      const meta = topics.value.find((topic) => topic.id === id);
      if (!meta) throw new Error('TOPIC_NOT_FOUND');
      const started = await apiClient.startSession({ mode: 'theory', topicId: id });
      activeSessionId.value = started.sessionId;
      currentTicket.value = {
        id: `topic-${id}`,
        number: 0,
        category: null,
        topicTitle: meta.title,
        questions: started.questions,
      };
    } catch (cause) {
      if (isOutOfLivesError(cause)) {
        outOfLives.value = true;
      } else {
        error.value = 'Не удалось загрузить тему';
      }
    } finally {
      loading.value = false;
    }
  }

  async function loadErrorQuestions() {
    loading.value = true;
    error.value = null;
    outOfLives.value = false;
    currentTicket.value = null;
    activeSessionId.value = null;
    try {
      const started = await apiClient.startSession({ mode: 'errors' });
      activeSessionId.value = started.sessionId;
      currentTicket.value = {
        id: ERRORS_SESSION_TICKET_ID,
        number: 0,
        category: null,
        questions: started.questions,
      };
    } catch (cause) {
      if (isOutOfLivesError(cause)) {
        outOfLives.value = true;
      } else {
        error.value = 'Не удалось загрузить ошибки';
      }
    } finally {
      loading.value = false;
    }
  }

  async function loadExamSession() {
    loading.value = true;
    error.value = null;
    outOfLives.value = false;
    currentTicket.value = null;
    activeSessionId.value = null;
    examTimeLimitSeconds.value = null;
    try {
      const started = await apiClient.startSession({ mode: 'gibdd_exam' });
      activeSessionId.value = started.sessionId;
      examTimeLimitSeconds.value = resolveExamTimeLimitSeconds();
      currentTicket.value = {
        id: EXAM_SESSION_TICKET_ID,
        number: 0,
        category: null,
        questions: started.questions,
      };
    } catch (cause) {
      if (isOutOfLivesError(cause)) {
        outOfLives.value = true;
      } else {
        error.value = 'Не удалось начать экзамен';
      }
    } finally {
      loading.value = false;
    }
  }

  /** Practice session over the current favorites list (SessionStartRequest mode=favorites). */
  async function loadFavoritesSession() {
    loading.value = true;
    error.value = null;
    outOfLives.value = false;
    currentTicket.value = null;
    activeSessionId.value = null;
    try {
      const started = await apiClient.startSession({ mode: 'favorites' });
      activeSessionId.value = started.sessionId;
      currentTicket.value = {
        id: FAVORITES_SESSION_TICKET_ID,
        number: 0,
        category: null,
        questions: started.questions,
      };
    } catch (cause) {
      if (isOutOfLivesError(cause)) {
        outOfLives.value = true;
      } else {
        error.value = 'Не удалось загрузить избранное';
      }
    } finally {
      loading.value = false;
    }
  }

  function appendToCurrentTicket(questions: Question[]) {
    if (!currentTicket.value || questions.length === 0) return;
    currentTicket.value = {
      ...currentTicket.value,
      questions: [...currentTicket.value.questions, ...questions],
    };
  }

  /**
   * Remaining error-history count, used only to drive post-session nav (next-error vs
   * back-to-theory). Reads GET /users/me.errors_count instead of starting an errors session just
   * to count its questions — confirmed on the live backend that this field is exactly the number
   * of questions a fresh errors session would return, and updates immediately per answered
   * question (not only at finish), so it's accurate right when TicketPlayer calls this at the end
   * of an errors run. Starting a real session here would leave it orphaned/in_progress on the
   * backend, since nothing ever answers or finishes it.
   */
  async function peekErrorQuestionCount(): Promise<number> {
    try {
      const user = await apiClient.getCurrentUser();
      return user.errors_count;
    } catch {
      return 0;
    }
  }

  return {
    tickets,
    topics,
    currentTicket,
    activeSessionId,
    examTimeLimitSeconds,
    loading,
    error,
    outOfLives,
    loadCatalog,
    loadTicket,
    loadTopicSession,
    loadErrorQuestions,
    loadExamSession,
    loadFavoritesSession,
    appendToCurrentTicket,
    peekErrorQuestionCount,
  };
});
