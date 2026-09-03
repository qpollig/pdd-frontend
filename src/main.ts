import { createPinia } from 'pinia'
import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { router } from './router'

createApp(App).use(createPinia()).use(router).mount('#app')

/**
 * Test-only in-app navigation. Pinia session is in-memory (ТЗ §2.2), so e2e cannot
 * page.goto('/checkout') after login. Not a production API.
 */
if (import.meta.env.DEV) {
  (window as Window & { __AV_TEST_PUSH__?: (name: string) => Promise<unknown> }).__AV_TEST_PUSH__ = (
    name: string,
  ) => router.push({ name })
}
