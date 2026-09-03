<script setup lang="ts">
import { computed } from 'vue';
import {
  getPostSessionActions,
  type PostSessionActionId,
} from '../../domain/postSessionNav';
import type { TicketMode } from '../../types/ticket';
import AppButton from '../ui/AppButton.vue';

const props = withDefaults(
  defineProps<{
    open: boolean;
    mode: TicketMode;
    modeLabel: string;
    correctCount: number;
    errorCount: number;
    passed?: boolean | null;
    timedOut?: boolean;
    title?: string;
    remainingErrorCount?: number;
  }>(),
  {
    passed: null,
    timedOut: false,
    title: 'Результат билета',
    remainingErrorCount: 0,
  },
);

defineEmits<{ navigate: [action: PostSessionActionId] }>();

const actions = computed(() =>
  getPostSessionActions({
    mode: props.mode,
    remainingErrorCount: props.remainingErrorCount,
  }),
);
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-end justify-center overflow-x-hidden bg-black/40 p-4 sm:items-center"
    role="dialog"
    aria-modal="true"
    aria-labelledby="session-result-title"
  >
    <div class="w-full min-w-0 max-w-md overflow-x-hidden rounded-card bg-surface p-5 shadow-lg sm:p-6">
      <h2 id="session-result-title" class="text-lg font-semibold sm:text-xl">{{ title }}</h2>
      <p class="mt-1 text-sm text-text-secondary">{{ modeLabel }}</p>
      <p v-if="timedOut" class="mt-3 text-sm text-text-secondary">Время экзамена истекло.</p>
      <p v-if="passed === true" class="mt-3 flex items-center gap-2 text-base font-semibold text-correct">
        <svg viewBox="0 0 24 24" class="h-5 w-5 shrink-0" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true">
          <path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        Экзамен сдан
      </p>
      <p v-else-if="passed === false" class="mt-3 flex items-center gap-2 text-base font-semibold text-incorrect">
        <svg viewBox="0 0 24 24" class="h-5 w-5 shrink-0" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" stroke-linecap="round" />
        </svg>
        Экзамен не сдан
      </p>
      <p v-if="errorCount === 0" class="mt-4 flex items-center gap-2 text-base font-semibold text-correct">
        <svg viewBox="0 0 24 24" class="h-5 w-5 shrink-0" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true">
          <path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        Поздравляю! 0 ошибок.
      </p>
      <dl class="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div class="min-w-0 rounded-card bg-correct/10 p-3">
          <dt class="text-text-secondary">Верно</dt>
          <dd class="mt-1 text-2xl font-semibold tabular-nums text-correct">{{ correctCount }}</dd>
        </div>
        <div class="min-w-0 rounded-card p-3" :class="errorCount > 0 ? 'bg-incorrect/10' : 'bg-surface-raised'">
          <dt class="text-text-secondary">Ошибки</dt>
          <dd
            class="mt-1 text-2xl font-semibold tabular-nums"
            :class="errorCount > 0 ? 'text-incorrect' : 'text-text-primary'"
          >
            {{ errorCount }}
          </dd>
        </div>
      </dl>
      <div class="mt-6 flex min-w-0 flex-col gap-2">
        <AppButton class="w-full min-w-0" @click="$emit('navigate', actions.primary.id)">
          {{ actions.primary.label }}
        </AppButton>
        <AppButton
          v-for="action in actions.secondary"
          :key="action.id"
          :variant="action.variant"
          class="w-full min-w-0"
          @click="$emit('navigate', action.id)"
        >
          {{ action.label }}
        </AppButton>
      </div>
    </div>
  </div>
</template>
