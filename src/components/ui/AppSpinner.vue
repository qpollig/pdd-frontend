<script setup lang="ts">
defineProps<{ label?: string }>();
</script>

<template>
  <div class="flex items-center justify-center py-12" role="status">
    <span class="sr-only">{{ label ?? 'Загрузка' }}</span>
    <span
      class="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-text-primary"
      aria-hidden="true"
    />
  </div>
</template>
