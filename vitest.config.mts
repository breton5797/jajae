import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    pool: "forks",
    testTimeout: 30_000,
    hookTimeout: 30_000,
    environmentMatchGlobs: [["tests/components/**", "jsdom"]],
  },
});
