<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ current: number; total: number }>();

const percent = computed(() => {
  if (props.total <= 0) return 0;
  return Math.min(100, Math.round((props.current / props.total) * 100));
});
</script>

<template>
  <section class="rounded-card border border-border bg-surface p-5">
    <div class="flex items-center justify-between gap-2">
      <h2 class="text-sm font-medium text-text-secondary">Прогресс</h2>
      <span class="text-xs font-semibold tabular-nums text-text-secondary">{{ percent }}%</span>
    </div>
    <p class="mt-1 text-2xl font-semibold tabular-nums">
      {{ current }}<span class="text-base font-normal text-text-secondary"> / {{ total }}</span>
    </p>
    <div class="mt-3 h-2 w-full overflow-hidden rounded-pill bg-surface-muted" role="presentation">
      <div
        class="h-full rounded-pill bg-accent transition-[width] duration-500 ease-out"
        :style="{ width: `${percent}%` }"
      />
    </div>
    <p class="mt-2 text-xs text-text-secondary">Вопросы из общего банка вопросов ПДД</p>
  </section>
</template>
