import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCountdownTimer } from './examTimer';

describe('createCountdownTimer', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts once, decrements, stops at zero, and does not tick after stop', () => {
    vi.useFakeTimers();
    let remaining = 3;
    const onZero = vi.fn();
    const timer = createCountdownTimer({
      tick: () => {
        remaining -= 1;
      },
      isZero: () => remaining <= 0,
      onZero,
    });

    timer.start();
    timer.start();
    vi.advanceTimersByTime(2000);
    expect(remaining).toBe(1);
    expect(onZero).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);
    expect(remaining).toBe(0);
    expect(onZero).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(5000);
    expect(remaining).toBe(0);
    expect(onZero).toHaveBeenCalledTimes(1);
  });

  it('stop prevents further ticks before zero', () => {
    vi.useFakeTimers();
    let remaining = 10;
    const onZero = vi.fn();
    const timer = createCountdownTimer({
      tick: () => {
        remaining -= 1;
      },
      isZero: () => remaining <= 0,
      onZero,
    });

    timer.start();
    vi.advanceTimersByTime(2000);
    timer.stop();
    vi.advanceTimersByTime(8000);
    expect(remaining).toBe(8);
    expect(onZero).not.toHaveBeenCalled();
  });
});
