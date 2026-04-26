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
  // Phase C — Lexical plugin allow-list. The convergence-plan §17 scope cap
  // limits Lexical surface area to four packages: lexical, @lexical/react,
  // @lexical/link, @lexical/selection. Adding any other @lexical/* package
  // is a charter amendment, not a drive-by — block at lint time.
  {
    files: ["src/**/*.{ts,tsx,js,jsx,mjs}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "@lexical/code", message: "Phase C scope cap (allow-list: lexical, @lexical/react, @lexical/link, @lexical/selection)." },
            { name: "@lexical/dragon", message: "Phase C scope cap." },
            { name: "@lexical/hashtag", message: "Phase C scope cap." },
            { name: "@lexical/headless", message: "Phase C scope cap." },
            { name: "@lexical/history", message: "Phase C scope cap. Draft autosave + revisions own undo." },
            { name: "@lexical/html", message: "Phase C scope cap. Storage is markers, not HTML." },
            { name: "@lexical/list", message: "Phase C scope cap. No lists in §17." },
            { name: "@lexical/mark", message: "Phase C scope cap." },
            { name: "@lexical/markdown", message: "Phase C scope cap. We have our own marker grammar." },
            { name: "@lexical/offset", message: "Phase C scope cap." },
            { name: "@lexical/overflow", message: "Phase C scope cap." },
            { name: "@lexical/plain-text", message: "Phase C scope cap. Use @lexical/react's PlainTextPlugin re-export." },
            { name: "@lexical/rich-text", message: "Phase C scope cap. We are not rich-text in the Lexical sense." },
            { name: "@lexical/table", message: "Phase C scope cap." },
            { name: "@lexical/text", message: "Phase C scope cap." },
            { name: "@lexical/utils", message: "Phase C scope cap." },
            { name: "@lexical/yjs", message: "Phase C scope cap." },
            { name: "@lexical/clipboard", message: "Phase C scope cap." },
            { name: "@lexical/devtools-core", message: "Phase C scope cap." },
            { name: "@lexical/extension", message: "Phase C scope cap." },
          ],
        },
      ],
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
