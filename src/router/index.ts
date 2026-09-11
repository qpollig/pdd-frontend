import { createRouter, createWebHistory } from 'vue-router';
import { useSessionStore } from '../stores/sessionStore';

/**
 * Frontend decision (ТЗ §4.8.3 ЧПУ + маршруты этапа B2C shell):
 * /dashboard, /tickets, /tickets/:ticketId, /tickets/topic/:topicId, /tickets/errors,
 * /tickets/favorites, /exam-gibdd, /statistics, /profile, /paywall, /checkout, /auth
 */
export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/auth',
      name: 'auth',
      component: () => import('../screens/AuthScreen.vue'),
      meta: { title: 'Вход' },
    },
    {
      path: '/auth/callback/:provider',
      name: 'oauth-callback',
      component: () => import('../screens/OAuthCallbackScreen.vue'),
      meta: { title: 'Вход' },
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('../screens/RegisterScreen.vue'),
      meta: { title: 'Регистрация' },
    },
    {
      path: '/forgot-password',
      name: 'forgot-password',
      component: () => import('../screens/ForgotPasswordScreen.vue'),
      meta: { title: 'Восстановление пароля' },
    },
    {
      path: '/reset-password',
      name: 'reset-password',
      component: () => import('../screens/ResetPasswordScreen.vue'),
      meta: { title: 'Новый пароль' },
    },
    {
      path: '/tickets/errors',
      name: 'errors-session',
      component: () => import('../screens/TicketSessionScreen.vue'),
      meta: { title: 'Ошибки ПДД 2026 - Проработка неверных ответов' },
    },
    {
      path: '/tickets/favorites',
      name: 'favorites-session',
      component: () => import('../screens/TicketSessionScreen.vue'),
      meta: { title: 'Избранное ПДД 2026 - Проработка отмеченных вопросов' },
    },
    {
      path: '/exam-gibdd',
      name: 'exam-gibdd',
      component: () => import('../screens/TicketSessionScreen.vue'),
      meta: { title: 'Экзамен ГИБДД' },
    },
    {
      path: '/tickets/topic/:topicId',
      name: 'topic-session',
      component: () => import('../screens/TicketSessionScreen.vue'),
      meta: { title: 'Тема ПДД 2026 - Онлайн-тренажер экзамена ГИБДД' },
    },
    {
      path: '/tickets/:ticketId',
      name: 'ticket-session',
      component: () => import('../screens/TicketSessionScreen.vue'),
      meta: { title: 'Билет ПДД 2026 - Онлайн-тренажер экзамена ГИБДД' },
    },
    {
      path: '/',
      component: () => import('../layouts/AppLayout.vue'),
      children: [
        { path: '', redirect: { name: 'dashboard' } },
        {
          path: 'dashboard',
          name: 'dashboard',
          component: () => import('../screens/DashboardScreen.vue'),
          meta: {
            title:
              'Билеты ПДД 2026 онлайн — Подготовка к экзамену ГИБДД с 3D-видео | Онлайн-автошкола',
          },
        },
        {
          path: 'tickets',
          name: 'tickets',
          component: () => import('../screens/TopicListScreen.vue'),
          meta: { title: 'Официальные билеты ПДД 2026 онлайн - Решать по темам и номерам' },
        },
        {
          path: 'statistics',
          name: 'statistics',
          component: () => import('../screens/StatisticsScreen.vue'),
          meta: { title: 'Статистика' },
        },
        {
          path: 'profile',
          name: 'profile',
          component: () => import('../screens/ProfileScreen.vue'),
          meta: { title: 'Профиль' },
        },
        {
          path: 'paywall',
          name: 'paywall',
          component: () => import('../screens/PaywallScreen.vue'),
          meta: { title: 'Premium' },
        },
        {
          path: 'checkout',
          name: 'checkout',
          component: () => import('../screens/CheckoutScreen.vue'),
          meta: { title: 'Оформление подписки' },
        },
      ],
    },
  ],
  scrollBehavior() {
    return { top: 0 };
  },
});

/**
 * Экраны входа/регистрации/сброса пароля — доступны только неавторизованным (тот же принцип, что
 * уже действовал для 'auth'/'oauth-callback'). reset-password тоже сюда: залогиненному пользователю
 * менять пароль через "забыли пароль" незачем — для этого есть привязка/смена в ЛК.
 */
const GUEST_ONLY_ROUTE_NAMES = new Set([
  'auth',
  'oauth-callback',
  'register',
  'forgot-password',
  'reset-password',
]);

router.beforeEach(async (to) => {
  const session = useSessionStore();
  // D1: restores accessToken from the one-shot checkout-redirect bridge (see sessionStore) before
  // any auth decision below — a no-op for every ordinary navigation, since it only does work when
  // there is no live session yet AND a bridge entry is actually present.
  await session.hydrateFromCheckoutBridge();
  if (typeof to.name === 'string' && GUEST_ONLY_ROUTE_NAMES.has(to.name)) {
    if (session.isAuthenticated) {
      return { name: 'dashboard' };
    }
    return true;
  }
  if (!session.isAuthenticated) {
    return { name: 'auth' };
  }
  return true;
});

router.afterEach((to) => {
  const title = typeof to.meta.title === 'string' ? to.meta.title : 'Билеты ПДД';
  document.title = title;
});
