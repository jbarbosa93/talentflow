import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Tests = logique métier PURE uniquement (matching, classification, merge, pointage).
// environment 'node' : aucune dépendance DOM/React (pas de jsdom).
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
  test: {
    environment: 'node',
    include: ['lib/**/__tests__/**/*.test.ts'],
  },
})
