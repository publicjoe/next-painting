import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  // Tests run in node by default; hook tests opt in to jsdom with a
  // `// @vitest-environment jsdom` docblock.
  test: { environment: 'node', setupFiles: ['./vitest.setup.ts'], exclude: ['e2e/**', 'node_modules/**'] },
});
