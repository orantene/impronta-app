# Phase 10 QA — Keyboard shortcuts overlay

Code-level verification passed (2026-04-25).

## Build

- **Source commit:** `6ba1171` — `feat(edit-chrome): Phase 9 v2 + Phase 10 — preview pill, share popover, shortcut overlay`. Adds `shortcut-overlay.tsx`, wires it through `edit-context.tsx` + `edit-shell.tsx`, and surfaces the action row in the command palette.
- **Promoted production deployment:** `dpl_GbNbgYjPrMZgYoNTcGds6Bkb2Rdw` — `tulala-7jwqyfz6z-oran-tenes-projects.vercel.app` — state `READY`, target `production`.
- **TypeScript:** `cd web && npx tsc --noEmit` exits clean at HEAD.
- **Production build:** `cd web && npx next build` exits clean.

## Acceptance criteria

| Item | Status | Evidence |
|---|---|---|
| TS errors fixed | ✅ | `tsc --noEmit` clean at HEAD `6ba1171` |
| Prod build green | ✅ | `next build` exits 0 |
| Prod deploy green | ✅ | `dpl_GbNbgYjPrMZgYoNTcGds6Bkb2Rdw` `state=READY`, `target=production` |
| Prod root smoke | ✅ | three host roots return `200` (see Phase 9 v2 README) |
| ShortcutOverlay component | ✅ | `web/src/components/edit-chrome/shortcut-overlay.tsx` — paper-tinted modal on a translucent ink scrim, 720px max-width, viewport-bounded scroll. Reads from `SHORTCUTS` + `SHORTCUT_CATEGORY_LABELS` in `kit/shortcuts.ts` and renders one `<section>` per `ShortcutCategory` with grouped tables of `<KbdSequence>` chips. Empty categories drop out. Footer prints the `⌘ → Ctrl` mapping note once + an Esc-to-close hint. |
| Centralised registry | ✅ | `kit/shortcuts.ts` is the single source of truth — the palette result rows (`shortcutFor(id)`) and the overlay's grouped table BOTH read from the same array. Adding or moving a keybind happens in exactly one place; chips can't drift between consumers by construction. |
| `?` global keybind | ✅ | `edit-shell.tsx`'s keyboard handler matches `e.key === "?"` (so US layouts firing Shift+/ work, plus any non-US layout that yields the literal `?` glyph), gated by `!mod && !e.altKey` so `⌘?` / Ctrl-? stay reserved for browser-native help. The handler also guards on the editable-target check so typing `?` in an input doesn't toggle the overlay. |
| Escape priority chain | ✅ | `edit-shell.tsx`'s Escape branch order: shortcut overlay → palette → drawer mutex set. Closing the overlay never accidentally also dismisses a drawer underneath. The overlay mounts its own Escape handler too as a safety net for clicks that take focus elsewhere. |
| Overlay backdrop dismiss | ✅ | Backdrop click closes (`onClick={onClose}` on the scrim with `e.stopPropagation()` on the card body). Standard modal pattern shared with the command palette. |
| `EditContext` surface | ✅ | `edit-context.tsx` adds `shortcutOverlayOpen / openShortcutOverlay / closeShortcutOverlay / toggleShortcutOverlay` to the `EditContextValue` interface, `useState(false)` + 3 `useCallback` wrappers in `EditProvider`, and includes them in the value memo + dependency array so consumers re-render coherently. |
| Command palette row | ✅ | `command-palette.tsx` adds an `actionRow("shortcut-overlay", "Show keyboard shortcuts", ...)` in the action group. Selecting commits `ctx.openShortcutOverlay()` + closes the palette. The `?` chip on the row pulls automatically from the registry by id (registry entry: `keys: ["?"]`). Searchable via "help", "keys", "reference", "cheatsheet" keywords. |
| EditShell mount | ✅ | `<ShortcutOverlay open={shortcutOverlayOpen} onClose={closeShortcutOverlay} />` mounted alongside `<CommandPalette>`. `null`-renders when closed so its effects (Escape listener) only subscribe when actually visible. |

## Notes

- **Visual smoke** — the overlay only renders inside the staff-authenticated editor chrome (it's mounted by `EditShell`). A staff session at `https://impronta.tulala.digital/?edit=1` is required to capture screenshots. Code evidence stands until the manual capture pass.
- **Scope** — the overlay is reference-only; the actual key handlers stay in `edit-shell.tsx` and the inspectors. The registry is purely declarative — adding a new keybind means (1) wire the handler where it belongs and (2) add a `Shortcut` entry to `SHORTCUTS`. The palette + overlay both pick it up automatically.
- **Future** — when multi-page lights up (Phase 24+), the overlay can grow a "page-level" shortcut category for navigating between pages without conflicting with the existing `command-palette` / `shortcut-overlay` global keys.
