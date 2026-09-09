/**
 * Pure decision logic for the checkout-return flow (D1.2/D1.3). Confirmed live (2026-09-08):
 * the backend's BILLING_RETURN_URL always lands on `/profile?checkout=success` — there is no
 * dedicated `/checkout/return` route on this deployment, so this logic is wired into
 * ProfileScreen via useCheckoutReturn, not a separate screen.
 *
 * `?checkout=success` only means "the user came back from the payment redirect" — never proof
 * that Premium is active. That still has to be confirmed by polling the real subscription/user
 * state (see sessionStore.loadProfile()).
 */

export type CheckoutReturnState = 'idle' | 'checking' | 'success' | 'timeout';

/** Bounded: first check + up to this many retries, spaced by the composable's poll interval. */
export const CHECKOUT_RETURN_MAX_ATTEMPTS = 5;

export function isCheckoutReturnQuery(value: unknown): boolean {
  return value === 'success';
}

export function nextCheckoutReturnState(input: {
  isCheckoutQuery: boolean;
  isPremium: boolean;
  attempts: number;
  maxAttempts: number;
}): CheckoutReturnState {
  if (!input.isCheckoutQuery) return 'idle';
  if (input.isPremium) return 'success';
  if (input.attempts >= input.maxAttempts) return 'timeout';
  return 'checking';
}
