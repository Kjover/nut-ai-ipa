import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

/**
 * Alias @nutai/* to package SOURCE, not dist. Tests must run without a build step
 * so the unit-test loop stays fast; the node-purity gate separately verifies the
 * BUILT output imports cleanly under bare Node (PLAN.md §4.1).
 */
const pkg = (name: string) =>
  fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@nutai/core-schema': pkg('core-schema'),
      '@nutai/gram-engine': pkg('gram-engine'),
      '@nutai/resolver': pkg('resolver'),
      '@nutai/totals': pkg('totals'),
      '@nutai/confidence': pkg('confidence'),
      '@nutai/repair': pkg('repair'),
      '@nutai/goals': pkg('goals'),
      '@nutai/prompt': pkg('prompt'),
      '@nutai/db-adapter/node': fileURLToPath(new URL('./packages/db-adapter/src/node.ts', import.meta.url)),
      '@nutai/db-adapter': pkg('db-adapter'),
      '@nutai/clamp': pkg('clamp'),
      '@nutai/pipeline': pkg('pipeline'),
    },
  },
  test: {
    include: ['packages/**/*.test.ts', 'eval/**/*.test.ts'],
    environment: 'node',
  },
})
