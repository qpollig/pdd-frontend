import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { router } from '../router';
import { useSessionStore } from '../stores/sessionStore';

describe('B2C routes', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('registers Phase 1 shell paths', () => {
    const names = router.getRoutes().map((route) => route.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'auth',
        'dashboard',
        'tickets',
        'ticket-session',
        'errors-session',
        'exam-gibdd',
        'statistics',
        'profile',
        'paywall',
        'checkout',
      ]),
    );
  });

  it('sends anonymous users to auth instead of dashboard', async () => {
    await router.push('/dashboard');
    expect(router.currentRoute.value.name).toBe('auth');
  });

  it('keeps ticket-session as the single player route', async () => {
    const session = useSessionStore();
    await session.loginWithProvider('yandex');
    await router.push({ name: 'ticket-session', params: { ticketId: 'ticket-1' }, query: { mode: 'theory' } });
    expect(router.currentRoute.value.name).toBe('ticket-session');
    expect(router.currentRoute.value.query.mode).toBe('theory');
  });

  it('opens Errors on a dedicated path that still uses TicketSessionScreen', async () => {
    const session = useSessionStore();
    await session.loginWithProvider('yandex');
    await router.push({ name: 'errors-session', query: { mode: 'errors' } });
    expect(router.currentRoute.value.name).toBe('errors-session');
    expect(router.currentRoute.value.path).toBe('/tickets/errors');
    expect(router.currentRoute.value.query.mode).toBe('errors');
  });

  it('opens Exam on a dedicated path that still uses TicketSessionScreen', async () => {
    const session = useSessionStore();
    await session.loginWithProvider('yandex');
    await router.push({ name: 'exam-gibdd' });
    expect(router.currentRoute.value.name).toBe('exam-gibdd');
    expect(router.currentRoute.value.path).toBe('/exam-gibdd');
  });

  it('keeps authenticated users on dashboard', async () => {
    const session = useSessionStore();
    await session.loginWithProvider('yandex');
    await router.push('/dashboard');
    expect(router.currentRoute.value.name).toBe('dashboard');
  });

  it('sends authenticated users from auth to dashboard', async () => {
    const session = useSessionStore();
    await session.loginWithProvider('vk');
    await router.push('/auth');
    expect(router.currentRoute.value.name).toBe('dashboard');
  });

  it('returns to auth after logout', async () => {
    const session = useSessionStore();
    await session.loginWithProvider('yandex');
    await router.push('/dashboard');
    session.logout();
    await router.push('/tickets');
    expect(router.currentRoute.value.name).toBe('auth');
  });

  it('sends anonymous users from checkout to auth', async () => {
    await router.push('/checkout');
    expect(router.currentRoute.value.name).toBe('auth');
  });
});

