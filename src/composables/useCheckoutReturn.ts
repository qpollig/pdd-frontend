import { onScopeDispose, ref } from 'vue';
import {
  CHECKOUT_RETURN_MAX_ATTEMPTS,
  isCheckoutReturnQuery,
  nextCheckoutReturnState,
  type CheckoutReturnState,
} from '../domain/checkoutReturn';

/** Bounded spacing — never "every second" (ТЗ D1.3), never unbounded. */
const DEFAULT_POLL_INTERVAL_MS = 2000;

export interface UseCheckoutReturnInput {
  /** Reactive accessor for the route's `checkout` query param. */
  checkoutQuery: () => unknown;
  /** Reactive accessor for the current Premium state (sessionStore.isPremium). */
  isPremium: () => boolean;
  /** One poll attempt: re-fetches user/subscription state (sessionStore.loadProfile). */
  refresh: () => Promise<void>;
  pollIntervalMs?: number;
  maxAttempts?: number;
}

/**
 * D1.2/D1.3: `?checkout=success` only means "the browser came back from the payment redirect" —
 * never proof Premium is active. This owns the bounded, single-loop polling that turns that
 * query param into a real, backend-confirmed state (see domain/checkoutReturn.ts for the pure
 * decision table). Wired into ProfileScreen, since the live backend's BILLING_RETURN_URL lands
 * there directly (see D1 report) rather than on a dedicated /checkout/return route.
 */
export function useCheckoutReturn(input: UseCheckoutReturnInput) {
  const status = ref<CheckoutReturnState>('idle');
  const attempts = ref(0);
  const pollIntervalMs = input.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const maxAttempts = input.maxAttempts ?? CHECKOUT_RETURN_MAX_ATTEMPTS;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  function clearPending() {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
  }

  async function tick() {
    if (disposed) return;
    attempts.value += 1;
    try {
      await input.refresh();
    } catch {
      // A failed attempt just means this poll saw no confirmation — never fabricate success.
    }
    if (disposed) return;

    status.value = nextCheckoutReturnState({
      isCheckoutQuery: isCheckoutReturnQuery(input.checkoutQuery()),
      isPremium: input.isPremium(),
      attempts: attempts.value,
      maxAttempts,
    });
    if (status.value === 'checking') {
      timer = setTimeout(() => void tick(), pollIntervalMs);
    }
  }

  function start() {
    if (!isCheckoutReturnQuery(input.checkoutQuery())) {
      status.value = 'idle';
      return;
    }
    if (input.isPremium()) {
      // Already confirmed (e.g. a repeat visit, or the checkout-bridge hydration already
      // refreshed the user) — no need to spend a request re-proving it.
      status.value = 'success';
      return;
    }
    attempts.value = 0;
    status.value = 'checking';
    void tick();
  }

  start();
  onScopeDispose(() => {
    disposed = true;
    clearPending();
  });

  return { status, attempts };
}
