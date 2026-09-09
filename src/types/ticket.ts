/**
 * Raw ticket-1.json fixture shape. Internal to MockApiClient (it builds QuestionOut/AnswerOut
 * DTOs from this — see questionMapper) — not used by UI. UI/domain code uses
 * ../domain/question.ts's Question/Answer instead, which mirror openapi.json QuestionOut/AnswerOut.
 */
export interface FixtureAnswer {
  answer_text: string;
  is_correct: boolean;
}

export interface FixtureQuestion {
  title: string; // "Вопрос 1"
  ticket_number: string; // "Билет 1"
  ticket_category: string; // "A,B"
  image: string; // "./images/no_image.jpg"
  question: string;
  answers: FixtureAnswer[]; // 3-4 варианта, ровно один is_correct: true
  correct_answer: string; // "Правильный ответ: 2" — только для отображения, не парсить
  answer_tip: string; // пояснение, показывать после ответа
  topic: string[];
  id: string;
}

export type Ticket = FixtureQuestion[];

/** ТЗ §4.3 session/start mode. На этом этапе: theory | errors | exam (gibdd_exam) | favorites. */
export type TicketMode = 'theory' | 'errors' | 'exam' | 'favorites';

/** Синтетический id прогресса плеера для Errors. Не uuid билета. */
export const ERRORS_SESSION_TICKET_ID = 'errors-session';

/** Синтетический id прогресса плеера для Exam. Не uuid билета. */
export const EXAM_SESSION_TICKET_ID = 'exam-gibdd';

/** Синтетический id прогресса плеера для Favorites. Не uuid билета. */
export const FAVORITES_SESSION_TICKET_ID = 'favorites-session';

export type AnswerStatus = 'unanswered' | 'answered' | 'correct' | 'incorrect';

export type ExamStatus = 'in_progress' | 'finished' | 'timed_out';

/**
 * Why SessionResultModal is open with `sessionFinishedForced` rather than a normal finish —
 * presentation-only, never sent by the backend (SessionAnswerResponse only has the boolean flag).
 * `extra_question_mistake`: an exam extra/bonus question was answered incorrectly (ТЗ §3.2 — no
 * second chances on extras) — the one case with a dedicated message, distinct from a normal
 * failed/timed-out exam.
 */
export type ForcedFinishReason = 'extra_question_mistake' | null;

export interface QuestionState {
  status: AnswerStatus;
  selectedAnswerId: string | null;
  isFavorite: boolean;
  /** openapi.json SessionAnswerResponse.correct_answer_id после answerSession; до ответа — null. */
  correctAnswerId: string | null;
}

export interface AnswerResultPayload {
  selectedAnswerId: string;
  isCorrect: boolean;
  correctAnswerId: string | null;
}

export interface TicketProgress {
  currentIndex: number;
  questionStates: QuestionState[];
  remainingSeconds: number | null;
  examStatus: ExamStatus | null;
}
