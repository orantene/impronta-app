# Builder controls — 2026 plan ("Quiet White Atelier")

Binding design plan for the canvas/freeform page-builder control system. Grounded
in a code-verified audit (72 distinct control surfaces across 79 files in
`web/src/components/edit-chrome/` + `kit/`, `inspectors/`) and an experiential UX
audit (53 findings). This file is the source of truth for the consolidation; keep
it in sync as phases land.

## North star
One invariant an operator learns once: **LEFT = what exists** (structure + insert),
**RIGHT = how it looks & behaves** (inspector), **TOP = document verbs**. The canvas
owns the screen; everything else is summoned and dismissed. Consolidate ~72 surfaces
to **9 owning surface-classes without removing a single capability** — depth moves
into the always-present right inspector and the keyboard layer, never deleted.

## Principles
1. One place per decision, and it never moves. No hunting.
2. At most three things on a selection: selection ring + ONE contextual chip +
   on-demand direct-manipulation handles (today: up to 5 stacked navy bars).
3. One white system, one accent: violet `#7c3aed` for active/primary ONLY; every
   floating surface frosted-white. Zero dark-navy chrome after unification.
4. Nothing is removed: every retired button gains a keyboard shortcut AND a
   palette/right-click entry. Minimal chrome stays full-power.
5. One source per concern: one insert catalog, one command palette (search +
   find/replace fold in as modes), one tabbed drawer host.
6. Calm by default, power on demand: hover shows a white hairline ring + one grip;
   rulers, box-model bands, diagnostics are opt-in.

## Target architecture: 72 → 9 surface-classes
- **Persistent (3):** slim topbar; LEFT rail (command-dock → StructurePanel +
  one InsertPanel); RIGHT rail (inspector-command-rail 5-tab spine, inspector-dock
  folded in as content host). Both rails already collapse/pin (shipped).
- **Summoned, one-at-a-time (3):** ONE selection chip (section/block/text/multi
  states; absorbs the add-remove rail, class badge, multi-toolbar, text toolbar);
  ONE command palette (context-first); ONE DrawerHost (the 8 doc-level drawers
  behind a segment switcher).
- **Passive canvas feedback (3):** one hover-ring renderer; one handle family
  (shared slate idle + violet guide); one drag-phase set (drop lines + reparent
  badge + ghosts → parametrized pair, violet-tinted).
- **StatusCluster** (bottom-left, floated inset): rulers toggle, zoom/preview pill,
  presence, launch checklist, box-model bands (opt-in).

## Visual system (white-modern)
Extend `kit/tokens.ts` (do not fork). Add explicit chrome-bar tokens (frosted-white
`surface ~92%` + blur, hairline border, `cardHi` shadow) and migrate the navy
call-sites EXPLICITLY — do not blind-flip `chipInk`'s value (navy spans ~28 files;
a value flip would retone unaudited surfaces and make the token name lie). Also
migrate `inspectors/kit/tokens.ts` (its `#3d4f7c` primary-button accent → violet).
Handle tokens: one slate idle + one violet guide reused across resize/move/gap.
Final contract: 1 accent (violet, active/primary only), white/warm-paper surfaces,
hairline borders, card/cardHi/popover shadows; dark ink survives only as text + the
topbar primary CTA. `CHROME_MOTION` tokens (durations + easings) so hover/press/
entrance read the same everywhere.

## Interaction model
- SELECT: violet ring + ONE white chip pinned above the selection; the chip swaps
  CONTENT (never position/palette) by selection type. Never stacks with a separate
  add-remove rail or class badge.
- EDIT: selecting focuses the right rail to the most relevant tab; inspector uses a
  Focus-Mode accordion (only the relevant section expanded). Full power, collapsed
  by default.
- DIRECT-MANIPULATE: resize/move/spacing/gap handles summon on the selection box,
  sharing one slate-idle + violet-guide language; Alt reveals box-model bands.
- COMMAND: ⌘K context-first palette (selection actions → global → go-to-node →
  find/replace); ⌘/ shortcuts; right-click = the same action vocabulary as the chip.
- INSERT: chip "+", between-blocks "+", left-dock Add, and palette "insert" all open
  the ONE InsertPanel pre-scoped to the location.

## Space model
Standing chrome = slim topbar + two thin (collapsible/pinnable) rails only. Canvas
defaults to max width; the DrawerHost overlays without shrinking body width. Full
power preserved by three moves that add zero standing pixels: (1) the right inspector
holds all design depth behind the Focus-Mode accordion; (2) the keyboard layer makes
removing visible buttons remove no capability; (3) the chip carries only the 2-4
highest-frequency verbs and routes the rest to inspector/palette.

## Surface map (decisions, grep-anchored)
| Surface (anchor) | Decision | Becomes |
|---|---|---|
| selection chip block variant (`CHIP_BG` navy, selection-layer.tsx) | rework | ONE frosted-white chip for section + block; delete the scope-flip |
| add-remove rail (`builder-node-canvas-rail`) + class badge (`RAIL_BG`) | merge | into the chip (Add-inside primary + overflow) |
| `multi-selection-toolbar.tsx` (navy) | merge | the chip's multi state; file deleted |
| `canvas-text-toolbar.tsx` (white) | rework | the chip's text-editing state |
| hover rings + grips (3 navy) | merge | ONE white hairline ring + one grip |
| handles resize/move/gap/spacing (#ec407a/#00b8a9/#3d4f7c/#2f4678) | rework | one slate-idle + violet-guide family |
| drop lines ×2 + reparent badge + ghosts ×2 | merge | ONE drop-indicator + ONE ghost, violet |
| zoom pill + preview banner (navy) | rework | frosted-white, into StatusCluster |
| `add-gallery-panel` | keep | the ONE InsertPanel |
| element-library-insert-picker / freeform-insert-popover / between-blocks popover | merge | triggers that open the InsertPanel pre-scoped |
| navigator-panel + freeform-layers-tree | merge | ONE StructurePanel |
| all-pages-panel / brand-quick-panel / search-panel | merge | topbar menus + palette modes |
| `builder-find-replace-overlay` | merge | a palette mode |
| inspector-dock + inspector-command-rail | merge | ONE right rail |
| 8 doc drawers (publish/pageSettings/revisions/theme/assets/collections/schedule/comments) | merge | ONE DrawerHost segment switcher (mutex via `showExclusiveRightRailDrawer`) |
| color-picker (3 mounts) | merge | ONE shared popover |
| rulers/remote-cursors/launch-checklist/edit-pill | merge | bottom-left StatusCluster |

## Phases (ordered for safe rollout)
- **P0 — Retire navy (visual):** chrome-bar tokens; migrate every `CHIP_BG`/`RAIL_BG`
  application site (grep-gated, full ~28-file list incl. `inspectors/kit/tokens.ts`).
  White chip for both scopes. Goldens reseed = owner/CI step.
- **P1 — Handles + calm hover:** one handle palette + violet guide; merge hover
  rings/grips; box-model bands opt-in.
- **P2 — Keyboard/palette/right-click parity FIRST:** context-first palette + the
  full action vocabulary, BEFORE any bar collapses (closes the discoverability hole).
- **P3 — 3 navy rails → 1 white chip:** behind a `NEXT_PUBLIC_BUILDER_*` flag; fixed
  chip geometry (max-width + overflow + edge-flip). Gate on authed real-host QA.
- **P4 — 2 toolbars → chip states:** multi + text toolbars become chip states; keep
  old paths until the flag soaks.
- **P5 — Right side:** DrawerHost segment switcher; StructurePanel merge; Focus-Mode
  (migrate inspector `<details>` → controlled `AccordionSection`, then single-open);
  StatusCluster.
- **P6 — Mobile chrome:** `mobile-edit-panel` + `MobileHealthPanel` adopt the system.

## Guardrails (from the adversarial critique)
- Runtime feature flag for the selection-layer surgery (7,335 LOC, hits 100% of
  selections) → instant prod rollback.
- Per-PR merge gate: "every removed button has a working keyboard + palette +
  right-click entry."
- Authed real-host Chrome QA per phase — the green tsc/lint gate is blind to runtime
  selection behavior; Vercel previews 404 on tenant gating.
- Use grep anchors (constant/`data-edit-overlay`/function names), never line numbers.
- The seven-hex grep returning zero is the literal success gate for P0/P1.

## Success metrics
- Any single selection renders ≤ 3 surfaces (ring + chip + optional handles).
- Zero dark-navy chrome (grep `#242942/#1a1f35/#2f4678/#3d4f7c/#7a6f57/#ec407a/#00b8a9`
  in edit-chrome → only migrated/removed refs).
- Exactly one of each consolidated surface at runtime.
- Every removed visible button has a working keyboard + palette + right-click entry.

## Status (2026-06-20)
Shipped to `main`: rails collapse/expand + per-item pinning; `collections`
drawer-mutex fix; rail-control a11y (contrast/hit-target/focus); UX quick-wins
batch (umbrella `[data-edit-chrome] :focus-visible` ring, violet consistency on
topbar/first-run/AI-brief, preflight skeleton, assets live-tick, collection-delete
two-step confirm, dock press feedback, command-palette entrance animation,
`CHROME_MOTION` tokens, Segmented roving-tabindex, between-blocks popover entrance,
handle active/guide → violet). Remaining program work = P0–P6 above plus the
high-impact items (shared `layoutId` active indicator, unify empty states, route
save states through `SaveChip`, handle idle-hover, full mobile chrome).
