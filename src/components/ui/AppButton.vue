<script setup lang="ts">
defineProps<{
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  type?: 'button' | 'submit';
  disabled?: boolean;
}>();
defineEmits<{ click: [event: MouseEvent] }>();
</script>

<template>
  <button
    :type="type ?? 'button'"
    :disabled="disabled"
    @click="$emit('click', $event)"
    class="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-pill px-4 py-3 text-sm font-semibold outline-none transition duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary disabled:cursor-not-allowed disabled:opacity-50"
    :class="[
      (variant ?? 'primary') === 'primary' &&
        'bg-accent text-text-on-accent hover:brightness-95 active:brightness-90',
      variant === 'secondary' &&
        'border border-border bg-surface text-text-primary hover:bg-surface-raised',
      variant === 'ghost' && 'text-text-secondary hover:bg-surface-raised hover:text-text-primary',
      variant === 'danger' &&
        'border border-incorrect/40 bg-incorrect/5 text-incorrect hover:bg-incorrect/10 active:bg-incorrect/15',
    ]"
  >
    <slot />
  </button>
</template>
