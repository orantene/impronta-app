import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// ─── Phase 0 — Lint ratchet (remediation-plan-2026-05-19 §4) ──────────
//
// Local plugin holding the four ratchet rules. They are intentionally
// *count-based*: every offending site is one report, so ESLint 9's
// native bulk-suppressions (`--suppressions-location eslint-suppressions
// .json`, the pattern already in `npm run lint`) grandfathers the exact
// current debt and only NEW occurrences (count above the recorded
// baseline / a file not in the baseline) surface. Re-baseline after a
// real reduction with `--prune-suppressions`. This file + eslint-
// suppressions.json are single-owner per the plan §5 — do not hand-edit
// the suppressions JSON; regenerate it with `eslint --suppress-rule`.
const ratchetPlugin = {
  meta: { name: "ratchet", version: "0.0.0" },
  rules: {
    // (Rule 1 — file-size budget — is core `max-lines` @ 800 = error;
    // no custom rule needed. The plan also asks for a *warn* on edits to
    // files already > 1500 LOC. That is deliberately NOT a separate rule:
    // ESLint 9 native bulk-suppressions — the mandated existing pattern
    // (`--suppressions-location`) — suppress severity:error only, NOT
    // warnings, so a warn rule could not be grandfathered and would add
    // ~35 permanent warnings (breaks the before==after invariant). A
    // parallel hand-kept size baseline would violate plan §5 (eslint-
    // suppressions.json is single-source, regenerate-only). Any file
    // > 1500 LOC is already > 800 LOC, so the hard cap already blocks
    // every new god-file; Phase 1 decomposition + `--prune-suppressions`
    // re-baselines the grandfathered set as the god-files shrink.)

    // Rule 2 — freeze NEW inline style={{…}} under components/admin/shell.
    // The ~8.8k existing are grandfathered; Phase 3's token codemod owns
    // paying that tail down. One report per attribute → native count
    // baseline ratchets per file.
    "no-new-inline-style": {
      meta: {
        type: "problem",
        schema: [],
        messages: {
          inline:
            "New inline style={{…}} is frozen under components/admin/shell (Phase 3 design-token codemod owns the existing tail). Use a CSS class / a var(--token-*) from token-presets.css instead.",
        },
      },
      create(context) {
        return {
          JSXAttribute(node) {
            if (
              node.name &&
              node.name.name === "style" &&
              node.value &&
              node.value.type === "JSXExpressionContainer" &&
              node.value.expression &&
              node.value.expression.type === "ObjectExpression"
            ) {
              // Allow style objects whose every key is a CSS custom property
              // (string literal starting with "--"). These are the legitimate
              // dynamic-value channel (e.g. style={{ '--w': `${pct}%` }} +
              // className="w-[var(--w)]"). Plain property values must go through
              // Tailwind utilities or token classes instead.
              const props = node.value.expression.properties;
              const allCssVars =
                props.length > 0 &&
                props.every(
                  (p) =>
                    !p.computed &&
                    p.key &&
                    ((p.key.type === "Literal" &&
                      typeof p.key.value === "string" &&
                      p.key.value.startsWith("--")) ||
                      (p.key.type === "Identifier" &&
                        p.key.name.startsWith("--")))
                );
              if (!allCssVars) {
                context.report({ node, messageId: "inline" });
              }
            }
          },
        };
      },
    },

    // Rule 3 — freeze NEW react-hooks/exhaustive-deps eslint-disable
    // suppressions. Existing ones are tracked (grandfathered); no new
    // ones. Fix the dependency array instead of silencing it.
    "no-new-hook-deps-disable": {
      meta: {
        type: "problem",
        schema: [],
        messages: {
          frozen:
            "New eslint-disable for react-hooks/exhaustive-deps is frozen. Fix the dependency array (or extract a stable callback / useEvent) instead of suppressing the rule.",
        },
      },
      create(context) {
        const sc = context.sourceCode || context.getSourceCode();
        return {
          Program() {
            for (const c of sc.getAllComments()) {
              const t = c.value;
              if (
                /eslint-disable(-next-line|-line)?\b/.test(t) &&
                /react-hooks\/exhaustive-deps/.test(t)
              ) {
                context.report({ loc: c.loc, messageId: "frozen" });
              }
            }
          },
        };
      },
    },

    // Rule 4 — tenant-scope guard (lint half; the tenantScopedQuery
    // helper is owned by the lib/supabase workstream). Flags raw
    // `.from("<table>")` string-literal calls in server actions. The
    // ~540 existing call sites are grandfathered; new ones must route
    // through tenantScopedQuery so the tenant filter can't be forgotten.
    // JS built-ins (Array/Buffer/Object.from …) are excluded.
    "no-untenanted-from": {
      meta: {
        type: "problem",
        schema: [],
        messages: {
          raw: 'Raw .from("{{table}}") in a server action bypasses the tenant filter. Route through tenantScopedQuery(...) so tenant scoping can\'t be forgotten. Legacy call sites are grandfathered in eslint-suppressions.json; new ones must use the helper.',
        },
      },
      create(context) {
        const BUILTIN =
          /^(Array|Buffer|Object|String|Int8Array|Uint8Array|Uint8ClampedArray|Int16Array|Uint16Array|Int32Array|Uint32Array|Float32Array|Float64Array|BigInt64Array|BigUint64Array|Map|Set)$/;
        return {
          CallExpression(node) {
            const cal = node.callee;
            if (
              !cal ||
              cal.type !== "MemberExpression" ||
              cal.computed ||
              !cal.property ||
              cal.property.name !== "from"
            ) {
              return;
            }
            if (
              cal.object &&
              cal.object.type === "Identifier" &&
              BUILTIN.test(cal.object.name)
            ) {
              return;
            }
            const a = node.arguments[0];
            let table = null;
            if (a) {
              if (a.type === "Literal" && typeof a.value === "string") {
                table = a.value;
              } else if (
                a.type === "TemplateLiteral" &&
                a.expressions.length === 0 &&
                a.quasis.length === 1
              ) {
                table = a.quasis[0].value.cooked;
              }
            }
            if (table != null) {
              context.report({
                node,
                messageId: "raw",
                data: { table },
              });
            }
          },
        };
      },
    },
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Hydration patterns (localStorage / client-only UI) use effects; disabling until refactors.
      "react-hooks/set-state-in-effect": "off",
      // Hardening — underscore-prefixed vars are intentional placeholders
      // (e.g. unused FormData state in useFormState signatures, _id in
      // mock callbacks). Treat them as explicit "I know this is unused".
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
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
  // ─── ROADMAP §WS-0.12 + WS-0.13 — admin-shell prototype guards ─────
  //
  // Both shipped as `warn` initially so the existing 50k+ LOC of
  // prototype code doesn't break the build. Once the WS-16 polish
  // sweep migrates prototype usages to design tokens / i18n keys,
  // upgrade severities to `error` to prevent regressions.
  //
  // Scope: only `_state.tsx` (where COLORS are defined) is exempt
  // from the hex rule; everything else in admin-shell must use the
  // semantic tokens.
  {
    files: ["src/app/prototypes/admin-shell/**/*.{ts,tsx}"],
    ignores: [
      "src/app/prototypes/admin-shell/_state.tsx",
      "src/app/prototypes/admin-shell/tokens.json",
    ],
    rules: {
      // WS-0.12 — no inline hex colors outside COLORS const.
      // Forces designers/eng to add colors to `_state.tsx` so the
      // semantic system stays in one place and exports cleanly to
      // tokens.json. Catches `"#1234ab"`, `"#fff"` literals.
      "no-restricted-syntax": [
        "warn",
        {
          selector: "Literal[value=/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/]",
          message:
            "WS-0.12 — Inline hex color forbidden outside `_state.tsx`. Add to COLORS and import the semantic token.",
        },
        {
          selector: "TemplateElement[value.raw=/#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?\\b/]",
          message:
            "WS-0.12 — Inline hex color in template literal forbidden outside `_state.tsx`. Add to COLORS.",
        },
      ],

      // WS-0.13 — no string literals in JSX (i18n prep).
      // PLACEHOLDER: enabling `react/jsx-no-literals` here generates
      // ~thousands of warnings against the current prototype. Land
      // with WS-12 (i18n scaffolding) once `next-intl` is wired and
      // strings can migrate to keys without breaking dev velocity.
      // When ready, replace this comment with:
      //   "react/jsx-no-literals": ["warn", { allowedStrings: ["·", "—", "↗", "?"] }]
    },
  },

  // A.6 — Supabase .maybeSingle() / .single() must be destructured with
  // both `data` AND `error`, so the call site is forced to handle the
  // null-or-error case instead of trusting a bare `data`. Bare destructures
  // shipped real bugs (talent inbox empty when the row was actually missing,
  // not "no error"). Warns (not errors) to allow incremental adoption.
  //
  // Pattern caught:
  //   const { data } = await x.maybeSingle();         ← FLAG
  //   const { data, error } = await x.maybeSingle();   ← OK
  //   const result = await x.maybeSingle();            ← OK (caller branches on result)
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/**/*.test.{ts,tsx}", "src/**/__tests__/**"],
    rules: {
      "no-restricted-syntax": [
        "warn",
        {
          selector:
            "VariableDeclarator[init.type='AwaitExpression'][init.argument.type='CallExpression'][init.argument.callee.type='MemberExpression'][init.argument.callee.property.name=/^(maybeSingle|single)$/] > ObjectPattern.id:not(:has(Property[key.name='error']))",
          message:
            "A.6 — destructure `error` alongside `data` from .maybeSingle()/.single(), or branch on the full result. Bare { data } silently swallows missing-row / RLS errors.",
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
  // ─── Phase 0 ratchet — rule wiring (single-owner, plan §4/§5) ──────
  //
  // Custom rule ids (never collide with the existing no-restricted-*
  // blocks, so no flat-config "last-write-wins" override risk). All
  // current debt is grandfathered in eslint-suppressions.json via
  // ESLint's native bulk-suppressions; regenerate after rule/scope
  // changes with, from web/:
  //   node -r ./scripts/eslint-node-polyfill.cjs \
  //     ./node_modules/eslint/bin/eslint.js . \
  //     --suppressions-location eslint-suppressions.json \
  //     --suppress-rule max-lines \
  //     --suppress-rule ratchet/no-new-inline-style \
  //     --suppress-rule ratchet/no-new-hook-deps-disable \
  //     --suppress-rule ratchet/no-untenanted-from
  {
    files: ["src/**/*.{ts,tsx,js,jsx,mjs}"],
    rules: {
      // Rule 1 — file-size budget: NEW files > 800 LOC error. All ~87
      // current files > 800 are grandfathered (count 1 each) in
      // eslint-suppressions.json.
      "max-lines": [
        "error",
        { max: 800, skipBlankLines: false, skipComments: false },
      ],
    },
  },
  {
    files: ["src/components/admin/shell/**/*.{ts,tsx}"],
    plugins: { ratchet: ratchetPlugin },
    rules: {
      // Rule 2 — no NEW inline style={{…}} in the admin shell.
      "ratchet/no-new-inline-style": "error",
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { ratchet: ratchetPlugin },
    rules: {
      // Rule 3 — no NEW react-hooks/exhaustive-deps eslint-disable.
      "ratchet/no-new-hook-deps-disable": "error",
    },
  },
  {
    files: ["src/lib/server-actions/**/*.{ts,tsx}"],
    plugins: { ratchet: ratchetPlugin },
    rules: {
      // Rule 4 — tenant-scope guard (lint half).
      "ratchet/no-untenanted-from": "error",
    },
  },
  // Q3 — Structured logger enforcement.
  // All console.* call sites have been migrated to improntaLog / logServerError
  // (q3/structured-logger). This rule prevents regressions. The two logger
  // modules themselves carry inline eslint-disable-next-line comments.
  // Do NOT regenerate eslint-suppressions.json locally — the integrator handles
  // it on the combined tree at landing.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/**/*.test.{ts,tsx}",
      "src/**/*.spec.{ts,tsx}",
      "src/**/__tests__/**",
    ],
    rules: {
      "no-console": "error",
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
    // T2b Phase A — auto-generated Supabase types (~12k LOC). Ignored so
    // it does not need a `max-lines` suppression and does not contribute
    // to the suppressions baseline. Regenerate via the command documented
    // in the file's header. See web/src/lib/supabase/database.types.ts.
    "src/lib/supabase/database.types.ts",
  ]),
]);

export default eslintConfig;
