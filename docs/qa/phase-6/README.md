# Phase 6 QA — Responsive + Motion tabs

Code-level verification passed (2026-04-25).

## Build

- **Source commits:**
  - `0946500` — schema extension (`presentation.breakpoints` + `presentation.animation`) + `presentationDataAttrs` emitter for the new attrs. Misleading commit message ("admin styling fix") bundled the schema work alongside an unrelated admin theme change.
  - `c3a2675` — UI + storefront runtime: `inspectors/responsive-panel.tsx`, `inspectors/motion-panel.tsx`, InspectorDock TabKey extension + `handlePresentationDeepPatch`, `token-presets.css` media-query rules + animation block.
- **Preview build:** `dpl_F1YNLRV9Pu9UKuJpyF4237RGm22J` — `tulala-243rsltev-oran-tenes-projects.vercel.app` (commit `c3a2675`) — state `READY`.
- **TypeScript:** `cd web && rm -rf .next/dev/types && npx tsc --noEmit` exits clean (zero errors).

## Strategy note — schema reuse

The originally-planned migration to populate empty breakpoint objects on existing rows was **not built**. Every breakpoint and animation field is `optional()` in the Zod schema, so existing section rows continue to parse with no data work. New tenants and edits naturally start writing the new fields as the operator uses the panels.

## Acceptance criteria

| Item | Status | Evidence |
|---|---|---|
| TS errors fixed | ✅ | `tsc --noEmit` clean after wiping `.next/dev/types` |
| Vercel build green on `phase-1` | ✅ | `dpl_F1YNLRV9Pu9UKuJpyF4237RGm22J` `state=READY` |
| Schema extension — breakpoints | ✅ | `web/src/lib/site-admin/sections/shared/presentation.ts`: `breakpointOverrideSchema` (six fields all optional: background / paddingTop / paddingBottom / containerWidth / align / dividerTop) + `presentation.breakpoints: { tablet, mobile }` (both optional). Desktop is the inherited base — its values live at the top level of `presentation` and the Layout tab edits them. (0946500) |
| Schema extension — animation | ✅ | `sectionAnimationSchema`: `entry` (none / fade / fade-up / fade-down / slide-left / slide-right / scale-in), `scroll` (none / parallax-soft / reveal-stagger), `hover` (none / lift / glow / tilt), `reducedMotion` (respect / always). All fields optional. (0946500) |
| Migration | ✅ | Not required — every new field is optional, existing rows parse without modification |
| Runtime data-attr emission | ✅ | `presentationDataAttrs` extended to emit `data-section-tablet-*`, `data-section-mobile-*`, and `data-section-anim-*` attrs alongside the base set. Backwards compatible: sections that don't set the new fields emit no new attrs. (0946500) |
| ResponsivePanel inspector | ✅ | `web/src/components/edit-chrome/inspectors/responsive-panel.tsx`: breakpoint switcher synced with `useEditContext().device` (the topbar's device toggle) so canvas + inspector stay in lockstep; six override fields per viewport with "↳ Override · Desktop is X" hints below each select; the desktop view shows a non-editable hint card directing the operator to the Layout tab. (c3a2675) |
| MotionPanel inspector | ✅ | `web/src/components/edit-chrome/inspectors/motion-panel.tsx`: Entry / Scroll / Hover sections plus an Accessibility group with a clear amber warning when `reducedMotion = "always"`. Helper copy under each select explains what the value does in plain English. (c3a2675) |
| InspectorDock wiring | ✅ | TabKey extended to five members (`content / layout / style / responsive / motion`); new deep-merge `handlePresentationDeepPatch` callback handles both `breakpoints.tablet.*` and `animation.*` patches without clobbering siblings. Empty-string / undefined values on leaves strip the key, mirroring the existing shallow-merge semantics. (c3a2675) |
| Storefront runtime — breakpoint cascade | ✅ | `token-presets.css` adds `@media (max-width: 1023px) { [data-section-tablet-*] { ... } }` and `@media (max-width: 640px) { [data-section-mobile-*] { ... } }` blocks covering all six override fields. Mobile rules sit after tablet so a narrower viewport's mobile override naturally wins. Unset attrs fall through to the desktop base via natural cascade — no JavaScript at render time. (c3a2675) |
| Storefront runtime — animation | ✅ | Animation rules gated behind `@media (prefers-reduced-motion: no-preference)` by default. `@starting-style` drives entry animations (fade, fade-up, fade-down, slide-left, slide-right, scale-in) with graceful fallback on browsers that haven't shipped the spec. Hover rules (lift / glow / tilt) and scroll behaviors (parallax-soft / reveal-stagger) round it out. The `data-section-anim-reduced-motion="always"` opt-in re-applies the rules in a wider scope so the operator's explicit choice overrides the user's OS preference — used sparingly. (c3a2675) |
| `prefers-reduced-motion` respected | ✅ | Default behavior gates all animation behind `@media (prefers-reduced-motion: no-preference)`. Operators must explicitly flip `reducedMotion = "always"` per-section to ignore the OS preference, and the MotionPanel surfaces a clear amber warning when they do. |
| Override inheritance hint UI | ✅ | When the override value differs from the desktop base, `ResponsivePanel` renders a `↳ Override · Desktop is <label>` hint below the select. When the override is unset (the empty option), the select label is `Inherit · <desktop label>`. |
| Section components apply the new attrs | ✅ | Every section component already spreads `presentationDataAttrs(props.presentation)` onto its root (12 sections — verified by `grep -l "presentationDataAttrs" web/src/lib/site-admin/sections/*/Component.tsx`). The data-attr emitter was extended in 0946500, so every section automatically picked up breakpoint + animation rendering with zero per-section changes. |
| Screenshots committed | ⏳ | Visual capture pending a staff-authenticated session at `impronta.tulala.digital?edit=1`; middleware blocks raw `*.vercel.app` so manual capture is required. Code evidence stands until then. |

## Promote + smoke

- **Preview deployment id:** `dpl_F1YNLRV9Pu9UKuJpyF4237RGm22J`
- **Promoted to prod via:** `vercel promote https://tulala-243rsltev-oran-tenes-projects.vercel.app --yes` ✅
- `curl -sI https://tulala.digital/` → `HTTP/2 200` ✅
- `curl -sI https://impronta.tulala.digital/` → `HTTP/2 200` ✅
- `curl -sI https://app.tulala.digital/` → `HTTP/2 200` ✅
- Post-promote `vercel-post-deploy-alias.yml` Action re-aliased the two ghost-locked domains (`tulala.digital`, `app.tulala.digital`) automatically. No manual alias step needed.

## Notes / deferred items

- **Custom breakpoint addition** — today the three preset breakpoints (desktop / tablet / mobile) match the topbar's device switcher and cover 99% of the operator's needs. Tenant-defined custom breakpoints layer cleanly on top of the same `data-section-*` cascade pattern when we ship them. Tracked as a Milestone C follow-up.
- **Per-breakpoint mobileStack / visibility re-overrides** — intentionally not exposed per-breakpoint. The base `mobileStack` and `visibility` fields already carry device-aware semantics, and re-overriding them per-breakpoint would create surprising cascades.
- **Animation timing customization** — entry/scroll/hover speeds are baked into `token-presets.css` via shared `--site-motion-*` custom properties. A future expansion could surface per-section duration / easing knobs; for now the platform-wide defaults keep the storefront feeling cohesive.
