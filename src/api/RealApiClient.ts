import type {
  AnswerSessionInput,
  AnswerSessionResult,
  ApiClient,
  CheckoutInitResult,
  FavoriteToggleResult,
  FinishSessionInput,
  FinishSessionResult,
  StartSessionInput,
  StartSessionResult,
} from './ApiClient';
import type { CatalogSnapshot } from '../domain/catalog';
import type { Identity, IdentityType } from '../domain/identity';
import type { Question } from '../domain/question';
import type { ProgressSnapshot } from '../domain/progress';
import { mapCatalog } from '../domain/catalogMapper';
import { mapIdentities } from '../domain/identityMapper';
import { mapQuestion } from '../domain/questionMapper';
import { mapProgress } from '../domain/progressMapper';
import type {
  AuthSession,
  AuthUser,
  CancelSubscriptionResponse,
  CheckoutInitResponse,
  CurrentUser,
  FavoritesListResponse,
  FavoriteToggleResponse,
  ForgotPasswordRequest,
  IdentityOut,
  LoginRequest,
  OAuthProvider,
  PremiumOffer,
  ProgressResponse,
  QuestionOut,
  RegisterRequest,
  ResetPasswordRequest,
  SessionAnswerRequest,
  SessionAnswerResponse,
  SessionFinishRequest,
  SessionFinishResponse,
  SessionStartRequest,
  SessionStartResponse,
  Subscription,
  TopicsListResponse,
} from './types';

const DEFAULT_BASE_URL = 'http://localhost:8000';

/**
 * Единый формат ошибки backend'а: {"detail": "КОД_ОШИБКИ"} (см. docs/API_ERRORS.md).
 * `status` — HTTP-статус ответа; 0 для случаев без реального HTTP-ответа (см. checkout()).
 */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number) {
    super(code);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

/**
 * Реальный ApiClient — HTTP-запросы к FastAPI backend (docs/openapi.json — источник истины
 * по путям/формам запросов-ответов).
 *
 * accessToken хранится только в памяти этого экземпляра (ТЗ §2.2: не localStorage/cookie),
 * появляется после exchangeOAuthCode(). Пропадает при перезагрузке страницы — это ожидаемо
 * и совпадает с тем, что sessionStore.accessToken тоже хранится только в памяти Pinia.
 */
export class RealApiClient implements ApiClient {
  private accessToken: string | null = null;
  private readonly baseUrl: string;

  constructor(baseUrl: string = DEFAULT_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    path: string,
    init: { method?: string; body?: unknown; auth?: boolean } = {},
  ): Promise<T> {
    const { method = 'GET', body, auth = true } = init;
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth && this.accessToken) headers.Authorization = `Bearer ${this.accessToken}`;

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (cause) {
      // Backend недоступен / CORS-блок / оффлайн — отличаем от прикладных ошибок (ApiError).
      const reason = cause instanceof Error ? cause.message : String(cause);
      throw new Error(`NETWORK_ERROR: не удалось обратиться к ${this.baseUrl}${path} (${reason})`, {
        cause,
      });
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const text = await response.text();
    let payload: unknown = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
    }

    if (!response.ok) {
      const detail =
        payload && typeof payload === 'object' && 'detail' in payload
          ? String((payload as { detail: unknown }).detail)
          : `HTTP_${response.status}`;
      throw new ApiError(detail, response.status);
    }

    return payload as T;
  }

  /**
   * Backend отдаёт image_url как относительный путь (`{API_V1_PREFIX}/questions/{id}/image`,
   * см. app/services/serializers.py) — приводим к абсолютному под baseUrl, иначе <img> не
   * найдёт файл, когда фронтенд и backend на разных origin (типичный случай локальной разработки).
   *
   * Подтверждено на живом backend (аудит A→D2, 2026-09-08): этот эндпоинт публичный — без
   * `security` в live openapi.json и без Authorization в ответе 200 image/jpeg что с токеном,
   * что без него. Устаревший локальный docs/openapi.json (снимок от 2026-09-03) ещё помечал его
   * HTTPBearer — обычный <img src="..."> и не смог бы передать заголовок, но контракт с тех пор
   * изменился на публичный доступ, поэтому текущая абсолютизация URL уже достаточна.
   */
  private absolutizeQuestion(dto: QuestionOut): QuestionOut {
    if (!dto.image_url || /^https?:\/\//.test(dto.image_url)) return dto;
    return { ...dto, image_url: `${this.baseUrl}${dto.image_url}` };
  }

  private mapQuestions(list: QuestionOut[]): Question[] {
    return list.map((dto) => mapQuestion(this.absolutizeQuestion(dto)));
  }

  async exchangeOAuthCode(provider: OAuthProvider, code: string, redirectUri?: string): Promise<AuthSession> {
    // redirect_uri передаём явно, когда он известен (реальный redirect-флоу — см.
    // src/auth/oauthRedirect.ts): он должен совпадать с тем, что использовался при построении
    // authorize-URL провайдера. Если не передан (mock-режим), backend подставляет
    // settings.OAUTH_REDIRECT_URI сам (см. app/api/v1/endpoints/auth.py).
    const session = await this.request<AuthSession>(`/api/v1/auth/oauth/${provider}`, {
      method: 'POST',
      body: redirectUri ? { code, redirect_uri: redirectUri } : { code },
      auth: false,
    });
    this.accessToken = session.access_token;
    return session;
  }

  async registerWithPassword(email: string, password: string, name: string): Promise<AuthSession> {
    const body: RegisterRequest = { email, password, name };
    const session = await this.request<AuthSession>('/api/v1/auth/register', {
      method: 'POST',
      body,
      auth: false,
    });
    this.accessToken = session.access_token;
    return session;
  }

  async loginWithPassword(email: string, password: string): Promise<AuthSession> {
    const body: LoginRequest = { email, password };
    const session = await this.request<AuthSession>('/api/v1/auth/login', {
      method: 'POST',
      body,
      auth: false,
    });
    this.accessToken = session.access_token;
    return session;
  }

  async requestPasswordReset(email: string): Promise<void> {
    const body: ForgotPasswordRequest = { email };
    // Backend всегда отвечает 200 с одинаковым нейтральным телом — тело здесь намеренно
    // отбрасывается (см. ApiClient.requestPasswordReset()), сама отправка не может «зафейлиться»
    // прикладной ошибкой (кроме RATE_LIMITED/сетевых), проброс которых через request() достаточен.
    await this.request<unknown>('/api/v1/auth/password/forgot', { method: 'POST', body, auth: false });
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const body: ResetPasswordRequest = { token, new_password: newPassword };
    await this.request<unknown>('/api/v1/auth/password/reset', { method: 'POST', body, auth: false });
  }

  async getCurrentUser(): Promise<CurrentUser> {
    // UserOut уже содержит lives_regen_at/lives_reset_at на живом backend — CurrentUser is AuthUser,
    // никакой достройки не требуется (см. types.ts).
    return this.request<AuthUser>('/api/v1/users/me');
  }

  async getTopics(): Promise<CatalogSnapshot> {
    const dto = await this.request<TopicsListResponse>('/api/v1/topics');
    return mapCatalog(dto);
  }

  async getSubscription(): Promise<Subscription | null> {
    try {
      return await this.request<Subscription>('/api/v1/subscriptions/me');
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 404) return null;
      throw cause;
    }
  }

  async cancelSubscription(): Promise<CancelSubscriptionResponse> {
    return this.request<CancelSubscriptionResponse>('/api/v1/subscriptions/cancel', {
      method: 'POST',
    });
  }

  /**
   * ASSUMPTION (ApiClient.ts/types.ts): в openapi.json нет отдельного GET-эндпоинта витрины
   * тарифа. Значения — из ТЗ §3.5/§4.5 (1 ₽ / 3 дня триал, далее 299 ₽/мес), те же, что раньше
   * были в premiumOfferFixture.ts для MockApiClient. HTTP не вызывается.
   */
  async getPremiumOffer(): Promise<PremiumOffer> {
    return {
      plan: 'trial_1rub_299',
      trial_price_rub: 1,
      trial_days: 3,
      monthly_price_rub: 299,
      auto_renew: true,
    };
  }

  /**
   * openapi.json POST /api/v1/billing/checkout/init — confirmed live (2026-09-08): no request
   * body, Bearer auth only, returns {payment_id, confirmation_url, amount_rub, description}.
   * Pure DTO mapping only — the actual browser redirect is sessionStore's responsibility (see
   * D1 report), so this stays a plain API call like every other method here.
   */
  async checkout(): Promise<CheckoutInitResult> {
    const dto = await this.request<CheckoutInitResponse>('/api/v1/billing/checkout/init', {
      method: 'POST',
    });
    return {
      paymentId: dto.payment_id,
      confirmationUrl: dto.confirmation_url,
      amountRub: dto.amount_rub,
      description: dto.description,
    };
  }

  /** See ApiClient.restoreAccessToken() — rehydrates this instance after a checkout-redirect reload. */
  restoreAccessToken(token: string): void {
    this.accessToken = token;
  }

  async startSession(input: StartSessionInput): Promise<StartSessionResult> {
    const body: SessionStartRequest = {
      mode: input.mode,
      ticket_id: input.ticketId ?? null,
      topic_id: input.topicId ?? null,
    };
    const dto = await this.request<SessionStartResponse>('/api/v1/tickets/session/start', {
      method: 'POST',
      body,
    });
    return {
      sessionId: dto.session_id,
      mode: dto.mode,
      questions: this.mapQuestions(dto.questions),
      livesCurrent: dto.lives_current,
      livesMax: dto.lives_max,
      isPremium: dto.is_premium,
    };
  }

  async answerSession(input: AnswerSessionInput): Promise<AnswerSessionResult> {
    const body: SessionAnswerRequest = {
      session_id: input.sessionId,
      question_id: input.questionId,
      answer_id: input.answerId,
    };
    const dto = await this.request<SessionAnswerResponse>('/api/v1/tickets/session/answer', {
      method: 'POST',
      body,
    });
    return {
      isCorrect: dto.is_correct,
      correctAnswerId: dto.correct_answer_id ?? null,
      livesCurrent: dto.lives_current,
      extraQuestions: this.mapQuestions(dto.extra_questions ?? []),
      sessionFinishedForced: dto.session_finished_forced ?? false,
    };
  }

  async finishSession(input: FinishSessionInput): Promise<FinishSessionResult> {
    const body: SessionFinishRequest = { session_id: input.sessionId };
    const dto = await this.request<SessionFinishResponse>('/api/v1/tickets/session/finish', {
      method: 'POST',
      body,
    });
    return {
      sessionId: dto.session_id,
      mode: dto.mode,
      status: dto.status,
      totalQuestions: dto.total_questions,
      correctCount: dto.correct_count,
      errorsCount: dto.errors_count,
      passed: dto.passed ?? null,
    };
  }

  async getFavoriteQuestions(): Promise<Question[]> {
    const dto = await this.request<FavoritesListResponse>('/api/v1/questions/favorites');
    return this.mapQuestions(dto.questions);
  }

  async addFavorite(questionId: string): Promise<FavoriteToggleResult> {
    const dto = await this.request<FavoriteToggleResponse>(
      `/api/v1/questions/${encodeURIComponent(questionId)}/favorite`,
      { method: 'POST' },
    );
    return { questionId: dto.question_id, isFavorite: dto.is_favorite };
  }

  async removeFavorite(questionId: string): Promise<FavoriteToggleResult> {
    const dto = await this.request<FavoriteToggleResponse>(
      `/api/v1/questions/${encodeURIComponent(questionId)}/favorite`,
      { method: 'DELETE' },
    );
    return { questionId: dto.question_id, isFavorite: dto.is_favorite };
  }

  async getProgress(): Promise<ProgressSnapshot> {
    const dto = await this.request<ProgressResponse>('/api/v1/progress');
    return mapProgress(dto);
  }

  async getIdentities(): Promise<Identity[]> {
    return mapIdentities(await this.request<IdentityOut[]>('/api/v1/auth/identities'));
  }

  async linkPassword(email: string, password: string): Promise<Identity[]> {
    return mapIdentities(
      await this.request<IdentityOut[]>('/api/v1/auth/identities/password', {
        method: 'POST',
        body: { email, password },
      }),
    );
  }

  async unlinkIdentity(type: IdentityType): Promise<Identity[]> {
    return mapIdentities(
      await this.request<IdentityOut[]>(`/api/v1/auth/identities/${type}`, { method: 'DELETE' }),
    );
  }

  /**
   * НЕ в интерфейсе ApiClient (см. там же): OAuth-привязка — это редирект-флоу, эта ручка —
   * только шаг обмена code после возврата от провайдера (или, в mock-режиме, прямой вызов
   * фиксированным кодом). Вызывается из sessionStore, не из компонентов.
   */
  async linkOAuthIdentity(
    provider: OAuthProvider,
    code: string,
    redirectUri?: string,
  ): Promise<Identity[]> {
    return mapIdentities(
      await this.request<IdentityOut[]>(`/api/v1/auth/identities/oauth/${provider}`, {
        method: 'POST',
        body: redirectUri ? { code, redirect_uri: redirectUri } : { code },
      }),
    );
  }
}
