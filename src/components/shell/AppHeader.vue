<script setup lang="ts">
import { ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import logo from '../../assets/logo.png';
import { useSessionStore } from '../../stores/sessionStore';

const session = useSessionStore();
const router = useRouter();
const route = useRoute();

const links = [
  { to: '/dashboard', label: 'Главная' },
  { to: '/tickets', label: 'Билеты' },
  { to: '/exam-gibdd', label: 'Экзамен ГИБДД' },
  { to: '/statistics', label: 'Статистика' },
  { to: '/profile', label: 'Профиль' },
];

const isMenuOpen = ref(false);

function closeMenu() {
  isMenuOpen.value = false;
}

function toggleMenu() {
  isMenuOpen.value = !isMenuOpen.value;
}

watch(isMenuOpen, (open) => {
  document.body.classList.toggle('modal-open', open);
});

watch(
  () => route.fullPath,
  () => closeMenu(),
);

function logout() {
  closeMenu();
  session.logout();
  void router.replace({ name: 'auth' });
}
</script>

<template>
  <header class="relative border-b border-border bg-surface">
    <div class="mx-auto flex max-w-[1280px] items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:gap-6 lg:px-8 lg:py-4">
      <RouterLink to="/dashboard" class="flex items-center gap-3">
        <img :src="logo" alt="" class="h-9 w-9 rounded-xl object-contain lg:h-12 lg:w-12" />
        <span class="text-sm font-semibold">Рим3</span>
      </RouterLink>
      <nav class="hidden items-center gap-1 lg:flex" aria-label="Основная навигация">
        <RouterLink
          v-for="link in links"
          :key="link.to"
          :to="link.to"
          class="rounded-pill px-3 py-2 text-sm font-medium text-text-secondary outline-none hover:bg-surface-raised hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
          active-class="bg-accent text-text-on-accent hover:bg-accent hover:text-text-on-accent"
        >
          {{ link.label }}
        </RouterLink>
      </nav>
      <div class="hidden items-center gap-2 lg:flex">
        <RouterLink
          v-if="!session.isPremium"
          to="/paywall"
          class="rounded-pill bg-accent px-4 py-2 text-sm font-semibold text-text-on-accent outline-none hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
        >
          Premium
        </RouterLink>
        <button
          type="button"
          class="rounded-pill px-4 py-2 text-sm font-medium text-text-secondary outline-none hover:bg-surface-raised hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
          @click="logout"
        >
          Выйти
        </button>
      </div>

      <button
        type="button"
        class="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-pill text-text-primary outline-none transition duration-200 ease-out hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary lg:hidden"
        :aria-expanded="isMenuOpen"
        aria-controls="mobile-nav-menu"
        :aria-label="isMenuOpen ? 'Закрыть меню' : 'Открыть меню'"
        @click="toggleMenu"
      >
        <svg v-if="!isMenuOpen" viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" stroke-linecap="round" />
        </svg>
        <svg v-else viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" stroke-linecap="round" />
        </svg>
      </button>
    </div>

    <Transition name="mobile-menu">
      <div
        v-if="isMenuOpen"
        id="mobile-nav-menu"
        class="absolute inset-x-0 top-full z-40 flex h-screen flex-col overflow-y-auto bg-surface lg:hidden"
      >
        <nav class="flex flex-1 flex-col gap-1 px-3 py-3" aria-label="Основная навигация">
          <RouterLink
            v-for="link in links"
            :key="link.to"
            :to="link.to"
            class="rounded-lg border-l-4 border-transparent px-3.5 py-3 text-sm font-medium text-text-secondary outline-none transition duration-200 ease-out hover:bg-surface-raised hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
            active-class="!border-accent bg-surface-raised font-semibold text-text-primary hover:bg-surface-raised hover:text-text-primary"
          >
            {{ link.label }}
          </RouterLink>
        </nav>
        <div class="flex flex-col gap-2 border-t border-border px-4 pt-4 pb-8">
          <RouterLink
            v-if="!session.isPremium"
            to="/paywall"
            class="rounded-pill bg-accent px-4 py-2.5 text-center text-sm font-semibold text-text-on-accent outline-none hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
          >
            Premium
          </RouterLink>
          <button
            type="button"
            class="rounded-pill px-4 py-2.5 text-sm font-medium text-text-secondary outline-none transition duration-200 ease-out hover:bg-surface-raised hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
            @click="logout"
          >
            Выйти
          </button>
        </div>
      </div>
    </Transition>
  </header>
</template>

<style scoped>
.mobile-menu-enter-active,
.mobile-menu-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}
.mobile-menu-enter-from,
.mobile-menu-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
