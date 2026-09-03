<script setup lang="ts">
defineProps<{ isFavorite: boolean }>();
defineEmits<{ toggle: [] }>();
</script>

<template>
  <button
    type="button"
    class="flex min-h-11 cursor-pointer items-center gap-2 rounded-pill px-3 py-2 text-sm font-medium outline-none transition-colors duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
    :class="
      isFavorite
        ? 'bg-accent text-text-on-accent shadow-[0_2px_4px_rgba(0,0,0,0.18)] hover:brightness-95'
        : 'bg-surface text-text-secondary shadow-sm hover:bg-accent/10 hover:text-text-primary'
    "
    :aria-pressed="isFavorite"
    @click="$emit('toggle')"
  >
    <svg
      viewBox="0 0 24 24"
      class="h-5 w-5"
      :fill="isFavorite ? 'currentColor' : 'none'"
      stroke="currentColor"
      stroke-width="1.8"
      aria-hidden="true"
    >
      <path
        d="M12 3.5l2.6 5.27 5.82.85-4.21 4.1.99 5.8L12 16.9l-5.2 2.62.99-5.8-4.21-4.1 5.82-.85L12 3.5z"
        stroke-linejoin="round"
      />
    </svg>
    {{ isFavorite ? 'В избранном' : 'Добавить в избранное' }}
  </button>
</template>
