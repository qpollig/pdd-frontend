import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type {
  AnswerSessionInput,
  AnswerSessionResult,
  CheckoutInitResult,
  FinishSessionInput,
  FinishSessionResult,
} from '../api/ApiClient';
import { apiClient, useMockLogin } from '../api/client';
import { RealApiClient } from '../api/RealApiClient';
import type { CheckoutStatus } from '../domain/checkout';
import type { Identity, IdentityType } from '../domain/identity';
import { identityErrorMessage } from '../domain/identity';
import type {
  AuthSession,
  CancelSubscriptionResponse,
  CurrentUser,
  OAuthProvider,
  PremiumOffer,
  Subscription,
} from '../api/types';
import {
  buildAuthorizeUrl,
  buildOAuthCallbackUrl,
  generateOAuthState,
  isOAuthProviderConfigured,
} from '../auth/oauthRedirect';

export type CancelAutoRenewStatus = 'idle' | 'processing' | 'success' | 'error';

/**
 * Результат обработки OAuth-callback. `purpose` — что это был за редирект: обычный вход или
 * привязка нового способа к уже залогиненному аккаунту (различается по полю `purpose` в
 * одноразовом state-бридже, см. OAuthStateBridge). `errorCode` заполняется только для
 * неудачной привязки (IDENTITY_ALREADY_LINKED / OAUTH_EXCHANGE_FAILED / ...).
 */
export interface OAuthCallbackResult {
  purpose: 'login' | 'link';
  ok: boolean;
  errorCode: string | null;
}

/**
 * D1 one-shot checkout auth bridge (see report): the real payment redirect is a full-page
 * navigation to an external origin and back, which wipes the in-memory-only accessToken (ТЗ
 * §2.2). This sessionStorage entry exists ONLY to survive that single round trip — written right
 * before the redirect, consumed and deleted on the very next app boot regardless of outcome. It
 * never becomes a standing auth source: normal login/logout/navigation never touch it.
 */
const CHECKOUT_AUTH_BRIDGE_KEY = 'av_checkout_auth_bridge';

/**
 * One-shot bridge for the real OAuth redirect (see beginOAuthRedirect/completeOAuthCallback below):
 * the browser fully navigates away to the provider's own authorize page and back, which wipes
 * in-memory Pinia state just like the checkout redirect does — same reasoning as
 * CHECKOUT_AUTH_BRIDGE_KEY, same storage choice (sessionStorage: tab-scoped, read-once). Carries
 * only the CSRF `state` and the provider it was issued for; written right before the redirect,
 * consumed and deleted on the very next callback regardless of outcome.
 *
 * `purpose` разводит два сценария одного и того же редиректа:
 *   'login' — обычный вход (POST /auth/oauth/{provider}); accessToken после редиректа не нужен;
 *   'link'  — привязка к уже залогиненному аккаунту (POST /auth/identities/oauth/{provider}):
 *             сюда же кладётся одноразовый `accessToken`, т.к. полный уход браузера стирает
 *             in-memory Pinia-токен так же, как checkout-редирект (тот же приём, что
 *             CHECKOUT_AUTH_BRIDGE_KEY, только внутри этого же объекта — один вход, одно чтение).
 */
const OAUTH_STATE_BRIDGE_KEY = 'av_oauth_state_bridge';

type OAuthStateBridge = {
  provider: OAuthProvider;
  state: string;
  purpose: 'login' | 'link';
  accessToken?: string; // только при purpose:'link'
};

/** TokenResponse.user is the same UserOut as /users/me (incl. lives_regen_at/lives_reset_at) — CurrentUser is AuthUser. */
function userFromAuthSession(session: AuthSession): CurrentUser {
  return session.user;
}

export const useSessionStore = defineStore('session', () => {
  const user = ref<CurrentUser | null>(null);
  const subscription = ref<Subscription | null>(null);
  const premiumOffer = ref<PremiumOffer | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const checkoutStatus = ref<CheckoutStatus>('idle');
  const checkoutError = ref<string | null>(null);
  const cancelStatus = ref<CancelAutoRenewStatus>('idle');
  const cancelError = ref<string | null>(null);

  /** «Способы входа» в ЛК (см. ProfileScreen). */
  const identities = ref<Identity[]>([]);
  const identitiesLoading = ref(false);
  /** Уже переведённое в текст сообщение об ошибке связывания (не код). */
  const identitiesError = ref<string | null>(null);
  const linkStatus = ref<'idle' | 'processing' | 'redirecting'>('idle');

  /** ТЗ §2.2: accessToken только в памяти Pinia, не cookie / localStorage. */
  const accessToken = ref<string | null>(null);

  const isAuthenticated = computed(() => Boolean(accessToken.value && user.value));

  /** is_premium живёт в UserOut (openapi.json), не в SubscriptionOut. */
  const isPremium = computed(() => user.value?.is_premium ?? false);

  function applySession(session: AuthSession) {
    accessToken.value = session.access_token;
    user.value = userFromAuthSession(session);
  }

  /** dev/e2e-логин против MockApiClient — фиксированный код, без сети и без редиректа. */
  async function loginWithMockCode(provider: OAuthProvider) {
    loading.value = true;
    error.value = null;
    try {
      const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      const emptyErrors = params?.get('errors') === 'none';
      const premiumQuery = params?.get('premium');
      // ASSUMPTION: query premium=1|active|trial — только mock/e2e, не production OAuth.
      let code = `mock-${provider}-code`;
      if (emptyErrors) {
        code = `mock-${provider}-code-no-errors`;
      } else if (premiumQuery === 'trial') {
        code = `mock-${provider}-code-trial`;
      } else if (premiumQuery === '1' || premiumQuery === 'active') {
        code = `mock-${provider}-code-premium`;
      }
      const session = await apiClient.exchangeOAuthCode(provider, code);
      applySession(session);
    } catch (cause) {
      accessToken.value = null;
      user.value = null;
      error.value = 'Не удалось войти';
      throw cause;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Настоящий OAuth-редирект (RealApiClient): сохраняет CSRF `state` в одноразовый бридж и уводит
   * браузер на страницу авторизации провайдера. Ничего не возвращает — либо страница уходит по
   * window.location.href, либо, если провайдер не сконфигурирован (нет client_id), в error
   * записывается понятная причина без редиректа.
   */
  function beginOAuthRedirect(provider: OAuthProvider) {
    if (typeof window === 'undefined') return;
    if (!isOAuthProviderConfigured(provider)) {
      error.value = 'OAuth-провайдер не настроен';
      return;
    }

    loading.value = true;
    error.value = null;

    const state = generateOAuthState();
    try {
      const bridge: OAuthStateBridge = { provider, state, purpose: 'login' };
      window.sessionStorage.setItem(OAUTH_STATE_BRIDGE_KEY, JSON.stringify(bridge));
    } catch {
      // sessionStorage недоступен — редирект всё равно происходит, но раз бриджа не будет,
      // проверка state на возврате не пройдёт и completeOAuthCallback честно сообщит об ошибке,
      // а не подделает успешный вход.
    }

    const redirectUri = buildOAuthCallbackUrl(provider);
    window.location.href = buildAuthorizeUrl(provider, { redirectUri, state });
  }

  async function loginWithProvider(provider: OAuthProvider) {
    if (useMockLogin) {
      await loginWithMockCode(provider);
      return;
    }
    beginOAuthRedirect(provider);
  }

  /**
   * Завершение настоящего OAuth-редиректа: вызывается из OAuthCallbackScreen после возврата от
   * провайдера. CSRF state и одноразовый бридж проверяются и удаляются в любом случае, до
   * обращения к backend. По полю `purpose` бриджа разводит два сценария:
   *   'login' — обычный вход (поведение НЕ менялось: exchangeOAuthCode → applySession);
   *   'link'  — привязка: восстанавливает accessToken из бриджа (полный редирект стёр
   *             in-memory токен) и вызывает POST /auth/identities/oauth/{provider}. При любом
   *             исходе привязки пользователь остаётся залогинен (токен восстановлен).
   */
  async function completeOAuthCallback(
    provider: OAuthProvider,
    params: { code: string | null; state: string | null; providerError: string | null },
  ): Promise<OAuthCallbackResult> {
    loading.value = true;
    error.value = null;

    let bridge: OAuthStateBridge | null;
    try {
      const raw = window.sessionStorage.getItem(OAUTH_STATE_BRIDGE_KEY);
      bridge = raw ? (JSON.parse(raw) as OAuthStateBridge) : null;
    } catch {
      bridge = null;
    }
    try {
      window.sessionStorage.removeItem(OAUTH_STATE_BRIDGE_KEY);
    } catch {
      /* ignore — nothing left to clean up if storage is unavailable */
    }

    // Отсутствие purpose = бридж от старой версии → трактуем как 'login' (безопаснее).
    const purpose: 'login' | 'link' = bridge?.purpose === 'link' ? 'link' : 'login';
    const stateValid = Boolean(bridge && bridge.provider === provider && bridge.state === params.state);

    if (params.providerError || !params.code || !stateValid) {
      if (purpose === 'login') {
        accessToken.value = null;
        user.value = null;
        error.value = 'Не удалось войти';
      } else {
        identitiesError.value = 'Не удалось привязать аккаунт. Попробуйте ещё раз.';
      }
      loading.value = false;
      return { purpose, ok: false, errorCode: null };
    }

    const redirectUri = buildOAuthCallbackUrl(provider);

    if (purpose === 'link') {
      const bridgeToken = bridge?.accessToken ?? null;
      if (!bridgeToken) {
        identitiesError.value = 'Сессия потеряна при привязке. Войдите заново.';
        loading.value = false;
        return { purpose, ok: false, errorCode: null };
      }
      accessToken.value = bridgeToken;
      apiClient.restoreAccessToken(bridgeToken);
      try {
        if (!(apiClient instanceof RealApiClient)) throw new Error('LINK_UNAVAILABLE');
        identities.value = await apiClient.linkOAuthIdentity(provider, params.code, redirectUri);
        await loadCurrentUser(); // добить профиль, чтобы приложение снова было полностью залогинено
        identitiesError.value = null;
        return { purpose, ok: true, errorCode: null };
      } catch (cause) {
        const code = cause instanceof Error ? cause.message : '';
        identitiesError.value = identityErrorMessage(code) ?? 'Не удалось привязать аккаунт.';
        await loadCurrentUser(); // токен восстановлен — пользователь остаётся в аккаунте
        return { purpose, ok: false, errorCode: code || null };
      } finally {
        loading.value = false;
      }
    }

    // purpose === 'login' — без изменений
    try {
      const session = await apiClient.exchangeOAuthCode(provider, params.code, redirectUri);
      applySession(session);
      return { purpose, ok: true, errorCode: null };
    } catch {
      accessToken.value = null;
      user.value = null;
      error.value = 'Не удалось войти';
      return { purpose, ok: false, errorCode: null };
    } finally {
      loading.value = false;
    }
  }

  // ── «Способы входа» ────────────────────────────────────────────────────────────────────────
  function clearIdentitiesError() {
    identitiesError.value = null;
  }

  async function loadIdentities() {
    identitiesLoading.value = true;
    try {
      identities.value = await apiClient.getIdentities();
      identitiesError.value = null;
    } catch {
      identitiesError.value = 'Не удалось загрузить способы входа.';
    } finally {
      identitiesLoading.value = false;
    }
  }

  async function linkPassword(email: string, password: string): Promise<boolean> {
    identitiesError.value = null;
    linkStatus.value = 'processing';
    try {
      identities.value = await apiClient.linkPassword(email, password);
      return true;
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : '';
      identitiesError.value = identityErrorMessage(code) ?? 'Не удалось привязать пароль.';
      return false;
    } finally {
      linkStatus.value = 'idle';
    }
  }

  async function unlinkIdentity(type: IdentityType): Promise<boolean> {
    identitiesError.value = null;
    try {
      identities.value = await apiClient.unlinkIdentity(type);
      return true;
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : '';
      identitiesError.value = identityErrorMessage(code) ?? 'Не удалось отвязать способ входа.';
      return false;
    }
  }

  /**
   * Привязать Yandex/VK. Симметрично loginWithProvider: в mock-login-режиме — прямой вызов
   * фиксированным кодом (без сети-редиректа), иначе — полный редирект на провайдера с
   * one-shot bridge (purpose:'link' + accessToken), который завершится в completeOAuthCallback.
   */
  async function linkWithProvider(provider: OAuthProvider) {
    if (useMockLogin) {
      await linkWithMockCode(provider);
      return;
    }
    beginOAuthLink(provider);
  }

  async function linkWithMockCode(provider: OAuthProvider) {
    identitiesError.value = null;
    linkStatus.value = 'processing';
    try {
      if (!(apiClient instanceof RealApiClient)) {
        identitiesError.value = 'Привязка через провайдера недоступна без реального backend.';
        return;
      }
      identities.value = await apiClient.linkOAuthIdentity(provider, `mock-${provider}-code`);
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : '';
      identitiesError.value = identityErrorMessage(code) ?? 'Не удалось привязать аккаунт.';
    } finally {
      linkStatus.value = 'idle';
    }
  }

  function beginOAuthLink(provider: OAuthProvider) {
    if (typeof window === 'undefined') return;
    if (!accessToken.value) {
      identitiesError.value = 'Сначала войдите в аккаунт.';
      return;
    }
    if (!isOAuthProviderConfigured(provider)) {
      identitiesError.value = 'OAuth-провайдер не настроен.';
      return;
    }

    identitiesError.value = null;
    linkStatus.value = 'redirecting';

    const state = generateOAuthState();
    try {
      const bridge: OAuthStateBridge = {
        provider,
        state,
        purpose: 'link',
        accessToken: accessToken.value,
      };
      window.sessionStorage.setItem(OAUTH_STATE_BRIDGE_KEY, JSON.stringify(bridge));
    } catch {
      // sessionStorage недоступен — без бриджа привязка на возврате честно провалится по state,
      // а не подделает успех.
    }

    const redirectUri = buildOAuthCallbackUrl(provider);
    window.location.href = buildAuthorizeUrl(provider, { redirectUri, state });
  }

  function logout() {
    accessToken.value = null;
    user.value = null;
    subscription.value = null;
    premiumOffer.value = null;
    error.value = null;
    loading.value = false;
    checkoutStatus.value = 'idle';
    checkoutError.value = null;
    cancelStatus.value = 'idle';
    cancelError.value = null;
    identities.value = [];
    identitiesError.value = null;
    identitiesLoading.value = false;
    linkStatus.value = 'idle';
  }

  /** GET /api/v1/users/me — sole user-state source (Dashboard, header, etc.). */
  async function loadCurrentUser() {
    loading.value = true;
    error.value = null;
    try {
      user.value = await apiClient.getCurrentUser();
    } catch {
      error.value = 'Не удалось загрузить данные';
    } finally {
      loading.value = false;
    }
  }

  /** Profile needs user + subscription together; both are real, independent endpoints. */
  async function loadProfile() {
    loading.value = true;
    error.value = null;
    try {
      const [me, sub] = await Promise.all([apiClient.getCurrentUser(), apiClient.getSubscription()]);
      user.value = me;
      subscription.value = sub;
    } catch {
      error.value = 'Не удалось загрузить данные';
    } finally {
      loading.value = false;
    }
  }

  async function loadPaywall() {
    loading.value = true;
    error.value = null;
    try {
      const [me, sub, offer] = await Promise.all([
        apiClient.getCurrentUser(),
        apiClient.getSubscription(),
        apiClient.getPremiumOffer(),
      ]);
      user.value = me;
      subscription.value = sub;
      premiumOffer.value = offer;
    } catch {
      error.value = 'Не удалось загрузить данные';
    } finally {
      loading.value = false;
    }
  }

  async function loadCheckout() {
    checkoutError.value = null;
    await loadPaywall();
    if (isPremium.value) {
      checkoutStatus.value = 'already-premium';
      return;
    }
    checkoutStatus.value = 'idle';
  }

  async function loadSubscription() {
    loading.value = true;
    error.value = null;
    try {
      subscription.value = await apiClient.getSubscription();
    } catch {
      error.value = 'Не удалось загрузить подписку';
    } finally {
      loading.value = false;
    }
  }

  /**
   * Stashes the current in-memory token into the one-shot checkout bridge, right before the real
   * browser redirect. sessionStorage was chosen deliberately over localStorage (see report):
   * tab-scoped, gone on tab close, and read-once — never a second persistent auth source.
   */
  function stashCheckoutAuthBridge() {
    if (typeof window === 'undefined' || !accessToken.value) return;
    try {
      window.sessionStorage.setItem(CHECKOUT_AUTH_BRIDGE_KEY, accessToken.value);
    } catch {
      // sessionStorage unavailable (private mode, storage disabled) — redirect still proceeds,
      // just without auth continuity; the user will land on /auth and can log in again.
    }
  }

  /**
   * Boot-time rehydration for the checkout bridge — see router/index.ts, which awaits this before
   * making any auth decision. No-ops instantly for every ordinary navigation (the common case):
   * only does anything when there is no live session yet AND a bridge entry exists. On both the
   * success and invalid-token paths the bridge entry is deleted, so it is never read twice.
   */
  async function hydrateFromCheckoutBridge(): Promise<void> {
    if (accessToken.value || user.value) return;
    if (typeof window === 'undefined') return;

    let token: string | null;
    try {
      token = window.sessionStorage.getItem(CHECKOUT_AUTH_BRIDGE_KEY);
    } catch {
      return;
    }
    if (!token) return;

    accessToken.value = token;
    apiClient.restoreAccessToken(token);
    await loadCurrentUser();

    if (!user.value) {
      // Invalid/stale token — do not fake an authenticated state.
      accessToken.value = null;
    }

    try {
      window.sessionStorage.removeItem(CHECKOUT_AUTH_BRIDGE_KEY);
    } catch {
      /* ignore — nothing left to clean up if storage is unavailable */
    }
  }

  async function submitCheckout(): Promise<CheckoutInitResult | null> {
    if (checkoutStatus.value === 'processing' || checkoutStatus.value === 'redirecting') {
      return null;
    }
    if (isPremium.value) {
      checkoutStatus.value = 'already-premium';
      checkoutError.value = null;
      return null;
    }

    checkoutStatus.value = 'processing';
    checkoutError.value = null;

    try {
      const result = await apiClient.checkout();
      checkoutStatus.value = 'redirecting';
      stashCheckoutAuthBridge();
      if (typeof window !== 'undefined') {
        window.location.href = result.confirmationUrl;
      }
      return result;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '';
      if (message === 'ALREADY_PREMIUM') {
        checkoutStatus.value = 'already-premium';
        checkoutError.value = null;
        return null;
      }
      checkoutStatus.value = 'error';
      checkoutError.value = 'Не удалось начать оплату. Попробуйте ещё раз.';
      return null;
    }
  }

  function applyCancelResult(result: CancelSubscriptionResponse) {
    subscription.value = result.subscription;
  }

  async function cancelAutoRenew(): Promise<CancelSubscriptionResponse | null> {
    if (cancelStatus.value === 'processing') {
      return null;
    }

    cancelStatus.value = 'processing';
    cancelError.value = null;

    try {
      const result = await apiClient.cancelSubscription();
      applyCancelResult(result);
      cancelStatus.value = 'success';
      return result;
    } catch {
      cancelStatus.value = 'error';
      cancelError.value = 'Не удалось отключить автопродление. Попробуйте ещё раз.';
      return null;
    }
  }

  function applyAnswerResult(result: AnswerSessionResult) {
    if (!user.value) {
      return;
    }
    user.value = {
      ...user.value,
      lives_current: result.livesCurrent,
    };
  }

  async function answerSession(input: AnswerSessionInput): Promise<AnswerSessionResult> {
    const result = await apiClient.answerSession(input);
    applyAnswerResult(result);
    return result;
  }

  async function finishSession(input: FinishSessionInput): Promise<FinishSessionResult> {
    return apiClient.finishSession(input);
  }

  return {
    user,
    subscription,
    premiumOffer,
    loading,
    error,
    checkoutStatus,
    checkoutError,
    cancelStatus,
    cancelError,
    accessToken,
    isAuthenticated,
    isPremium,
    identities,
    identitiesLoading,
    identitiesError,
    linkStatus,
    loginWithProvider,
    completeOAuthCallback,
    loadIdentities,
    linkPassword,
    unlinkIdentity,
    linkWithProvider,
    clearIdentitiesError,
    logout,
    loadCurrentUser,
    loadProfile,
    loadPaywall,
    loadCheckout,
    loadSubscription,
    hydrateFromCheckoutBridge,
    submitCheckout,
    cancelAutoRenew,
    answerSession,
    finishSession,
  };
});
