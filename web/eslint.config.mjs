import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Hydration patterns (localStorage / client-only UI) use effects; disabling until refactors.
      "react-hooks/set-state-in-effect": "off",
    },
  },
  // Phase 5 — bare `tenant:...` cache tag strings are banned outside the
  // site-admin cache-tags helper. Callers must import `tagFor()`.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/site-admin/cache-tags.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "Literal[value=/^tenant:[0-9a-f-]{36}:/]",
          message:
            "Bare tenant-scoped cache tags are banned. Import and call tagFor(tenantId, surface[, qualifier]) from '@/lib/site-admin/cache-tags'.",
        },
        {
          selector:
            "TemplateElement[value.raw=/^tenant:[0-9a-f-]{36}:/]",
          message:
            "Bare tenant-scoped cache tags (template literals) are banned. Import and call tagFor(tenantId, surface[, qualifier]) from '@/lib/site-admin/cache-tags'.",
        },
        {
          selector:
            "TemplateElement[value.raw=/^tenant:\\$\\{/]",
          message:
            "Do not build cache tags inline with template strings. Use tagFor(...) from '@/lib/site-admin/cache-tags'.",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // CommonJS preload; must use require() before ESM loads
    "scripts/eslint-node-polyfill.cjs",
  ]),
]);

export default eslintConfig;
