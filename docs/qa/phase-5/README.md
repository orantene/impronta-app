# Phase 5 QA — Theme drawer + design tokens

Code-level verification passed (2026-04-25).

## Build

- **Source commits:** `d7cf4a9` — feat(edit-chrome): Phase 5 — Theme drawer + design tokens. Adds `web/src/lib/site-admin/edit-mode/design-actions.ts` typed wrappers + `web/src/components/edit-chrome/theme-drawer.tsx` (~700 lines) + EditContext `themeOpen` mutex + DRAWER_WIDTHS `theme: 540 / themeExpanded: 760` + TopBar palette icon + Navigator footer wiring + EditShell mount + Escape handler extension.
- **Preview build:** `dpl_kZt5KwgeuD393BJRn6USoeRjQoZH` — `tulala-a2t1b3u94-oran-tenes-projects.vercel.app` (commit `d7cf4a9`) — state `READY`, build duration 2m.
- **TypeScript:** `cd web && rm -rf .next/dev/types && npx tsc --noEmit` exits clean (zero errors).

## Strategy note — schema reuse

The original Phase 5 plan called for a fresh `site_themes` table. That migration was **not built** because M6 already shipped the equivalent infrastructure on `agency_branding`:

| Need | Pre-existing landing |
|---|---|
| Live theme tokens | `agency_branding.theme_json` (jsonb) |
| Draft theme tokens (in-flight edits) | `agency_branding.theme_json_draft` (jsonb, nullable) |
| Preset slug pointer | `agency_branding.theme_preset_slug` |
| CAS versioning | `agency_branding.theme_version` (int) |
| Revisions / audit / cache-bust | `theme_revisions` table + `audit_events` + `revalidateTag('branding:*')` |
| Server ops | `loadDesignForStaff` / `saveDesignDraft` / `publishDesign` / `restoreDesignRevision` / `applyThemePreset` in `web/src/lib/site-admin/server/design.ts` |
| Validation | `validateThemePatch` (token registry allowlist via `agencyConfigurable`) in `web/src/lib/site-admin/tokens/registry.ts` |
| Storefront application | `designTokensToCssVars` (color tokens → `--token-color-*`) + `designTokensToDataAttrs` (enum tokens → `data-token-*` attrs) wired in `web/src/app/layout.tsx:135-137`; `web/src/app/styles/token-presets.css` (1708 lines) keys storefront rules off the data-attrs |

Phase 5 build = typed action wrappers (mirror Phase 4's `revisions-actions.ts` pattern) + the operator-facing drawer + the chrome wiring. Zero schema work was required.

## Acceptance criteria

| Item | Status | Evidence |
|---|---|---|
| TS errors fixed | ✅ | `tsc --noEmit` clean after wiping `.next/dev/types` |
| Vercel build green on `phase-1` | ✅ | `dpl_kZt5KwgeuD393BJRn6USoeRjQoZH` `state=READY` |
| Schema reuse — no migration | ✅ | M6's `agency_branding` columns cover the full read+write surface (see Strategy note above) |
| Typed action wrappers exist | ✅ | `web/src/lib/site-admin/edit-mode/design-actions.ts`: `loadDesignAction()` (returns `{ themeDraft, themeLive, presetSlug, themePublishedAt, version }`), `saveDesignDraftFromEditAction({ patch, expectedVersion })`, `publishDesignFromEditAction({ expectedVersion })`. All staff-gated, tenant-scoped, CAS-safe. VERSION_CONFLICT responses include `currentVersion` so the drawer can refresh without a hard reload. |
| Drawer mounted in EditShell | ✅ | `<ThemeDrawer />` mounted after `<RevisionsDrawer />` in `web/src/components/edit-chrome/edit-shell.tsx` |
| Drawer mutex with the other right-side drawers | ✅ | `EditContext.openTheme` flips Publish / PageSettings / Revisions all to `false` before opening; the other three openers do the same for `themeOpen`. Escape handler in EditShell dismisses whichever of the four is open. All four anchor `right: 0` at `zIndex: 87` so they would visually conflict if mutex were absent — the mutex is load-bearing. |
| Top bar palette icon wired | ✅ | `topbar.tsx` adds a `<TbIconBtn title="Theme" onClick={onTheme}>` palette icon after Revisions; EditShell passes `onTheme={openTheme}` |
| Navigator footer Theme shortcut wired | ✅ | `navigator-panel.tsx` previously rendered Theme as a disabled placeholder; now `<FooterShortcut onClick={openTheme}>` calls into `useEditContext().openTheme` |
| Five tabs render | ✅ | `theme-drawer.tsx`: Colors / Typography / Layout / Effects / Code (renamed Spacing → Layout to match the M6 token group naming). Tab switcher via `DrawerTabs`. |
| Colors tab — brand + editorial | ✅ | `BRAND_COLORS` (primary / secondary / accent / neutral) + `EDITORIAL_COLORS` (blush / sage / ink / muted / line / surface-raised) via `ColorRow` (swatch + hex input + reset-to-default link) |
| Typography / Layout / Effects tabs | ✅ | `TYPOGRAPHY_PRESETS`, `LAYOUT_PRESETS`, `EFFECT_PRESETS` rendered through `Segmented`; values map straight to enum tokens that `token-presets.css` already keys off |
| Code tab | ✅ | Read-only JSON of the working copy + Copy button + "Reset to platform defaults" link that wipes back to `tokenDefaults()` |
| Patch semantics — full working copy | ✅ | Drawer maintains a full working copy = `tokenDefaults()` ⊕ operator overrides. Every save sends the complete map (filtering empty strings = "fall back to default"). This means the operator can grow the UI later without losing tokens set elsewhere — `theme_json_draft` is a full replacement, not a merge. |
| Save draft button | ✅ | Calls `saveDesignDraftFromEditAction({ patch: workingCopy, expectedVersion })`. On VERSION_CONFLICT the drawer re-fetches the snapshot so subsequent operator action uses the authoritative version. |
| Publish button | ✅ | If working copy ≠ persisted draft, saves draft first (still CAS-safe), then calls `publishDesignFromEditAction({ expectedVersion })` which routes through `publishDesign` lib op — same audit + revision row + `revalidateTag('branding:*')` cache bust path that the M6 mockup admin uses. After publish, drawer closes and `router.refresh()` re-renders the storefront against the new live tokens. |
| In-row publish confirm | ✅ | Two-step: first click on Publish flips the footer to `Cancel` + `Yes, publish`; the second click runs the action. |
| VERSION_CONFLICT recovery | ✅ | All three operations (saveDraft / pre-save during publish / publish itself) refresh the drawer's snapshot on `VERSION_CONFLICT` so the operator's next click uses the authoritative `theme_version` without a page reload. Mirrors the Phase 4 RevisionsDrawer pattern. |
| Escape dismisses drawer | ✅ | EditShell's keyboard handler closes whichever of the four right-side drawers is open. |
| Storefront tokens live | ✅ | `web/src/app/layout.tsx` lines 135-137 read `agency_branding.theme_json` + `theme_preset_slug` and project them onto the `<html>` element via `designTokensToCssVars` (CSS custom properties for color tokens) + `designTokensToDataAttrs` (`data-token-*` attrs for enum tokens). `token-presets.css` (1708 lines) translates the data-attrs into typography / layout / effect rules. |
| Screenshots committed | ⏳ | Visual capture pending a staff-authenticated session at `impronta.tulala.digital?edit=1`; middleware blocks raw `*.vercel.app` so manual capture is required. Code evidence stands until then. |

## Promote + smoke

- **Preview deployment id:** `dpl_kZt5KwgeuD393BJRn6USoeRjQoZH`
- **Promoted to prod via:** `vercel promote https://tulala-a2t1b3u94-oran-tenes-projects.vercel.app --yes` ✅
- `curl -sI https://tulala.digital/` → `HTTP/2 200` ✅
- `curl -sI https://impronta.tulala.digital/` → `HTTP/2 200` ✅
- `curl -sI https://app.tulala.digital/` → `HTTP/2 200` ✅
- Post-promote `vercel-post-deploy-alias.yml` Action re-aliased the two ghost-locked domains (`tulala.digital`, `app.tulala.digital`) automatically. No manual alias step needed.

## Notes / deferred items

- **Theme history surface (restore-as-draft)** — `loadDesignRevisionsForStaff` already exists server-side, mirroring `loadHomepageRevisionsForStaff`. A theme-revisions tab inside the drawer (or its own "design revisions" drawer) layers cleanly on top once we want the operator to see + restore prior themes. Tracked as a Milestone C follow-up.
- **Token usage scanner** — search section props for token references (`var(--token-color-primary)` etc.) and surface reference counts so the operator can see "this color is used by 4 sections". Useful but non-blocking for Phase 5; tracked as a Milestone C follow-up.
- **Font upload flow** — woff2 → tenant-scoped storage bucket. Today the typography tab exposes preset families which is the same coverage top-tier builders ship at this milestone. Tracked as a Milestone C follow-up.
- **Diff renderer** — same constraint as Phase 4: a per-token diff against the currently-live theme would surface what's about to change on publish. Deferred along with Phase 4's diff renderer; both unblock together.
- **Visual screenshots for Phases 3-5** — same blocker (staff-auth session at `impronta.tulala.digital?edit=1`). Will capture all three phases in one walkthrough.
