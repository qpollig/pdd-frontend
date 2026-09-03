<script setup lang="ts">
defineProps<{ current: number; max: number; isPremium: boolean }>();
</script>

<template>
  <section class="rounded-card border border-border bg-surface p-5">
    <div class="flex items-center justify-between gap-2">
      <h2 class="text-sm font-medium text-text-secondary">Жизни</h2>
      <span
        class="text-xs font-semibold tabular-nums text-text-secondary"
        role="status"
        aria-label="Жизни"
      >
        {{ isPremium ? '∞' : `${current} / ${max}` }}
      </span>
    </div>
    <p v-if="isPremium" class="mt-1 text-2xl font-semibold" aria-hidden="true">∞</p>
    <div v-else class="mt-3 flex flex-wrap items-center gap-1.5" aria-hidden="true">
      <span
        v-for="i in max"
        :key="i"
        class="h-2.5 w-2.5 rounded-full"
        :class="i <= current ? 'bg-accent' : 'bg-surface-muted'"
      />
    </div>
    <p class="mt-3 text-xs text-text-secondary">
      {{
        isPremium
          ? 'Premium: жизни не ограничивают прохождение.'
          : 'Неверный ответ уменьшает жизни. Восстановление жизней пока недоступно.'
      }}
    </p>
  </section>
</template>
