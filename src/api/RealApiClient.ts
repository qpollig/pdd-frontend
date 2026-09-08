import type {
  AnswerSessionInput,
  AnswerSessionResult,
  ApiClient,
  FavoriteToggleResult,
  FinishSessionInput,
  FinishSessionResult,
  StartSessionInput,
  StartSessionResult,
} from './ApiClient';
import type { CatalogSnapshot } from '../domain/catalog';
import type { Question } from '../domain/question';
import { mapCatalog } from '../domain/catalogMapper';
import { mapQuestion } from '../domain/questionMapper';
import type {
  AuthSession,
  AuthUser,
  CancelSubscriptionResponse,
  CheckoutResult,
  CurrentUser,
  FavoritesListResponse,
  FavoriteToggleResponse,
  OAuthProvider,
  PremiumOffer,
  QuestionOut,
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
   * ВАЖНО (см. отчёт после кода): этот эндпоинт на backend защищён Bearer-авторизацией
   * (openapi.json: security HTTPBearer). Обычный <img src="..."> не может передать заголовок
   * Authorization — картинки не загрузятся, пока это не будет решено на любой из сторон.
   * Здесь только абсолютизация URL; сам вопрос авторизации эндпоинта — вне этой задачи.
   */
  private absolutizeQuestion(dto: QuestionOut): QuestionOut {
    if (!dto.image_url || /^https?:\/\//.test(dto.image_url)) return dto;
    return { ...dto, image_url: `${this.baseUrl}${dto.image_url}` };
  }

  private mapQuestions(list: QuestionOut[]): Question[] {
    return list.map((dto) => mapQuestion(this.absolutizeQuestion(dto)));
  }

  async exchangeOAuthCode(provider: OAuthProvider, code: string): Promise<AuthSession> {
    // redirect_uri не передаём — backend подставляет settings.OAUTH_REDIRECT_URI сам
    // (см. app/api/v1/endpoints/auth.py); для dev-режима с OAUTH_ALLOW_MOCK=true это не важно.
    const session = await this.request<AuthSession>(`/api/v1/auth/oauth/${provider}`, {
      method: 'POST',
      body: { code },
      auth: false,
    });
    this.accessToken = session.access_token;
    return session;
  }

  async getCurrentUser(): Promise<CurrentUser> {
    // Backend отдаёт UserOut (AuthUser) без lives_regen_at — поля ещё нет в openapi.json
    // (frontend ASSUMPTION, см. types.ts). Достраиваем null, как и раньше делал MockApiClient.
    const dto = await this.request<AuthUser>('/api/v1/users/me');
    return { ...dto, lives_regen_at: null };
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
   * KNOWN DIVERGENCE (см. ApiClient.ts/types.ts): реальный backend-эндпоинт —
   * POST /api/v1/billing/checkout/init, который возвращает {payment_id, confirmation_url, ...}
   * для редиректа на страницу оплаты эквайринга, а НЕ мгновенный результат покупки.
   * Premium активируется позже, асинхронно, через POST /api/v1/billing/webhook — это отдельный
   * вызов со стороны платёжного провайдера, а не ответ на этот запрос.
   *
   * Интерфейс ApiClient.checkout() требует синхронный CheckoutResult ({status, subscription}) —
   * честно вернуть его после init() нельзя, деньги ещё не списаны и Premium ещё не активен.
   * Здесь выполняется настоящий вызов checkout/init и браузер реально уводится на
   * confirmation_url — но дальше этот промис не резолвится в "success", а бросает ApiError.
   * Это осознанно: чтобы CheckoutScreen.vue не показал "Premium активирован" раньше времени.
   * Полноценный redirect-флоу (страница возврата, опрос статуса подписки после оплаты) — это
   * доработка CheckoutScreen.vue/checkout-стора отдельной задачей, не входит в эту.
   */
  async checkout(): Promise<CheckoutResult> {
    const init = await this.request<{
      payment_id: string;
      confirmation_url: string;
      amount_rub: number;
      description: string;
    }>('/api/v1/billing/checkout/init', { method: 'POST' });

    if (typeof window !== 'undefined') {
      window.location.href = init.confirmation_url;
    }
    throw new ApiError('CHECKOUT_REDIRECT_IN_PROGRESS', 0);
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
}
