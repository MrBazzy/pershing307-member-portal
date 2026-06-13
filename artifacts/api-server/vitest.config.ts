import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Workspace packages (`@workspace/*`) export raw `.ts` source via their
    // package.json `exports`, so they must be transformed by Vitest rather than
    // externalized and loaded by native Node (which cannot run `.ts`).
    server: {
      deps: {
        inline: [/^@workspace\//],
      },
    },
    // Fixtures share a single Postgres database, so run test files serially to
    // avoid cross-file interference.
    fileParallelism: false,
    hookTimeout: 30000,
    testTimeout: 30000,
  },
});
