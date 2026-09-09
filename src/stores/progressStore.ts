import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { apiClient } from '../api/client';
import type { ProgressSnapshot, TicketProgressStatus } from '../domain/progress';

/**
 * GET /api/v1/progress, cached for the session. Server-computed and survives reload (ТЗ: билеты/темы
 * не сбрасываются при перезагрузке) — see docs/Таски по фронту.md Блок A. Consumers (Block B screens)
 * call loadProgress() on mount and again after finishSession so colors/counts update without a reload.
 */
export const useProgressStore = defineStore('progress', () => {
  const snapshot = ref<ProgressSnapshot | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function loadProgress() {
    loading.value = true;
    error.value = null;
    try {
      snapshot.value = await apiClient.getProgress();
    } catch {
      error.value = 'Не удалось загрузить прогресс';
    } finally {
      loading.value = false;
    }
  }

  function ticketStatus(ticketId: string): TicketProgressStatus {
    return snapshot.value?.ticketStatus.get(ticketId) ?? 'not_started';
  }

  function topicProgress(topicId: string): { passed: number; total: number } {
    return snapshot.value?.topicProgress.get(topicId) ?? { passed: 0, total: 0 };
  }

  /** `progressStore.bank.passed / .total` — a computed, not a function, per its usage on the dashboard. */
  const bank = computed(() => snapshot.value?.bank ?? { passed: 0, total: 0 });

  return {
    snapshot,
    loading,
    error,
    loadProgress,
    ticketStatus,
    topicProgress,
    bank,
  };
});
