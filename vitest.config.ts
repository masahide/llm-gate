import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    tsconfig: "./tsconfig.test.json",
    coverage: {
      provider: "v8",
      reporter: ["text"],
    },
  },
});
