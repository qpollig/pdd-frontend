import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type {
  AnswerSessionInput,
  AnswerSessionResult,
  CheckoutInitResult,
  FinishSessionInput,
  FinishSessionResult,
} from '../api/ApiClient';
import { apiClient } from '../api/client';
import type { CheckoutStatus } from '../domain/checkout';
import type {
  AuthSession,
  CancelSubscriptionResponse,
  CurrentUser,
  OAuthProvider,
  PremiumOffer,
  Subscription,
} from '../api/types';

export type CancelAutoRenewStatus = 'idle' | 'processing' | 'success' | 'error';

/**
 * D1 one-shot checkout auth bridge (see report): the real payment redirect is a full-page
 * navigation to an external origin and back, which wipes the in-memory-only accessToken (ТЗ
 * §2.2). This sessionStorage entry exists ONLY to survive that single round trip — written right
 * before the redirect, consumed and deleted on the very next app boot regardless of outcome. It
 * never becomes a standing auth source: normal login/logout/navigation never touch it.
 */
const CHECKOUT_AUTH_BRIDGE_KEY = 'av_checkout_auth_bridge';

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

  /** ТЗ §2.2: accessToken только в памяти Pinia, не cookie / localStorage. */
  const accessToken = ref<string | null>(null);

  const isAuthenticated = computed(() => Boolean(accessToken.value && user.value));

  /** is_premium живёт в UserOut (openapi.json), не в SubscriptionOut. */
  const isPremium = computed(() => user.value?.is_premium ?? false);

  function applySession(session: AuthSession) {
    accessToken.value = session.access_token;
    user.value = userFromAuthSession(session);
  }

  async function loginWithProvider(provider: OAuthProvider) {
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
    loginWithProvider,
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
