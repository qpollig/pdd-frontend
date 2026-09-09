import { describe, expect, it } from 'vitest';
import {
  formatLivesCountdown,
  isLivesRegenDue,
  livesCountdownLabel,
  livesRegenRemainingMs,
  shouldShowLivesCountdown,
  type LivesRegenUser,
} from './livesRegen';

const NOW = Date.parse('2026-09-08T10:00:00.000Z');

function user(overrides: Partial<LivesRegenUser> = {}): LivesRegenUser {
  return {
    is_premium: false,
    lives_current: 1,
    lives_max: 3,
    lives_regen_at: '2026-09-08T13:12:00.000Z', // +3h12m
    ...overrides,
  };
}

describe('shouldShowLivesCountdown', () => {
  it('hides the countdown for Premium', () => {
    expect(shouldShowLivesCountdown(user({ is_premium: true }), NOW)).toBe(false);
  });

  it('hides the countdown once lives are at max', () => {
    expect(shouldShowLivesCountdown(user({ lives_current: 3, lives_max: 3 }), NOW)).toBe(false);
  });

  it('hides the countdown when lives_regen_at is null', () => {
    expect(shouldShowLivesCountdown(user({ lives_regen_at: null }), NOW)).toBe(false);
  });

  it('shows the countdown for Free, incomplete lives and a future regen timestamp', () => {
    expect(shouldShowLivesCountdown(user(), NOW)).toBe(true);
  });

  it('hides the countdown once the regen timestamp is in the past (due for refresh, not display)', () => {
    expect(shouldShowLivesCountdown(user({ lives_regen_at: '2026-09-08T09:59:00.000Z' }), NOW)).toBe(false);
  });
});

describe('formatLivesCountdown', () => {
  it('formats several hours plus minutes', () => {
    expect(formatLivesCountdown(3 * 3_600_000 + 12 * 60_000)).toBe('3 ч 12 мин');
  });

  it('formats under an hour as minutes only', () => {
    expect(formatLivesCountdown(42 * 60_000)).toBe('42 мин');
  });

  it('drops the minutes part on an exact hour', () => {
    expect(formatLivesCountdown(2 * 3_600_000)).toBe('2 ч');
  });
});

describe('livesCountdownLabel', () => {
  it('renders the full human-readable label', () => {
    expect(livesCountdownLabel(user(), NOW)).toBe('Следующая жизнь через 3 ч 12 мин');
  });

  it('returns null when the countdown should not be shown', () => {
    expect(livesCountdownLabel(user({ is_premium: true }), NOW)).toBeNull();
  });
});

describe('livesRegenRemainingMs', () => {
  it('returns null without a regen timestamp', () => {
    expect(livesRegenRemainingMs(user({ lives_regen_at: null }), NOW)).toBeNull();
  });

  it('clamps to zero once the timestamp has passed', () => {
    expect(livesRegenRemainingMs(user({ lives_regen_at: '2026-09-08T09:00:00.000Z' }), NOW)).toBe(0);
  });
});

describe('isLivesRegenDue', () => {
  it('is false while the timestamp is still in the future', () => {
    expect(isLivesRegenDue(user(), NOW)).toBe(false);
  });

  it('is true once the timestamp has passed for a Free user short of max lives', () => {
    expect(isLivesRegenDue(user({ lives_regen_at: '2026-09-08T09:59:59.000Z' }), NOW)).toBe(true);
  });

  it('is false for Premium even past the timestamp', () => {
    expect(isLivesRegenDue(user({ is_premium: true, lives_regen_at: '2026-09-08T09:00:00.000Z' }), NOW)).toBe(
      false,
    );
  });

  it('is false once lives are already at max', () => {
    expect(
      isLivesRegenDue(user({ lives_current: 3, lives_max: 3, lives_regen_at: '2026-09-08T09:00:00.000Z' }), NOW),
    ).toBe(false);
  });
});
