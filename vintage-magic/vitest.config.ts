import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Unit tests for the shop's logic. They run in plain node with no browser, no network and no cloud
 * credentials: the money, stock, cart, quote, query and authorisation rules are all pure functions or
 * exercise the file-backed repository against a temporary database.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.join(path.dirname(fileURLToPath(import.meta.url)), "src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
  },
});
