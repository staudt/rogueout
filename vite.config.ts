import { defineConfig } from 'vitest/config';

// Relative base so the built site works both from a plain local static
// server and from a GitHub Pages project subpath (https://user.github.io/repo/)
// without needing to hardcode the repo name here.
export default defineConfig({
  base: './',
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
});
