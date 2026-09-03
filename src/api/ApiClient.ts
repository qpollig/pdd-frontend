import type { CatalogSnapshot } from '../domain/catalog';
import type { Question } from '../domain/question';
import type {
  AuthSession,
  CancelSubscriptionResponse,
  CheckoutRequest,
  CheckoutResult,
  CurrentUser,
  OAuthProvider,
  PremiumOffer,
  SessionMode,
  SessionStatus,
  Subscription,
} from './types';

/**
 * Application-level input/result shapes for the session endpoints.
 * These are the camelCase boundary ApiClient consumers (Pinia stores) use — distinct from the
 * snake_case wire DTOs in ./types (SessionStartRequest/Response etc.), which mirror
 * docs/openapi.json exactly and are only for MockApiClient/RealApiClient internals.
 * `questions`/`extraQuestions` are already mapped to domain Question (see ../domain/questionMapper).
 */
export interface StartSessionInput {
  mode: SessionMode;
  ticketId?: string | null;
  topicId?: string | null;
}

export interface StartSessionResult {
  sessionId: string;
  mode: SessionMode;
  questions: Question[];
  livesCurrent: number;
  livesMax: number;
  isPremium: boolean;
}

export interface AnswerSessionInput {
  sessionId: string;
  questionId: string;
  answerId: string;
}

export interface AnswerSessionResult {
  isCorrect: boolean | null;
  correctAnswerId: string | null;
  livesCurrent: number;
  extraQuestions: Question[];
  sessionFinishedForced: boolean;
}

export interface FinishSessionInput {
  sessionId: string;
}

/**
 * App-level result of POST/DELETE /api/v1/questions/{question_id}/favorite
 * (openapi.json FavoriteToggleResponse, camelCase boundary).
 */
export interface FavoriteToggleResult {
  questionId: string;
  isFavorite: boolean;
}

export interface FinishSessionResult {
  sessionId: string;
  mode: SessionMode;
  status: SessionStatus;
  totalQuestions: number;
  correctCount: number;
  errorsCount: number;
  passed: boolean | null;
}

/**
 * Граница UI ↔ backend. Реализация сейчас — MockApiClient.
 * RealApiClient появится, когда backend будет подключён по HTTP; HTTP-пути ТЗ §4
 * здесь не вызываются.
 */
export interface ApiClient {
  /**
   * Обмен OAuth code на сессию (ТЗ §4.1).
   * Frontend не реализует протокол Yandex/VK — только вызов этого метода.
   */
  exchangeOAuthCode(provider: OAuthProvider, code: string): Promise<AuthSession>;
  /**
   * openapi.json GET /api/v1/users/me — UserOut. Same domain shape TokenResponse.user maps to
   * (see sessionStore's userFromAuthSession); this is the only user-state source, there is no
   * separate Dashboard endpoint/DTO.
   */
  getCurrentUser(): Promise<CurrentUser>;
  /**
   * openapi.json GET /api/v1/topics. Single catalog endpoint: topics and tickets metadata only —
   * no questions. Questions for a ticket/topic come from startSession({ mode: 'theory', ticketId })
   * or startSession({ mode: 'theory', topicId }); there is no GET /api/v1/tickets/{id}.
   */
  getTopics(): Promise<CatalogSnapshot>;
  /**
   * openapi.json GET /api/v1/subscriptions/me. `null` = нет подписки (реальный backend отвечает
   * 404 SUBSCRIPTION_NOT_FOUND; здесь смоделировано как null, т.к. HTTP-слоя ещё нет).
   */
  getSubscription(): Promise<Subscription | null>;
  /**
   * openapi.json POST /api/v1/subscriptions/cancel.
   * Отключает автопродление; не отменяет Premium немедленно и не оформляет возврат.
   * Имя метода на ApiClient — ASSUMPTION (URL не вызывается), форма ответа — реальная.
   */
  cancelSubscription(): Promise<CancelSubscriptionResponse>;
  /**
   * Витрина Premium для Paywall (ТЗ §3.5).
   * Имя метода ASSUMPTION — pending OpenAPI. HTTP не вызывается.
   */
  getPremiumOffer(): Promise<PremiumOffer>;
  /**
   * KNOWN DIVERGENCE from openapi.json: real endpoint is POST /api/v1/billing/checkout/init and
   * returns CheckoutInitResponse (payment_id/confirmation_url/amount_rub/description), not an
   * immediate purchase result. Kept as a frontend-only synchronous-purchase placeholder — see
   * the doc comment on CheckoutResult in ./types. Does not accept card PAN/CVV.
   */
  checkout(request: CheckoutRequest): Promise<CheckoutResult>;
  /**
   * openapi.json POST /api/v1/tickets/session/start.
   * theory/errors reveal `is_correct`/`explanation` on the returned questions immediately
   * (backend build_question_out()); gibdd_exam withholds them until answerSession.
   */
  startSession(input: StartSessionInput): Promise<StartSessionResult>;
  /**
   * openapi.json POST /api/v1/tickets/session/answer.
   * `extraQuestions` can arrive here (not only from finishSession) and `sessionFinishedForced`
   * signals the backend ended the session (e.g. lives exhausted) — the caller must not keep
   * submitting answers for this session after that.
   */
  answerSession(input: AnswerSessionInput): Promise<AnswerSessionResult>;
  /** openapi.json POST /api/v1/tickets/session/finish. */
  finishSession(input: FinishSessionInput): Promise<FinishSessionResult>;
  /** openapi.json GET /api/v1/questions/favorites. */
  getFavoriteQuestions(): Promise<Question[]>;
  /** openapi.json POST /api/v1/questions/{question_id}/favorite. `questionId` is a Question UUID. */
  addFavorite(questionId: string): Promise<FavoriteToggleResult>;
  /** openapi.json DELETE /api/v1/questions/{question_id}/favorite. `questionId` is a Question UUID. */
  removeFavorite(questionId: string): Promise<FavoriteToggleResult>;
}
