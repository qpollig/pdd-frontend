import { createPinia } from 'pinia'
import { createApp } from 'vue'
import { MotionPlugin } from '@vueuse/motion'
import '@fontsource-variable/inter'
import './style.css'
import App from './App.vue'
import { router } from './router'
import { apiClient } from './api/client'

createApp(App).use(createPinia()).use(router).use(MotionPlugin).mount('#app')

/**
 * Test-only in-app navigation. Pinia session is in-memory (ТЗ §2.2), so e2e cannot
 * page.goto('/checkout') after login. Not a production API.
 */
if (import.meta.env.DEV) {
  (window as Window & {
    __AV_TEST_PUSH__?: (name: string, query?: Record<string, string>) => Promise<unknown>;
  }).__AV_TEST_PUSH__ = (name: string, query?: Record<string, string>) => router.push({ name, query })

  /**
   * D1 test-only hook: arms MockApiClient's checkout activation timer in-process, without the
   * real window.location.href redirect (and the full-page reload that goes with it) — lets e2e
   * exercise the return/polling flow's real timing deterministically. See e2e/checkout-return.spec.ts.
   */
  ;(window as Window & { __AV_TEST_CHECKOUT_INIT__?: () => Promise<unknown> }).__AV_TEST_CHECKOUT_INIT__ =
    () => apiClient.checkout()
}
