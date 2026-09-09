import { effectScope, nextTick, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LivesRegenUser } from '../domain/livesRegen';
import { useLivesRegen } from './useLivesRegen';

const NOW = Date.parse('2026-09-08T10:00:00.000Z');

function user(overrides: Partial<LivesRegenUser> = {}): LivesRegenUser {
  return {
    is_premium: false,
    lives_current: 1,
    lives_max: 3,
    lives_regen_at: '2026-09-08T13:12:00.000Z',
    ...overrides,
  };
}

describe('useLivesRegen', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('exposes a formatted countdown label while a refresh is not yet due', async () => {
    const scope = effectScope();
    const userRef = ref<LivesRegenUser | null>(user());
    const result = scope.run(() => useLivesRegen(userRef))!;
    await nextTick();

    expect(result.showCountdown.value).toBe(true);
    expect(result.countdownLabel.value).toBe('Следующая жизнь через 3 ч 12 мин');

    scope.stop();
  });

  it('calls onRegenDue exactly once when the timestamp is reached, and stops updating after refresh', async () => {
    const onRegenDue = vi.fn();
    const scope = effectScope();
    const userRef = ref<LivesRegenUser | null>(user({ lives_regen_at: '2026-09-08T10:00:30.000Z' }));
    scope.run(() => useLivesRegen(userRef, onRegenDue));
    await nextTick();
    expect(onRegenDue).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(45_000);
    expect(onRegenDue).toHaveBeenCalledTimes(1);

    // Simulate the caller refreshing the user store but the backend response lagging —
    // same stale timestamp must not re-trigger a second refresh.
    await vi.advanceTimersByTimeAsync(45_000);
    expect(onRegenDue).toHaveBeenCalledTimes(1);

    scope.stop();
  });

  it('countdown disappears once a refresh reports lives back at max', async () => {
    const scope = effectScope();
    const userRef = ref<LivesRegenUser | null>(user({ lives_regen_at: '2026-09-08T10:00:30.000Z' }));
    const result = scope.run(() => useLivesRegen(userRef))!;
    await vi.advanceTimersByTimeAsync(45_000);
    expect(result.showCountdown.value).toBe(false); // due, but not yet "at max" — regen_at has passed

    userRef.value = user({ lives_current: 3, lives_max: 3, lives_regen_at: null });
    await nextTick();

    expect(result.showCountdown.value).toBe(false);
    expect(result.countdownLabel.value).toBeNull();

    scope.stop();
  });

  it('continues counting down from a new lives_regen_at after refresh, and can fire onRegenDue again', async () => {
    const onRegenDue = vi.fn();
    const scope = effectScope();
    const userRef = ref<LivesRegenUser | null>(user({ lives_regen_at: '2026-09-08T10:00:30.000Z' }));
    const result = scope.run(() => useLivesRegen(userRef, onRegenDue))!;

    await vi.advanceTimersByTimeAsync(45_000);
    expect(onRegenDue).toHaveBeenCalledTimes(1);

    // Refresh comes back: still short of max, new regen cycle further out.
    userRef.value = user({ lives_current: 2, lives_max: 3, lives_regen_at: '2026-09-08T14:00:00.000Z' });
    await nextTick();

    expect(result.showCountdown.value).toBe(true);
    expect(result.countdownLabel.value).toBe('Следующая жизнь через 4 ч');

    await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000);
    expect(onRegenDue).toHaveBeenCalledTimes(2);

    scope.stop();
  });

  it('uses a single interval and clears it on scope dispose', async () => {
    const setIntervalSpy = vi.spyOn(global, 'setInterval');
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
    const scope = effectScope();
    const userRef = ref<LivesRegenUser | null>(user());
    scope.run(() => useLivesRegen(userRef));
    await nextTick();

    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    expect(clearIntervalSpy).not.toHaveBeenCalled();

    scope.stop();

    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);

    // No further ticks after dispose — advancing time must not throw or resurrect the interval.
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);

    setIntervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();
  });
});
