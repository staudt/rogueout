import { defineConfig } from 'vitest/config';

// Relative base so the built site works both from a plain local static
// server and from a GitHub Pages project subpath (https://user.github.io/repo/)
// without needing to hardcode the repo name here.
export default defineConfig({
  base: './',
  test: {
    // Node, not jsdom: only three test files touch the DOM, and building a jsdom for the other
    // twenty-four was 87% of the suite's runtime (18.2s -> 6.2s). The three that need one say so
    // themselves with a `// @vitest-environment jsdom` pragma on their first line.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
