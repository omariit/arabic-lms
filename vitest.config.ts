import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    env: { AUTH_SECRET: "test-secret-abcdef0123456789" },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
