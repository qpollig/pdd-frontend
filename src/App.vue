<template>
  <RouterView v-slot="{ Component, route }">
    <Transition name="page-fade" mode="out-in">
      <component :is="Component" :key="route.matched[0]?.path ?? route.path" />
    </Transition>
  </RouterView>
</template>

<script setup lang="ts">
import { RouterView } from 'vue-router';
</script>

<style>
.page-fade-enter-active {
  transition: opacity 0.15s ease-out;
}
.page-fade-enter-from {
  opacity: 0;
}
.page-fade-leave-active {
  transition: none;
}
</style>
