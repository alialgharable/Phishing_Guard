import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Same flat-config shape the parent repo uses for Next 16, widened for this app:
 * product photographs are plain `<img>` because the images are the shop's own static files (or an
 * absolute bucket URL), and `images.unoptimized` is on so no local image pipeline is required.
 */
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "node_modules/**", "data/**", "public/**", "coverage/**"]),
  {
    rules: {
      "@next/next/no-img-element": "off",
    },
  },
]);

export default eslintConfig;
