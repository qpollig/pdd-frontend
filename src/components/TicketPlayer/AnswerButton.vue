<script setup lang="ts">
export type AnswerVariant =
  | 'default'
  | 'selected'
  | 'correct'
  | 'incorrect'
  | 'correct-muted'
  | 'disabled';

defineProps<{
  text: string;
  variant: AnswerVariant;
}>();
defineEmits<{ click: [] }>();
</script>

<template>
  <button
    type="button"
    class="flex min-h-11 w-full items-center gap-3 rounded-card border px-4 py-3.5 text-left text-sm leading-relaxed outline-none transition duration-200 ease-out sm:text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
    :class="[
      variant === 'default' &&
        'cursor-pointer border-border bg-surface text-text-primary shadow-sm hover:border-accent hover:bg-accent/5 active:bg-accent/10',
      variant === 'selected' && 'border-accent bg-accent/10 text-text-primary',
      variant === 'correct' && 'border-correct bg-correct/10 text-text-primary',
      variant === 'incorrect' && 'border-incorrect bg-incorrect/10 text-text-primary',
      variant === 'correct-muted' && 'border-correct bg-white text-text-primary',
      variant === 'disabled' && 'border-border bg-surface-muted text-text-secondary',
    ]"
    :disabled="variant !== 'default'"
    @click="$emit('click')"
  >
    <span
      v-if="variant === 'correct' || variant === 'correct-muted'"
      aria-hidden="true"
      class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-correct text-white"
    >
      <svg viewBox="0 0 24 24" class="h-3 w-3" fill="none" stroke="currentColor" stroke-width="3">
        <path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </span>
    <span
      v-else-if="variant === 'incorrect'"
      aria-hidden="true"
      class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-incorrect text-white"
    >
      <svg viewBox="0 0 24 24" class="h-3 w-3" fill="none" stroke="currentColor" stroke-width="3">
        <path d="M6 6l12 12M18 6L6 18" stroke-linecap="round" />
      </svg>
    </span>
    <span>{{ text }}</span>
  </button>
</template>
