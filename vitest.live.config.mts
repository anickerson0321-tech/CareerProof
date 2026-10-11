import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Opt-in tests against the real AI provider: `npm run test:live`.
// Needs ANTHROPIC_API_KEY. Costs a little money per run.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/support/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/live/**/*.test.ts"],
    testTimeout: 180_000,
    fileParallelism: false,
  },
});
