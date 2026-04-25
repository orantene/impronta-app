# Phase 8 QA — Command palette ⌘K

Code-level verification passed (2026-04-25).

## Build

- **Source commit:** `55f4284` — `feat(edit-chrome): Phase 8 — Command palette ⌘K`. Five files: shortcut registry (`kit/shortcuts.ts`), kit barrel export, command palette component (`command-palette.tsx`), EditContext palette state, EditShell mount + ⌘K keybind + Escape safety branch.
- **Production deployment:** `dpl_DoYLBoSoGYtUNtB3sWccwDYDFh3X` — `tulala-5r1g5o0ww-oran-tenes-projects.vercel.app` — state `READY`, target `production`. Aliased to `tulala.digital` / `impronta.tulala.digital` / `app.tulala.digital` by the post-deploy GitHub Action.
- **TypeScript:** `cd web && rm -rf .next/dev/types .next/types && npx tsc --noEmit` exits clean (zero errors).

## Strategy note — schema-zero phase

Phase 8 introduces no schema, no server actions, no migrations. The palette is a pure editor-chrome surface: it reads from `EditContext` (slots, slotDefs, selectedSectionId, device, canUndo / canRedo) and dispatches every action through callbacks already wired by previous phases (`setSelectedSectionId`, `openPublish` / `openPageSettings` / `openRevisions` / `openTheme` / `openAssets`, `undo` / `redo`, `saveDraft`, `duplicateSection` / `moveSection` / `removeSection`, `toggleNavigator`, `setDevice`). The shortcut registry is an in-memory const list — it has no runtime cost and is forward-shareable with Phase 10's keyboard overlay.

## Acceptance criteria

| Item | Status | Evidence |
|---|---|---|
| TS errors fixed | ✅ | `tsc --noEmit` clean |
| Prod deploy green | ✅ | `dpl_DoYLBoSoGYtUNtB3sWccwDYDFh3X` `state=READY`, `target=production` |
| Prod smoke | ✅ | `curl -sI https://tulala.digital/` → `HTTP/2 200`; `https://impronta.tulala.digital/` → `200`; `https://app.tulala.digital/` → `200` |
| Shortcut registry | ✅ | `web/src/components/edit-chrome/kit/shortcuts.ts` exports `SHORTCUTS`, `SHORTCUT_CATEGORY_LABELS`, `getShortcut(id)`, `shortcutsByCategory()`. 18 entries across 6 categories (search / navigation / drawers / editing / history / selection). Re-exported from the kit barrel so any future surface (Phase 10 overlay, drawer footers, tooltips) can read from one place. |
| `command-palette.tsx` | ✅ | `web/src/components/edit-chrome/command-palette.tsx` (~580 lines). Centred modal — 640px wide, paper-tinted card, ink overlay backdrop, 12vh top offset, max-height 76vh. Auto-focuses search input on open; resets query + selection every time. Click on backdrop closes; clicks inside the card are stopped. zIndex 150 keeps it above every drawer. |
| ⌘K global keybind | ✅ | `web/src/components/edit-chrome/edit-shell.tsx`: new top-of-handler branch `if (mod && key === "k") { e.preventDefault(); togglePalette(); return; }`. Shares the existing `editable` focus guard with ⌘L / ⌘\\ / ⌘Z so it doesn't fire when the operator's typing in an inline editor. Escape now dismisses the palette ahead of the right-side-drawer mutex check as a safety net for the click-out-of-input case. |
| Fuzzy search | ✅ | `fuzzyScore(query, text)` in `command-palette.tsx`. Case-insensitive in-order character match required; scoring rewards shorter targets (`Hero` beats `Hero with overlay` for query `hero`), earlier first-match position, contiguous runs of matching characters, and exact prefix matches (`startsWith → 5000 - length`). `scoreRow` runs the score across `label`, `meta`, and `keywords` arrays and returns the best individual score, demoting keyword-only matches slightly so a label match wins ties. |
| Grouped results | ✅ | Results render in fixed order: Sections → Drawers → Actions → Navigation → (Pages, hidden today). Each group caps at 12 rows. Group headers are 10.5px uppercase tracking. The flat row list (`flatRows`) drives keyboard nav, with each row tagging its absolute index via `data-row-idx` for scroll-into-view. |
| Section search | ✅ | Iterates `slotDefs` in canonical order, then sweeps `slots` for any slot not in `slotDefs` (defensive). Each row labels with the section name, meta-line with the slot's `label` (fallback: `key`), keywords include `sectionTypeKey + 'section' + 'go to'`, icon is the matching `<SectionTypeIcon>`. Selecting a section runs `setSelectedSectionId` AND `document.querySelector(\`[data-section-id="${ref.sectionId}"]\`).scrollIntoView({block:'center', behavior:'smooth'})` so the operator's eye lands on the section the inspector just engaged. |
| Drawer + action search | ✅ | Five drawer rows (Publish / Page Settings / Revisions / Theme / Assets) — each carries the matching shortcut from the registry so the right-side chip set is correct. Action rows are conditionally pushed: `Undo` only when `canUndo`, `Redo` only when `canRedo`, the section-selected actions (Duplicate / Move up / Move down / Delete) only when `selectedSectionId !== null`. Save draft is always available. |
| Navigation search | ✅ | Toggle navigator + three device-switcher rows (Desktop / Tablet / Mobile). The current device is filtered out so the operator never sees a no-op row. |
| Keyboard navigation | ✅ | ↓ / ↑ wrap with modulo arithmetic; Enter commits the active row; Escape closes. Active row scrolls into view via `scrollIntoView({block:'nearest'})`. `MouseEnter` syncs the active row, so cursor + keyboard navigate the same selection. |
| Inline keybind chips | ✅ | Each row renders a `<KbdSequence keys={shortcut.keys} />` on the right when a shortcut is registered. Pulled from the registry by id (`shortcutFor(id)`), so the palette and Phase 10's overlay never disagree about a keybind. |
| Footer hint strip | ✅ | Three FooterHint clusters: Navigate `↑↓`, Run `↵`, Close `Esc`. Paper-2 background, top divider, 11px muted text — quietly present without competing with the result list. |
| Empty state | ✅ | Two-state: empty query → "Start typing to search the editor…"; non-matching query → `No matches for "{query}"`. 32px vertical padding, centred, muted ink. |
| Modal not mutexed with drawers | ✅ | Palette is a centred modal at zIndex 150. EditContext's `paletteOpen` deliberately does NOT mutex with `publishOpen / pageSettingsOpen / revisionsOpen / themeOpen / assetsOpen` — an operator can summon ⌘K while a drawer is open without losing their place. The drawer mutex only governs the right-side drawer set. |
| Lazy mount | ✅ | `<CommandPalette open={paletteOpen} onClose={closePalette} />` returns `null` while `!open`, so the auto-focus effect, keyboard listeners, and result-list memos only subscribe when the palette is actually visible. |
| Screenshots committed | ⏳ | Visual capture pending a staff-authenticated session at `impronta.tulala.digital?edit=1`; middleware blocks raw `*.vercel.app` so manual capture is required. Code evidence stands until then. |

## Promote + smoke

- **Production deployment id:** `dpl_DoYLBoSoGYtUNtB3sWccwDYDFh3X`
- **Promoted via** `vercel promote https://tulala-5r1g5o0ww-oran-tenes-projects.vercel.app --yes`
- `curl -sI https://tulala.digital/` → `HTTP/2 200` ✅
- `curl -sI https://impronta.tulala.digital/` → `HTTP/2 200` ✅
- `curl -sI https://app.tulala.digital/` → `HTTP/2 200` ✅

## Notes / deferred items

- **Multi-page search** — the palette is forward-compatible with a `Pages` group but renders no rows today because the editor only operates on the homepage. Phase 24 (page picker schema) lights this up by passing the page list into the palette; no palette code change needed beyond the row factory.
- **Recent / pinned commands** — the palette resets to a fresh blank query every open. A "recently used" section that surfaces the last 5 commands would land cleanly above Sections; deferring until M11 produces enough usage telemetry to know which commands deserve the slot.
- **Inspector tab targets** — the palette doesn't yet jump directly to a specific inspector tab (Content / Layout / Style / Responsive / Motion). Adding `Open layout for {section name}` rows is one more `actionRow` factory + a `setSelectedTabKey` callback on EditContext; tracked as a Milestone D follow-up.
- **Section creation rows** — "Create new {section type}" rows would route through `insertSection` with a default slot target. Tracked behind the inserter UX revisit so we don't ship two competing creation paths simultaneously.
- **Theme tokens / brand colors search** — the palette currently surfaces "Open Theme drawer" but doesn't drill into individual tokens. Direct token search ("Switch primary color to Bone") is a Phase 10+ deepening.
