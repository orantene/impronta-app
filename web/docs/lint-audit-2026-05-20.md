# Lint Warnings Audit — 2026-05-20

Baseline run from `lint/warnings-cleanup` against `origin/phase-1`.

- Command: `npm run lint > /tmp/lint-full.txt 2>&1`
- Result: `0 errors`, `954 warnings`
- Auto-fixable (footer): `9 warnings potentially fixable with --fix`

## Per-rule Breakdown

| Rule | Count | Severity | Auto-fixable? | Strategy |
|---|---:|---|---|---|
| `@typescript-eslint/no-unused-vars` | 913 | warning | Mostly no (manual/mechanical) | Mechanical sweep. Delete truly dead declarations; rename intentional unused bindings to `_name` / `_arg`; do not delete exports without usage check. Batch 30–50 fixes/commit. |
| `@typescript-eslint/no-unused-expressions` | 15 | warning | Mostly no | Semantic/mechanical hybrid. Replace expression-only short-circuits with explicit `if`/function calls where intent is side effects; keep behavior unchanged. |
| `react-hooks/exhaustive-deps` | 14 | warning | No (manual) | Engineering triage per case: add real deps for bug fixes, or keep intentional behavior with explicit `eslint-disable-next-line ... -- <reason>` note following Q2 pattern. |
| `unused-eslint-disable-directive` | 9 | warning | Yes (expected primary auto-fix source) | Run targeted `eslint --fix` sweep for unused disable directives; review each diff to ensure no accidental behavior edits. |
| `@next/next/no-img-element` | 2 | warning | No (manual) | Convert internal/content images to `next/image` with explicit dimensions; keep `<img>` only with documented exception rationale. Validate rendered layout. |
| `jsx-a11y/role-has-required-aria-props` | 1 | warning | No (manual) | Accessibility fix with proper ARIA contract (likely `role="option"` + `aria-selected`). Validate keyboard interaction semantics. |

## Top-30 File Hotspots

1. `324` — `/Users/oranpersonal/Desktop/impronta-lint-warnings/web/src/components/admin/shell/internal/drawers/drawer-shared.tsx`
2. `17` — `/Users/oranpersonal/Desktop/impronta-lint-warnings/web/src/components/admin/shell/internal/drawers/profile-shell/TalentProfileShellDrawer.tsx`
3. `14` — `/Users/oranpersonal/Desktop/impronta-lint-warnings/web/src/components/admin/shell/internal/drawers/light-02.tsx`
4. `14` — `/Users/oranpersonal/Desktop/impronta-lint-warnings/web/scripts/verify-phase56-readonly.mjs`
5. `13` — `/Users/oranpersonal/Desktop/impronta-lint-warnings/web/src/components/admin/shell/internal/drawers/light-07.tsx`
6. `12` — `/Users/oranpersonal/Desktop/impronta-lint-warnings/web/src/components/admin/shell/internal/drawers/light-18.tsx`
7. `12` — `/Users/oranpersonal/Desktop/impronta-lint-warnings/web/src/components/admin/shell/internal/drawers/light-15.tsx`
8. `11` — `/Users/oranpersonal/Desktop/impronta-lint-warnings/web/src/components/admin/shell/internal/drawers/light-21.tsx`
9. `11` — `/Users/oranpersonal/Desktop/impronta-lint-warnings/web/src/components/admin/shell/internal/drawers/light-12.tsx`
10. `10` — `/Users/oranpersonal/Desktop/impronta-lint-warnings/web/src/components/admin/shell/internal/messages/talent-2.tsx`
11. `10` — `/Users/oranpersonal/Desktop/impronta-lint-warnings/web/src/components/admin/shell/internal/drawers/light-22.tsx`
12. `10` — `/Users/oranpersonal/Desktop/impronta-lint-warnings/web/src/components/admin/shell/internal/drawers/light-19.tsx`
13. `10` — `/Users/oranpersonal/Desktop/impronta-lint-warnings/web/src/components/admin/shell/internal/drawers/light-17.tsx`
14. `10` — `/Users/oranpersonal/Desktop/impronta-lint-warnings/web/src/components/admin/shell/internal/drawers/light-16.tsx`
15. `10` — `/Users/oranpersonal/Desktop/impronta-lint-warnings/web/src/components/admin/shell/internal/drawers/light-14.tsx`
16. `10` — `/Users/oranpersonal/Desktop/impronta-lint-warnings/web/src/components/admin/shell/internal/drawers/light-10.tsx`
17. `10` — `/Users/oranpersonal/Desktop/impronta-lint-warnings/web/src/components/admin/shell/internal/drawers/light-04.tsx`
18. `10` — `/Users/oranpersonal/Desktop/impronta-lint-warnings/web/src/components/admin/shell/internal/drawers/UpgradeModal.tsx`
19. `10` — `/Users/oranpersonal/Desktop/impronta-lint-warnings/web/src/app/(workspace)/[tenantSlug]/_data-bridge.ts`
20. `9` — `/Users/oranpersonal/Desktop/impronta-lint-warnings/web/src/components/admin/shell/internal/messages/shared/machinery-5.tsx`
21. `9` — `/Users/oranpersonal/Desktop/impronta-lint-warnings/web/src/components/admin/shell/internal/media-page.tsx`
22. `9` — `/Users/oranpersonal/Desktop/impronta-lint-warnings/web/src/components/admin/shell/internal/drawers/light-23.tsx`
23. `9` — `/Users/oranpersonal/Desktop/impronta-lint-warnings/web/src/components/admin/shell/internal/drawers/light-20.tsx`
24. `9` — `/Users/oranpersonal/Desktop/impronta-lint-warnings/web/src/components/admin/shell/internal/drawers/light-06.tsx`
25. `9` — `/Users/oranpersonal/Desktop/impronta-lint-warnings/web/src/components/admin/shell/internal/drawers/light-03.tsx`
26. `9` — `/Users/oranpersonal/Desktop/impronta-lint-warnings/web/src/components/admin/shell/internal/drawers/light-01.tsx`
27. `8` — `/Users/oranpersonal/Desktop/impronta-lint-warnings/web/src/components/admin/shell/internal/platform.tsx`
28. `8` — `/Users/oranpersonal/Desktop/impronta-lint-warnings/web/src/components/admin/shell/internal/page-modules/WorkspaceTopbar.tsx`
29. `8` — `/Users/oranpersonal/Desktop/impronta-lint-warnings/web/src/components/admin/shell/internal/page-modules/OverviewPage.tsx`
30. `8` — `/Users/oranpersonal/Desktop/impronta-lint-warnings/web/src/components/admin/shell/internal/drawers/light-13.tsx`

## Recommendation Sequence

1. Phase B: targeted auto-fix for `unused-eslint-disable-directive` first (low risk, 9 warnings).
2. Primary burn-down: `@typescript-eslint/no-unused-vars` in area batches, starting with `drawer-shared.tsx` and `light-*` files.
3. Semantic pass: `react-hooks/exhaustive-deps` and `no-unused-expressions` with explicit intent annotations where needed.
4. UX/a11y finish: `no-img-element` and `jsx-a11y/*` with render/accessibility verification.
