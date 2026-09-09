import type { CatalogSnapshot } from '../domain/catalog';
import type { Question } from '../domain/question';
import type { ProgressSnapshot } from '../domain/progress';
import type {
  AuthSession,
  CancelSubscriptionResponse,
  CurrentUser,
  OAuthProvider,
  PremiumOffer,
  SessionMode,
  SessionStatus,
  Subscription,
} from './types';

/**
 * camelCase boundary for POST /api/v1/billing/checkout/init (see CheckoutInitResponse, the wire
 * DTO). Redirect-oriented on purpose — see ApiClient.checkout() below.
 */
export interface CheckoutInitResult {
  paymentId: string;
  confirmationUrl: string;
  amountRub: number;
  description: string;
}

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
   * Обмен OAuth code на сессию (ТЗ §4.1) — POST /api/v1/auth/oauth/{provider},
   * OAuthLoginRequest { code, redirect_uri? } → TokenResponse (openapi.json, подтверждено на живом
   * backend). `redirectUri`, если передан, должен буквально совпадать с тем redirect_uri, что был
   * использован при построении authorize-URL провайдера (см. src/auth/oauthRedirect.ts) — иначе
   * провайдер отклонит обмен кода на своей стороне при OAUTH_EXCHANGE_FAILED.
   */
  exchangeOAuthCode(provider: OAuthProvider, code: string, redirectUri?: string): Promise<AuthSession>;
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
   * openapi.json POST /api/v1/billing/checkout/init. No request body. Starts a payment with the
   * acquirer and returns a redirect target — does not activate Premium. The caller (sessionStore)
   * does the actual browser redirect; Premium only becomes real once getSubscription()/
   * getCurrentUser() report it after the user returns from the external payment.
   */
  checkout(): Promise<CheckoutInitResult>;
  /**
   * Restores this client's in-memory Bearer token after a full-page reload — e.g. returning from
   * the external checkout redirect, where sessionStore rehydrates accessToken from its one-shot
   * sessionStorage bridge and needs the live ApiClient instance (a fresh object post-reload) to
   * pick it back up. Not a new persistence mechanism: the token itself still lives only in
   * sessionStore/Pinia memory and this client's own memory, same as after exchangeOAuthCode().
   */
  restoreAccessToken(token: string): void;
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
  /**
   * openapi.json GET /api/v1/progress — server-computed, survives reload. Ticket status colors the
   * ticket grid, topic/bank progress counts only uniquely-correct questions (see ProgressSnapshot).
   */
  getProgress(): Promise<ProgressSnapshot>;
}
