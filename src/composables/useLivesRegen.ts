import { computed, onScopeDispose, ref, watch, type Ref } from 'vue';
import { isLivesRegenDue, livesCountdownLabel, type LivesRegenUser } from '../domain/livesRegen';

/** ТЗ §4.7: «раз в 30–60 сек» — не посекундно, countdown вторичен. */
const TICK_INTERVAL_MS = 45_000;

/**
 * Общая reactive-логика live-countdown для LivesCounter/Profile (Блок C).
 * Владеет только: текущим "now", форматированной меткой и единственным interval'ом своего
 * жизненного цикла. Сам refresh не делает — по достижении `lives_regen_at` один раз зовёт
 * `onRegenDue`, а обновление пользователя остаётся за существующим sessionStore.
 */
export function useLivesRegen(user: Ref<LivesRegenUser | null | undefined>, onRegenDue?: () => void) {
  const now = ref(Date.now());
  let handle: ReturnType<typeof setInterval> | null = null;
  let dueNotified = false;

  function stop() {
    if (handle == null) return;
    clearInterval(handle);
    handle = null;
  }

  function start() {
    if (handle != null) return;
    handle = setInterval(() => {
      now.value = Date.now();
    }, TICK_INTERVAL_MS);
  }

  const countdownLabel = computed(() => {
    const value = user.value;
    if (!value) return null;
    return livesCountdownLabel(value, now.value);
  });

  const showCountdown = computed(() => countdownLabel.value !== null);

  // A fresh lives_regen_at (new regen cycle after refresh) re-arms the due notification.
  watch(
    () => user.value?.lives_regen_at,
    () => {
      dueNotified = false;
    },
  );

  watch(
    [now, () => user.value],
    () => {
      const value = user.value;
      if (!value || dueNotified) return;
      if (isLivesRegenDue(value, now.value)) {
        dueNotified = true;
        onRegenDue?.();
      }
    },
    { immediate: true },
  );

  start();
  onScopeDispose(stop);

  return { showCountdown, countdownLabel };
}
