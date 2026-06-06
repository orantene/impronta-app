# Legacy / dead-code map — builder area

**Audit date:** 2026-06-05
**Code base:** `impronta-builder-marathon` (origin/main)
**Methodology:** every entry was verified by grepping all `*.ts`/`*.tsx` under `web/src/` for imports of the symbol/file before being classified. "No callers" means the grep returned only the defining file (or the barrel `index.ts`).

---

## Summary counts

| Verdict | Count |
|---|---|
| DELETE (verified dead) | 5 |
| MIGRATE / FINISH (half-done) | 6 |
| KEEP (live code, cited for completeness) | 10 |

---

## DELETE — verified dead or unreachable

### 1. `PagesComposerList.tsx`
**File:** `web/src/components/edit-chrome/PagesComposerList.tsx`

Phase 7 (M-19) list view for "non-homepage pages". The file exports `PagesComposerList` but zero files import it — not `page-settings-drawer.tsx`, not `edit-shell.tsx`, nothing. The page-settings drawer's Templates tab was rebuilt without it.

**Verdict: DELETE.** No import path. Dead export.

---

### 2. Server-canvas fallback branch inside `homepage-cms-sections.tsx`
**File:** `web/src/components/home/homepage-cms-sections.tsx`, lines 317-332

The comment says "DEFAULT (flag off) — server-rendered canvas, byte-identical to today." The CLAUDE.md / MEMORY.md confirms `NEXT_PUBLIC_BUILDER_CLIENT_CANVAS` is ON in production. The flag is a `NEXT_PUBLIC_*` env var inlined at **build time** (`client-canvas-flag.ts` lines 15-18): if Vercel builds with the flag set, the dead branch never executes in that binary. It's not harmful but it bloats the deploy payload and the mental model.

**Verdict: MIGRATE.** Once the canvas flag is declared permanently ON (env var removed + `isBuilderClientCanvasEnabled()` replaced with a constant `true`), this fallback can be deleted. See §6 below for the two-step.

---

### 3. `MeshGradientGenerator` — `onApply` prop never wired
**File:** `web/src/components/edit-chrome/MeshGradientGenerator.tsx`, lines 41-44; `web/src/components/edit-chrome/theme-drawer.tsx`, line 1304

`MeshGradientGenerator` accepts an optional `onApply?: (css: string) => void`. The Theme Drawer mounts it as `<MeshGradientGenerator />` with no `onApply`. The component renders a CSS output textarea and a "Copy" button, but the "Apply to background" button (which only renders when `onApply` is set) is permanently hidden. The generator runs as a copy-paste-only utility — the integration back to the theme engine was never completed.

**Verdict: MIGRATE.** Either wire `onApply` to a theme token mutation (the doc comment references `--token-color-background-mesh`) or delete the `onApply` prop and document it as copy-paste only. The component itself is used (it renders the generator UI), but the half-integration is dead code in the interface.

---

### 4. `site-shell-flag.ts` / `PublishedShell.tsx` — gate is permanently OFF
**Files:** `web/src/lib/site-admin/site-shell-flag.ts`; `web/src/components/site-shell/PublishedShell.tsx`

`ENABLE_SITE_SHELL` defaults to `"off"`. The `.env.example` and `vercel.json` have no entry for it. According to the project docs (`builder-convergence-plan.md` line 549), B.2.A "flipped the env flag" to `tenants` + added Impronta to the allow-list — but that step is listed as requiring a Vercel prod env var set by the owner. No evidence it was set. `readSiteShellMode()` therefore returns `"off"` in every production build; `isSiteShellEnabledForTenant()` is always `false`; `PublishedShell` never renders. Both `shouldRenderSnapshotShell` and `buildPublishedShellHeader` are dead paths at runtime.

This is not the same as the live `site_header` / `site_footer` sections — those render through the freeform tree / `section_embed`. The **shell flag + PublishedShell** is an older snapshot-shell wrapper that was superseded by the freeform approach.

**Verdict: MIGRATE.** Confirm the flag will stay off permanently, then delete `site-shell-flag.ts`, `PublishedShell.tsx`, `web/src/lib/site-admin/server/shell-reads.ts` (only called from `PublishedShell`), and the `shouldRenderSnapshotShell` call site in `agency-home-storefront.tsx`. If the flag is meant to go ON, flip it and QA it — but that is a separate task.

---

### 5. `client-canvas-flag.ts` — flag is baked ON; the abstraction has served its purpose
**File:** `web/src/lib/site-admin/edit-mode/client-canvas-flag.ts`

The flag function wraps `process.env.NEXT_PUBLIC_BUILDER_CLIENT_CANVAS`. MEMORY.md (`project_freeform_2026_builder.md`) states the flag is now ON in prod. The "safety net" (server-rendered canvas) described in the docstring is the fallback branch that is effectively dead. The 4 call sites (`homepage-cms-sections.tsx` line 297, `edit-context.tsx` line 4071, `client-builder-canvas.tsx` line 12 comment, the flag file itself) could be replaced with a constant `true`.

**Verdict: MIGRATE** after the canvas path is stable. Replace `isBuilderClientCanvasEnabled()` with `true` in the three call sites, delete the flag file, and delete the server-canvas fallback branch in `homepage-cms-sections.tsx` (item 2 above). This is a two-step: flip the constant, watch prod for one release cycle, then delete the dead server path.

---

## MIGRATE / FINISH — half-done or stranded work

### 6. `snapshot-slot-bridge.ts` — legacy slot→tree hydration layer kept for old tenants
**File:** `web/src/lib/site-admin/builder-node/snapshot-slot-bridge.ts`

Derives builder-node trees from raw CMS slot rows (hero, cta_banner, trust_strip etc.) so legacy snapshots without a `builderTree` column can still render role-bound child nodes in the editor. This is not dead — it is used by `snapshot-tree.ts`, `homepage.ts`, `homepage-reads.ts`, `page-reads.ts`, and `onboard-directory-page.ts`. BUT it creates `id` values like `${sectionNodeId}:heading:headline` (line 23) — these "legacy:" ids appear throughout the codebase as special-cases in `section-eject.ts`, `role-bindings.ts`, and `render.tsx`.

The bridge is a migration tool masquerading as permanent infrastructure. As long as it exists, operators can't fully "own" the freeform representation of their pages.

**Verdict: KEEP for now, but MIGRATE toward freeform.** The right fix is a one-time data migration: backfill `builderTree` rows for all tenants with legacy slot-only snapshots, then delete the bridge + its special-case branches. That is a separate multi-tenant data task, not a code delete.

---

### 7. `section-eject.ts` — "2018 bye-bye" is a partial migration tool
**File:** `web/src/lib/site-admin/builder-node/section-eject.ts`

The eject mechanism converts a curated-section's role-bound children into roleless freeform nodes, flags the section `ejected: true`, and causes `homepage-cms-sections.tsx` to skip the curated `Component` (line 599: `{sectionEjected ? null : rendered}`). It is wired in `edit-context.tsx` and surfaced in the selection-layer chip menu. The inverse `unejectSectionInTree` is also wired.

This is a live feature, not dead. However the docstring says "2018 bye-bye" — the name signals it was conceived as a path to migrate curated sections into freeform. Without the data migration in item 6 above, eject works but re-ejection is lossy.

**Verdict: KEEP until the snapshot-slot-bridge migration lands.** After that, `ejectSection` can be simplified (the `ejected` flag becomes unnecessary once there are no curated sections with role-bound children).

---

### 8. `collab-audit.ts` — audit window written to `window` but never read in prod code
**File:** `web/src/lib/site-admin/builder-node/collab-audit.ts`

`recordBuilderMutationAuditEvent` writes events to `window.__improntaBuilderMutationAudit`. `createBuilderMutationAuditEvent` and `createEditorDispatchAuditEvent` are called from `edit-context.tsx` (lines 3154-3155, 4256-4257). But nothing in the production codebase **reads** `window.__improntaBuilderMutationAudit` — there is no dashboard, no error reporter, no Sentry hook. The audit window is browser-console-only debugging infrastructure.

The `BUILDER_MUTATION_AUDIT_WINDOW_KEY` constant (`"__improntaBuilderMutationAudit"`) appears only in this file. `getBuilderAuditWindow` and `appendBuilderAuditEvent` (the exported reader/writer) are not imported anywhere outside the barrel.

**Verdict: KEEP for now (it is useful for debugging production issues via the console), but annotate clearly.** If bundle size becomes a concern, it can be tree-shaken by wrapping the record calls in `if (process.env.NODE_ENV !== "production")`. No urgent action needed.

---

### 9. `style-classes.ts` localStorage — classes don't publish, trust bug documented elsewhere
**File:** `web/src/lib/site-admin/builder-node/style-classes.ts`; `web/src/components/edit-chrome/navigator-panel.tsx` lines 4044-4068; `web/src/components/edit-chrome/inspectors/linked-style-classes-bar.tsx` lines 46-70

The style-classes registry is persisted to `localStorage` keyed by `pageId`. `render.tsx` accepts `styleClasses?: BuilderStyleClassRegistry` as an optional render option but NO caller passes it on the server path (`homepage-cms-sections.tsx` and `PublishedShell.tsx` call `renderBuilderNodes` without `styleClasses`). The `client-builder-canvas.tsx` also does not pass `styleClasses`. As a result, every `classRef` on a node silently falls through to the node's own style on publish — the class IS applied in the editor (editor passes the registry) but is invisible on the live site.

This is the "Classes don't publish" trust bug called out in the audit brief. The root cause at code level is that `styleClasses` is wired nowhere in the server render path, and the registry has no server persistence (it is localStorage-only).

**Verdict: MIGRATE.** The fix is two parts: (a) persist the class registry to the page row (new `style_classes` JSONB column or inside `builderTree`), and (b) pass the resolved registry to `renderBuilderNodes` in `homepage-cms-sections.tsx`. This is the trust fix, not a dead-code delete. Tracked separately in `classes-publish-path.md`.

---

### 10. `SubStepD` comment trail — router.refresh guard is effectively always-true in prod
**File:** `web/src/components/edit-chrome/edit-context.tsx`, line 4055-4075

The comment "W3 Sub-step D — skip the per-edit server refresh on the builder-tree happy path WHEN THE CLIENT CANVAS IS ACTIVE" is now always active in prod (flag is ON). The conditional `if (!isBuilderClientCanvasEnabled() || mutationTouchesSectionEmbedIslandSet(...))` simplifies to `if (mutationTouchesSectionEmbedIslandSet(...))` once the flag is baked. No runtime harm, but the stale comment creates confusion about why there are still router.refresh calls.

**Verdict: MIGRATE** as part of item 5 (flag removal). The guard becomes a single condition with no mention of the flag.

---

## KEEP — live code documented for completeness

| File / symbol | Why it's live |
|---|---|
| `client-builder-canvas.tsx` + `client-builder-canvas-bridge.ts` | W3 client-canvas + `useSyncExternalStore` bridge — active in prod |
| `section-embed-renderer.tsx` | Powers `section_embed` server islands on both the SSR path and the client-canvas pre-render map |
| `iframe-bridge.tsx` + `iframe-child.tsx` | Sprint 3 device-preview — active; `IframeBridgeParent` mounted in `edit-shell.tsx` line 1081; `IframeChild` in `edit-chrome.tsx` line 138 |
| `collab-audit.ts` | Debug window; called from `edit-context.tsx` (see §8) |
| `section-eject.ts` | Live "eject section" feature in the chip menu (see §7) |
| `snapshot-slot-bridge.ts` | Legacy slot hydration used by 5 server files (see §6) |
| `mvp-allow-list.ts` | Element-library picker catalog — used by `element-library-policy.ts` and `element-library-insert-picker.tsx` |
| `style-classes.ts` | Class registry logic — editor uses it; server path doesn't (see §9) |
| `site-shell-flag.ts` | Gate is off, but the `PublishedShell.tsx` still imports it (see §4) |
| `MeshGradientGenerator.tsx` | UI renders; `onApply` integration is dead (see §3) |

---

## Recommended sequencing

1. **Immediate (S, zero-risk):** Delete `PagesComposerList.tsx` — no imports, no tests reference it.
2. **After one prod release cycle (S):** Bake `isBuilderClientCanvasEnabled()` → `true`, delete `client-canvas-flag.ts`, delete the server-canvas fallback in `homepage-cms-sections.tsx` (lines 317-332), simplify the Sub-step D guard.
3. **Paired with PublishedShell audit (M):** Confirm `ENABLE_SITE_SHELL` will stay OFF, then delete `site-shell-flag.ts` + `PublishedShell.tsx` + `shell-reads.ts`.
4. **Wire `MeshGradientGenerator` or remove `onApply` (S):** one-line decision; keeps the component honest.
5. **Classes publish trust fix (M-L):** See `classes-publish-path.md` — requires DB schema + server render change.
6. **Snapshot-slot-bridge backfill (XL):** Multi-tenant data migration; enables deleting the bridge and simplifying eject.
