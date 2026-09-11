<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppButton from '../components/ui/AppButton.vue';
import logo from '../assets/logo.png';
import {
  isValidPasswordLength,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../domain/auth';
import { useSessionStore } from '../stores/sessionStore';
import { fadeUp } from '../motion/variants';

const route = useRoute();
const router = useRouter();
const session = useSessionStore();

/**
 * `token` читается из query как есть, по аналогии с тем, как OAuthCallbackScreen читает code/state —
 * фронт НЕ пытается его расшифровать/провалидировать, это ответственность backend
 * (400 INVALID_OR_EXPIRED_TOKEN). Здесь только presence-check: пустой/отсутствующий token сразу
 * ведёт по тому же "ошибочному" пути UI, что и мусорный/просроченный (см. ниже) — без отдельного
 * молчаливого редиректа в никуда.
 */
const token = computed(() => {
  const raw = route.query.token;
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
});

const password = ref('');
const passwordConfirm = ref('');
const submitted = ref(false);

const passwordLengthValid = computed(() => isValidPasswordLength(password.value));
const passwordsMatch = computed(() => password.value === passwordConfirm.value);

const passwordError = computed(() => {
  if (!submitted.value || passwordLengthValid.value) return null;
  return `Пароль должен быть от ${PASSWORD_MIN_LENGTH} до ${PASSWORD_MAX_LENGTH} символов.`;
});
const confirmError = computed(() => {
  if (!submitted.value || passwordsMatch.value) return null;
  return 'Пароли не совпадают.';
});

onMounted(() => {
  session.resetPasswordStatusReset();
});

async function onSubmit() {
  submitted.value = true;
  if (!token.value || !passwordLengthValid.value || !passwordsMatch.value) {
    return;
  }
  // Намеренно НЕ авторизуем пользователя автоматически (см. отчёт по задаче) — после успешной
  // смены пароля ведём на экран входа с сообщением об успехе, а не в sessionStore.applySession().
  const ok = await session.resetPasswordWithToken(token.value, password.value);
  if (ok) {
    await router.replace({ name: 'auth', query: { reset: 'success' } });
  }
}
</script>

<template>
  <div
    class="relative flex min-h-screen items-center justify-center overflow-hidden bg-bg px-4 py-10 text-text-primary sm:px-6"
  >
    <div
      class="pointer-events-none absolute inset-0 [background-image:radial-gradient(var(--color-border)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,black,transparent)]"
      aria-hidden="true"
    />
    <div
      class="pointer-events-none absolute left-1/2 top-0 h-72 w-[36rem] -translate-x-1/2 -translate-y-1/3 rounded-full bg-accent/25 blur-3xl"
      aria-hidden="true"
    />

    <div
      v-motion
      :initial="fadeUp().initial"
      :enter="fadeUp().enter"
      class="relative w-full max-w-[26rem]"
    >
      <div class="relative overflow-hidden rounded-card border border-border bg-surface p-8 shadow-2xl shadow-black/[0.06] sm:p-10">
        <div class="absolute inset-x-0 top-0 h-1.5 bg-accent" aria-hidden="true" />

        <div class="flex flex-col items-center text-center">
          <img :src="logo" alt="" class="h-14 w-14 rounded-2xl object-contain ring-1 ring-border" />
          <h1 class="mt-5 text-2xl font-bold tracking-tight">Новый пароль</h1>
        </div>

        <!-- Нет token в URL — тот же "ошибочный" путь, что и невалидный/просроченный (см. ниже). -->
        <div
          v-if="!token"
          class="mt-6 rounded-card border border-incorrect/30 bg-incorrect/5 p-6 text-center"
          role="alert"
          data-testid="reset-no-token"
        >
          <p class="font-semibold">Ссылка для сброса пароля недействительна.</p>
          <p class="mt-2 text-sm text-text-secondary">
            Запросите новую ссылку — старая либо повреждена, либо уже использована.
          </p>
          <RouterLink
            :to="{ name: 'forgot-password' }"
            class="mt-4 inline-block text-sm text-accent underline hover:text-text-primary"
          >
            Запросить сброс пароля заново
          </RouterLink>
        </div>

        <div
          v-else-if="session.resetStatus === 'error'"
          class="mt-6 rounded-card border border-incorrect/30 bg-incorrect/5 p-6 text-center"
          role="alert"
          data-testid="reset-error"
        >
          <p class="font-semibold">{{ session.resetError }}</p>
          <RouterLink
            :to="{ name: 'forgot-password' }"
            class="mt-4 inline-block text-sm text-accent underline hover:text-text-primary"
          >
            Запросить сброс пароля заново
          </RouterLink>
        </div>

        <form v-else class="mt-6 space-y-3" data-testid="reset-form" @submit.prevent="onSubmit">
          <div>
            <label class="block text-xs text-text-secondary" for="reset-password">Новый пароль</label>
            <input
              id="reset-password"
              v-model="password"
              type="password"
              required
              autocomplete="new-password"
              class="mt-1 w-full rounded-card border border-border bg-surface-raised px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <p v-if="passwordError" class="mt-1 text-xs text-incorrect" data-testid="reset-password-error">
              {{ passwordError }}
            </p>
            <p v-else class="mt-1 text-xs text-text-secondary">
              От {{ PASSWORD_MIN_LENGTH }} до {{ PASSWORD_MAX_LENGTH }} символов.
            </p>
          </div>
          <div>
            <label class="block text-xs text-text-secondary" for="reset-password-confirm">
              Повторите пароль
            </label>
            <input
              id="reset-password-confirm"
              v-model="passwordConfirm"
              type="password"
              required
              autocomplete="new-password"
              class="mt-1 w-full rounded-card border border-border bg-surface-raised px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <p v-if="confirmError" class="mt-1 text-xs text-incorrect" data-testid="reset-confirm-error">
              {{ confirmError }}
            </p>
          </div>

          <AppButton
            type="submit"
            class="w-full"
            :disabled="session.resetStatus === 'processing'"
            data-testid="reset-submit"
          >
            {{ session.resetStatus === 'processing' ? 'Сохраняем…' : 'Сменить пароль' }}
          </AppButton>
        </form>
      </div>
    </div>
  </div>
</template>
