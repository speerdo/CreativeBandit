import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // *.manual.test.ts hits the live internet; run it with
    // vitest.manual.config.ts, never as part of the normal suite.
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'src/**/*.manual.test.ts'],
  },
});
