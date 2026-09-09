/**
 * ТЗ §4.7 / Блок C — единая логика live-countdown до восстановления жизни.
 * `lives_regen_at` — источник истины с backend'а; ничего не вычисляется через `lives_reset_at`.
 */
export interface LivesRegenUser {
  is_premium: boolean;
  lives_current: number;
  lives_max: number;
  lives_regen_at: string | null;
}

function regenAtMs(user: LivesRegenUser): number | null {
  if (!user.lives_regen_at) return null;
  const ms = Date.parse(user.lives_regen_at);
  return Number.isNaN(ms) ? null : ms;
}

/** Countdown показывается только Free-пользователю с неполными жизнями и известным regen-таймстампом. */
export function shouldShowLivesCountdown(user: LivesRegenUser, nowMs: number): boolean {
  if (user.is_premium) return false;
  if (user.lives_current >= user.lives_max) return false;
  const at = regenAtMs(user);
  return at != null && at > nowMs;
}

export function livesRegenRemainingMs(user: LivesRegenUser, nowMs: number): number | null {
  const at = regenAtMs(user);
  if (at == null) return null;
  return Math.max(0, at - nowMs);
}

/** True once `lives_regen_at` has passed for a Free user still short of max lives — signals a refresh is due. */
export function isLivesRegenDue(user: LivesRegenUser, nowMs: number): boolean {
  if (user.is_premium) return false;
  if (user.lives_current >= user.lives_max) return false;
  const at = regenAtMs(user);
  return at != null && at <= nowMs;
}

/** «3 ч 12 мин» / «42 мин» — без секунд, минуты округляются вверх так countdown не показывает 0 мин пока время не наступило. */
export function formatLivesCountdown(ms: number): string {
  const totalMinutes = Math.max(0, Math.ceil(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes} мин`;
  if (minutes === 0) return `${hours} ч`;
  return `${hours} ч ${minutes} мин`;
}

export function livesCountdownLabel(user: LivesRegenUser, nowMs: number): string | null {
  if (!shouldShowLivesCountdown(user, nowMs)) return null;
  const remaining = livesRegenRemainingMs(user, nowMs);
  if (remaining == null) return null;
  return `Следующая жизнь через ${formatLivesCountdown(remaining)}`;
}
