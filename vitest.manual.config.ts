import { defineConfig } from 'vitest/config';

/*
 * Opt-in config for the phase 5 validation sweep, which hits real
 * third-party sites over the network. The default suite must stay
 * hermetic and fast, so these files are excluded from it and only run
 * when this config is named explicitly.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.manual.test.ts'],
    testTimeout: 15 * 60 * 1000,
    hookTimeout: 60_000,
  },
});
