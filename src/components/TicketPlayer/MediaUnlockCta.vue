<script setup lang="ts">
defineEmits<{ 'open-paywall': [] }>();
</script>

<template>
  <button
    type="button"
    class="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-card border border-border bg-surface-muted px-4 py-2.5 text-left outline-none transition duration-200 ease-out hover:border-accent/40 hover:bg-surface-raised active:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
    @click="$emit('open-paywall')"
  >
    <span
      class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface text-text-secondary"
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="5" y="11" width="14" height="9" rx="2" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke-linecap="round" />
      </svg>
    </span>
    <span class="min-w-0 flex-1 truncate text-sm font-medium text-text-secondary">3D-Видеоразбор</span>
    <svg
      viewBox="0 0 24 24"
      class="h-4 w-4 shrink-0 text-text-secondary"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      aria-hidden="true"
    >
      <path d="M9 18l6-6-6-6" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  </button>
</template>
