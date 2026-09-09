import { effectScope, nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCheckoutReturn } from './useCheckoutReturn';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useCheckoutReturn', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stays idle and never polls when the URL has no checkout=success marker', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const scope = effectScope();
    const result = scope.run(() =>
      useCheckoutReturn({ checkoutQuery: () => undefined, isPremium: () => false, refresh }),
    )!;
    await nextTick();

    expect(result.status.value).toBe('idle');
    expect(refresh).not.toHaveBeenCalled();

    scope.stop();
  });

  it('resolves to success without polling when Premium is already active on arrival', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const scope = effectScope();
    const result = scope.run(() =>
      useCheckoutReturn({ checkoutQuery: () => 'success', isPremium: () => true, refresh }),
    )!;
    await nextTick();

    expect(result.status.value).toBe('success');
    expect(refresh).not.toHaveBeenCalled();

    scope.stop();
  });

  it('checkout=success does not by itself prove payment — polls until Premium is confirmed', async () => {
    let premium = false;
    const refresh = vi.fn().mockImplementation(async () => {
      /* backend confirms on the 2nd poll */
    });
    const scope = effectScope();
    const result = scope.run(() =>
      useCheckoutReturn({
        checkoutQuery: () => 'success',
        isPremium: () => premium,
        refresh,
        pollIntervalMs: 1000,
        maxAttempts: 5,
      }),
    )!;
    await nextTick();

    expect(result.status.value).toBe('checking');
    expect(refresh).toHaveBeenCalledTimes(1);

    premium = true;
    await vi.advanceTimersByTimeAsync(1000);

    expect(refresh).toHaveBeenCalledTimes(2);
    expect(result.status.value).toBe('success');

    // Stops polling once it succeeds.
    await vi.advanceTimersByTimeAsync(5000);
    expect(refresh).toHaveBeenCalledTimes(2);

    scope.stop();
  });

  it('times out after the bounded attempt count without ever reporting success', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const scope = effectScope();
    const result = scope.run(() =>
      useCheckoutReturn({
        checkoutQuery: () => 'success',
        isPremium: () => false,
        refresh,
        pollIntervalMs: 1000,
        maxAttempts: 3,
      }),
    )!;
    await nextTick();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(result.status.value).toBe('checking');

    await vi.advanceTimersByTimeAsync(1000);
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(result.status.value).toBe('checking');

    await vi.advanceTimersByTimeAsync(1000);
    expect(refresh).toHaveBeenCalledTimes(3);
    expect(result.status.value).toBe('timeout');

    // No further attempts after timeout.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(refresh).toHaveBeenCalledTimes(3);

    scope.stop();
  });

  it('a failing refresh does not fabricate success and the loop keeps going until timeout', async () => {
    const refresh = vi.fn().mockRejectedValue(new Error('NETWORK'));
    const scope = effectScope();
    const result = scope.run(() =>
      useCheckoutReturn({
        checkoutQuery: () => 'success',
        isPremium: () => false,
        refresh,
        pollIntervalMs: 1000,
        maxAttempts: 2,
      }),
    )!;
    await nextTick();
    expect(result.status.value).toBe('checking');

    await vi.advanceTimersByTimeAsync(1000);
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(result.status.value).toBe('timeout');

    scope.stop();
  });

  it('clears its pending timer on scope dispose — no polling after unmount', async () => {
    const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
    const refresh = vi.fn().mockResolvedValue(undefined);
    const scope = effectScope();
    scope.run(() =>
      useCheckoutReturn({
        checkoutQuery: () => 'success',
        isPremium: () => false,
        refresh,
        pollIntervalMs: 1000,
        maxAttempts: 5,
      }),
    );
    await nextTick();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(setTimeoutSpy).toHaveBeenCalledTimes(1);

    scope.stop();
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(refresh).toHaveBeenCalledTimes(1);

    setTimeoutSpy.mockRestore();
    clearTimeoutSpy.mockRestore();
  });

  it('never runs two overlapping poll loops — only one timer pending at a time', async () => {
    const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
    const first = deferred<void>();
    const refresh = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(undefined);
    const scope = effectScope();
    scope.run(() =>
      useCheckoutReturn({
        checkoutQuery: () => 'success',
        isPremium: () => false,
        refresh,
        pollIntervalMs: 1000,
        maxAttempts: 5,
      }),
    );
    await nextTick();

    // First attempt is still in flight — no timer scheduled yet (would be a second concurrent loop).
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(setTimeoutSpy).not.toHaveBeenCalled();

    first.resolve();
    await nextTick();
    await nextTick();

    expect(setTimeoutSpy).toHaveBeenCalledTimes(1);

    scope.stop();
    setTimeoutSpy.mockRestore();
  });
});
