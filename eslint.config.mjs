import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { FlatCompat } from "@eslint/eslintrc";

// eslint-config-next 15.x todavía publica configuración en formato legacy
// ("extends"), no como flat config. FlatCompat es la vía oficial para
// consumirla desde ESLint 9.
const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "coverage/**",
      "next-env.d.ts",
      "doc/**",
      "odd/**",
    ],
  },
];

export default eslintConfig;
