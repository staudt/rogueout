import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vitest/config';

const PLAN_PATH = 'src/world/maps/wrigleyville.plan.txt';

/**
 * Lets the map editor save back to the repository during `npm run dev`.
 *
 * Without it the editor could only offer a download to drop over the file by hand, which is the
 * difference between a tool and a toy — you edit a map dozens of times in a sitting. It is a
 * **dev-server route only**: it does not exist in a build, so the published game has no way to
 * write anything, and it refuses any path but the plan it is meant to write.
 */
function planSaver(): Plugin {
  return {
    name: 'plan-saver',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__plan', (req, res) => {
        const file = resolve(process.cwd(), PLAN_PATH);

        if (req.method === 'GET') {
          res.setHeader('Content-Type', 'text/plain');
          res.end(readFileSync(file, 'utf8'));
          return;
        }

        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('Only GET and POST.');
          return;
        }

        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          writeFileSync(file, body, 'utf8');
          res.end(`Saved ${body.length} bytes to ${PLAN_PATH}`);
        });
      });
    },
  };
}

// Relative base so the built site works both from a plain local static
// server and from a GitHub Pages project subpath (https://user.github.io/repo/)
// without needing to hardcode the repo name here.
export default defineConfig({
  base: './',
  plugins: [planSaver()],
  build: {
    rollupOptions: {
      // The editor is a second page rather than a mode of the game: it shares the tile table and
      // the generator, and nothing else, so keeping it separate stops it reaching into the game.
      input: {
        main: resolve(__dirname, 'index.html'),
        editor: resolve(__dirname, 'editor.html'),
      },
    },
  },
  test: {
    // Node, not jsdom: only three test files touch the DOM, and building a jsdom for the other
    // twenty-four was 87% of the suite's runtime (18.2s -> 6.2s). The three that need one say so
    // themselves with a `// @vitest-environment jsdom` pragma on their first line.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
