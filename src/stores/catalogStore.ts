import { defineStore } from 'pinia';
import { ref } from 'vue';
import { apiClient } from '../api/client';
import type { TicketCategory } from '../api/types';
import type { Ticket, Topic } from '../domain/catalog';
import { resolveExamTimeLimitSeconds } from '../domain/examRules';
import type { Question } from '../domain/question';
import { ERRORS_SESSION_TICKET_ID, EXAM_SESSION_TICKET_ID } from '../types/ticket';

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

export const useCatalogStore = defineStore('catalog', () => {
  const tickets = ref<Ticket[]>([]);
  const topics = ref<Topic[]>([]);
  const currentTicket = ref<ActiveTicketSession | null>(null);
  /** Opaque session id from startSession — used for the whole theory/errors/exam session lifetime. */
  const activeSessionId = ref<string | null>(null);
  const examTimeLimitSeconds = ref<number | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

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
    } catch {
      error.value = 'Билет не найден';
    } finally {
      loading.value = false;
    }
  }

  /** Practice session scoped to a topic (SessionStartRequest.topic_id) instead of a single ticket. */
  async function loadTopicSession(id: string) {
    loading.value = true;
    error.value = null;
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
    } catch {
      error.value = 'Не удалось загрузить тему';
    } finally {
      loading.value = false;
    }
  }

  async function loadErrorQuestions() {
    loading.value = true;
    error.value = null;
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
    } catch {
      error.value = 'Не удалось загрузить ошибки';
    } finally {
      loading.value = false;
    }
  }

  async function loadExamSession() {
    loading.value = true;
    error.value = null;
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
    } catch {
      error.value = 'Не удалось начать экзамен';
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

  /** Errors count without mutating any session state — used only to drive post-session nav. */
  async function peekErrorQuestionCount(): Promise<number> {
    try {
      const started = await apiClient.startSession({ mode: 'errors' });
      return started.questions.length;
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
    loadCatalog,
    loadTicket,
    loadTopicSession,
    loadErrorQuestions,
    loadExamSession,
    appendToCurrentTicket,
    peekErrorQuestionCount,
  };
});
