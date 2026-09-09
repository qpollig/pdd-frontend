import type { PremiumOffer } from '../api/types';

/**
 * D1: checkout/init only starts a redirect-oriented payment — it never resolves to "success"
 * synchronously (see ApiClient.checkout()). CheckoutScreen's own job ends once the browser starts
 * navigating to confirmation_url; the actual success state lives on the return flow
 * (see domain/checkoutReturn.ts + composables/useCheckoutReturn.ts), not here.
 */
export type CheckoutUiKind =
  | 'loading'
  | 'load-error'
  | 'already-premium'
  | 'idle'
  | 'processing'
  | 'redirecting'
  | 'payment-error';

export type CheckoutStatus = 'idle' | 'processing' | 'redirecting' | 'error' | 'already-premium';

export function checkoutKind(input: {
  loading: boolean;
  loadError: string | null;
  isPremium: boolean;
  hasOffer: boolean;
  checkoutStatus: CheckoutStatus;
}): CheckoutUiKind {
  if (input.checkoutStatus === 'already-premium' || input.isPremium) return 'already-premium';
  if (input.loading && !input.hasOffer) return 'loading';
  if (input.loadError && !input.hasOffer) return 'load-error';
  if (input.checkoutStatus === 'redirecting') return 'redirecting';
  if (input.checkoutStatus === 'processing') return 'processing';
  if (input.checkoutStatus === 'error') return 'payment-error';
  return 'idle';
}

export function canSubmitCheckout(kind: CheckoutUiKind): boolean {
  return kind === 'idle' || kind === 'payment-error';
}

export function checkoutPayLabel(offer: PremiumOffer): string {
  return `Оплатить ${offer.trial_price_rub} ₽`;
}
