import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

// Served as a GitHub Pages project site at /pdd-frontend/, not the domain root.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/pdd-frontend/' : '/',
  plugins: [vue(), tailwindcss()],
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.spec.ts'],
  },
}))
