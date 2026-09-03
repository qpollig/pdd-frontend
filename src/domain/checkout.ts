import type { PremiumOffer } from '../api/types';

export type CheckoutUiKind =
  | 'loading'
  | 'load-error'
  | 'already-premium'
  | 'idle'
  | 'processing'
  | 'success'
  | 'payment-error';

export type CheckoutStatus = 'idle' | 'processing' | 'success' | 'error' | 'already-premium';

export function checkoutKind(input: {
  loading: boolean;
  loadError: string | null;
  isPremium: boolean;
  hasOffer: boolean;
  checkoutStatus: CheckoutStatus;
}): CheckoutUiKind {
  if (input.checkoutStatus === 'success') return 'success';
  if (input.checkoutStatus === 'already-premium' || input.isPremium) return 'already-premium';
  if (input.loading && !input.hasOffer) return 'loading';
  if (input.loadError && !input.hasOffer) return 'load-error';
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

/** ТЗ §4.5 request.payment_method_token. Placeholder until provider SDK exists. */
export const MOCK_PAYMENT_PROVIDER_PLACEHOLDER = 'mock-provider-placeholder';
