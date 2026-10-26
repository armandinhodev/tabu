import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  // Next usa el runtime automático de JSX; Vitest debe compilar igual.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/domain/**/*.ts"],
      exclude: [
        "src/domain/**/*.{test,spec}.ts",
        "src/domain/__fixtures__/**",
        "src/domain/**/index.ts",
      ],
      thresholds: {
        branches: 80,
      },
    },
  },
});
