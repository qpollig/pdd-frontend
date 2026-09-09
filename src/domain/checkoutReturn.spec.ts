import { describe, expect, it } from 'vitest';
import { CHECKOUT_RETURN_MAX_ATTEMPTS, isCheckoutReturnQuery, nextCheckoutReturnState } from './checkoutReturn';

describe('isCheckoutReturnQuery', () => {
  it('is true only for the exact backend-confirmed value "success"', () => {
    expect(isCheckoutReturnQuery('success')).toBe(true);
  });

  it('is false when the query param is absent, empty, or some other value', () => {
    expect(isCheckoutReturnQuery(undefined)).toBe(false);
    expect(isCheckoutReturnQuery(null)).toBe(false);
    expect(isCheckoutReturnQuery('')).toBe(false);
    expect(isCheckoutReturnQuery('failed')).toBe(false);
    expect(isCheckoutReturnQuery('1')).toBe(false);
  });

  it('is false for an array query value (repeated ?checkout= params)', () => {
    expect(isCheckoutReturnQuery(['success', 'success'])).toBe(false);
  });
});

describe('nextCheckoutReturnState', () => {
  it('is idle when the URL does not carry the checkout=success marker', () => {
    expect(
      nextCheckoutReturnState({ isCheckoutQuery: false, isPremium: false, attempts: 0, maxAttempts: 5 }),
    ).toBe('idle');
    expect(
      nextCheckoutReturnState({ isCheckoutQuery: false, isPremium: true, attempts: 0, maxAttempts: 5 }),
    ).toBe('idle');
  });

  it('is success immediately when Premium is already active on the very first check', () => {
    expect(
      nextCheckoutReturnState({ isCheckoutQuery: true, isPremium: true, attempts: 1, maxAttempts: 5 }),
    ).toBe('success');
  });

  it('keeps checking while Premium is not yet active and attempts remain', () => {
    expect(
      nextCheckoutReturnState({ isCheckoutQuery: true, isPremium: false, attempts: 1, maxAttempts: 5 }),
    ).toBe('checking');
    expect(
      nextCheckoutReturnState({ isCheckoutQuery: true, isPremium: false, attempts: 4, maxAttempts: 5 }),
    ).toBe('checking');
  });

  it('times out once attempts are exhausted without Premium — never reports success', () => {
    expect(
      nextCheckoutReturnState({ isCheckoutQuery: true, isPremium: false, attempts: 5, maxAttempts: 5 }),
    ).toBe('timeout');
    expect(
      nextCheckoutReturnState({ isCheckoutQuery: true, isPremium: false, attempts: 9, maxAttempts: 5 }),
    ).toBe('timeout');
  });

  it('prefers success over timeout when both conditions coincide on the same attempt', () => {
    expect(
      nextCheckoutReturnState({ isCheckoutQuery: true, isPremium: true, attempts: 5, maxAttempts: 5 }),
    ).toBe('success');
  });

  it('exposes a bounded default attempt count', () => {
    expect(CHECKOUT_RETURN_MAX_ATTEMPTS).toBeGreaterThan(1);
    expect(CHECKOUT_RETURN_MAX_ATTEMPTS).toBeLessThanOrEqual(10);
  });
});
