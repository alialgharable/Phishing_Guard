import { defaultExclude, defineConfig } from "vitest/config";

/**
 * The Phishing_Guard app's own tests, unchanged. The entry is explicit only so that the nested
 * `vintage-magic` Next project - which has its own vitest config, tsconfig and package - is not
 * collected by this run.
 */
export default defineConfig({
  test: {
    exclude: [...defaultExclude, "vintage-magic/**", "backend/**"],
  },
});
