<script setup lang="ts">
import { onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppSpinner from '../components/ui/AppSpinner.vue';
import type { OAuthProvider } from '../api/types';
import { useSessionStore } from '../stores/sessionStore';

const route = useRoute();
const router = useRouter();
const session = useSessionStore();

function isOAuthProvider(value: unknown): value is OAuthProvider {
  return value === 'yandex' || value === 'vk';
}

function queryString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

onMounted(async () => {
  const provider = route.params.provider;
  if (!isOAuthProvider(provider)) {
    await router.replace({ name: 'auth' });
    return;
  }

  // Тот же callback обрабатывает и обычный вход, и привязку к уже залогиненному аккаунту —
  // completeOAuthCallback различает их по purpose в one-shot state-бридже.
  const result = await session.completeOAuthCallback(provider, {
    code: queryString(route.query.code),
    state: queryString(route.query.state),
    providerError: queryString(route.query.error),
  });

  if (result.purpose === 'link') {
    // Исход привязки уезжает в ЛК через query — ProfileScreen покажет баннер и вычистит параметр.
    await router.replace({
      name: 'profile',
      query: { link: result.ok ? 'ok' : (result.errorCode ?? 'error') },
    });
    return;
  }

  await router.replace(result.ok ? { name: 'dashboard' } : { name: 'auth' });
});
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-bg text-text-primary">
    <AppSpinner label="Завершаем вход" />
  </div>
</template>
