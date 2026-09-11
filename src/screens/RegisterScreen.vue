<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppButton from '../components/ui/AppButton.vue';
import logo from '../assets/logo.png';
import {
  isValidEmailFormat,
  isValidPasswordLength,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../domain/auth';
import { useSessionStore } from '../stores/sessionStore';
import { fadeUp } from '../motion/variants';

const router = useRouter();
const session = useSessionStore();

const name = ref('');
const email = ref('');
const password = ref('');

/**
 * Локальная валидация «тронуто ли поле» — чтобы не показывать ошибку формата/длины на ещё пустой
 * форме сразу при заходе, только после первой попытки отправки или после того, как поле оставили.
 */
const submitted = ref(false);

const emailFormatValid = computed(() => isValidEmailFormat(email.value.trim()));
const passwordLengthValid = computed(() => isValidPasswordLength(password.value));

const emailError = computed(() => {
  if (!submitted.value || emailFormatValid.value) return null;
  return 'Введите email в формате имя@домен.';
});
const passwordError = computed(() => {
  if (!submitted.value || passwordLengthValid.value) return null;
  return `Пароль должен быть от ${PASSWORD_MIN_LENGTH} до ${PASSWORD_MAX_LENGTH} символов.`;
});

const isEmailAlreadyRegistered = computed(() => session.authErrorCode === 'EMAIL_ALREADY_REGISTERED');

async function onSubmit() {
  submitted.value = true;
  if (!emailFormatValid.value || !passwordLengthValid.value) {
    return;
  }
  const ok = await session.registerWithPassword(email.value.trim(), password.value, name.value.trim());
  if (ok) {
    await router.replace({ name: 'dashboard' });
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
          <h1 class="mt-5 text-2xl font-bold tracking-tight">Регистрация</h1>
          <p class="mt-2 max-w-[22rem] text-sm text-text-secondary">
            Создайте аккаунт по email и паролю — вход произойдёт сразу после регистрации.
          </p>
        </div>

        <form class="mt-6 space-y-3" data-testid="register-form" @submit.prevent="onSubmit">
          <div>
            <label class="block text-xs text-text-secondary" for="register-name">Имя</label>
            <input
              id="register-name"
              v-model="name"
              type="text"
              required
              autocomplete="name"
              class="mt-1 w-full rounded-card border border-border bg-surface-raised px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
          <div>
            <label class="block text-xs text-text-secondary" for="register-email">Email</label>
            <input
              id="register-email"
              v-model="email"
              type="email"
              required
              autocomplete="email"
              class="mt-1 w-full rounded-card border border-border bg-surface-raised px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <p v-if="emailError" class="mt-1 text-xs text-incorrect" data-testid="register-email-error">
              {{ emailError }}
            </p>
          </div>
          <div>
            <label class="block text-xs text-text-secondary" for="register-password">Пароль</label>
            <input
              id="register-password"
              v-model="password"
              type="password"
              required
              autocomplete="new-password"
              class="mt-1 w-full rounded-card border border-border bg-surface-raised px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <p v-if="passwordError" class="mt-1 text-xs text-incorrect" data-testid="register-password-error">
              {{ passwordError }}
            </p>
            <p v-else class="mt-1 text-xs text-text-secondary">
              От {{ PASSWORD_MIN_LENGTH }} до {{ PASSWORD_MAX_LENGTH }} символов.
            </p>
          </div>

          <div
            v-if="session.authError"
            class="rounded-card border border-incorrect/30 bg-incorrect/10 p-3 text-sm text-incorrect"
            role="alert"
            data-testid="register-error"
          >
            <p>{{ session.authError }}</p>
            <RouterLink
              v-if="isEmailAlreadyRegistered"
              :to="{ name: 'auth' }"
              class="mt-1 inline-block underline hover:text-text-primary"
            >
              Войти
            </RouterLink>
          </div>

          <AppButton
            type="submit"
            class="w-full"
            :disabled="session.authLoading"
            data-testid="register-submit"
          >
            {{ session.authLoading ? 'Регистрируем…' : 'Зарегистрироваться' }}
          </AppButton>
        </form>

        <p class="mt-4 text-center text-sm text-text-secondary">
          Уже есть аккаунт?
          <RouterLink :to="{ name: 'auth' }" class="text-accent underline hover:text-text-primary">
            Войти
          </RouterLink>
        </p>
      </div>
    </div>
  </div>
</template>
