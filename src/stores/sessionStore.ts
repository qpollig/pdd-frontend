import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type {
  AnswerSessionInput,
  AnswerSessionResult,
  FinishSessionInput,
  FinishSessionResult,
} from '../api/ApiClient';
import { apiClient } from '../api/client';
import type { CheckoutStatus } from '../domain/checkout';
import { MOCK_PAYMENT_PROVIDER_PLACEHOLDER } from '../domain/checkout';
import type {
  AuthSession,
  CancelSubscriptionResponse,
  CheckoutResult,
  CurrentUser,
  OAuthProvider,
  PremiumOffer,
  Subscription,
} from '../api/types';

export type CancelAutoRenewStatus = 'idle' | 'processing' | 'success' | 'error';

/** UserOut (TokenResponse.user) уже содержит lives_*; здесь добавляется только frontend-only `lives_regen_at`. */
function userFromAuthSession(session: AuthSession): CurrentUser {
  return {
    ...session.user,
    lives_regen_at: null,
  };
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

  function applyCheckoutResult(result: CheckoutResult) {
    subscription.value = result.subscription;
    if (user.value) {
      user.value = { ...user.value, is_premium: true };
    }
  }

  async function submitCheckout(): Promise<CheckoutResult | null> {
    if (checkoutStatus.value === 'processing' || checkoutStatus.value === 'success') {
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
      const result = await apiClient.checkout({
        plan: premiumOffer.value?.plan ?? 'trial_1rub_299',
        payment_method_token: MOCK_PAYMENT_PROVIDER_PLACEHOLDER,
        promo_code: null,
      });
      applyCheckoutResult(result);
      checkoutStatus.value = 'success';
      return result;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '';
      if (message === 'ALREADY_PREMIUM') {
        checkoutStatus.value = 'already-premium';
        checkoutError.value = null;
        return null;
      }
      checkoutStatus.value = 'error';
      checkoutError.value = 'Не удалось провести оплату. Попробуйте ещё раз.';
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
    submitCheckout,
    cancelAutoRenew,
    answerSession,
    finishSession,
  };
});
