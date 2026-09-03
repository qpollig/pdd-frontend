<script setup lang="ts">
defineProps<{ title: string; description?: string }>();
</script>

<template>
  <div class="rounded-card border border-incorrect/30 bg-incorrect/5 p-6 text-center" role="alert">
    <p class="font-semibold text-text-primary">{{ title }}</p>
    <p v-if="description" class="mt-2 text-sm text-text-secondary">{{ description }}</p>
    <div v-if="$slots.default" class="mt-4">
      <slot />
    </div>
  </div>
</template>
