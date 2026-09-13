/**
 * Vitest config for the plugin's own unit tests.
 *
 * Declared explicitly so the suite is deterministic: without it, running the
 * tests from inside a larger checkout picks up an ancestor workspace config
 * and silently finds no test files.
 */
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
