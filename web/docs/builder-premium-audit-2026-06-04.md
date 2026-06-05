# Page Builder — Premium Experience Audit (2026-06-04)

**Goal:** make the freeform page builder feel like a *native program in the browser* — **fast, lean, clean, easy to design.**

## Verdict — **~60 / 100** for "premium feel"
A genuinely **capable engine** wrapped in an **unfinished cockpit**. The style model rivals Webflow; direct-manipulation (resize handles, align/distribute guides, marquee, ⌘C/⌘V/⌘D) is premium-tier. But it **doesn't feel premium yet** because: (1) it's **slow on prod** — a full server round-trip on every edit; (2) the most "native-program" features (command palette, shortcuts) are **hidden**; and (3) there are **real dead controls**.

| Dimension | Score | One-line |
|---|---|---|
| **Fast** (performance) | **34** | Server round-trip + whole-page re-SSR on *every* edit; O(N²) drag scans; 143-consumer context. |
| **Easy to design** (features) | **84** | Deep style engine + 25 blocks; gaps: forms, custom breakpoints, visual pickers. |
| **Clean / premium feel** (UX) | **78** | High-craft parts, but palette hidden, one panel has 4 names, toolbars overloaded. |
| **Lean** (bundle/arch) | — | ~56k LOC of edit-chrome ships eager; drawers not lazy. |

---

## ⚡ The two "dead icons" — found
1. **Collapsed Navigator rail — pencil (SquarePen) + "Saved" (Bookmark)** both just call `toggleNavigator` — no edit view, no saved view exists. `navigator-panel.tsx:1204,1207`. → wire to real actions or remove.
2. **On-canvas block toolbar — the pencil ("Edit")** is a no-op for every **non-text** block (image/divider/spacer/icon/embed): it fires a synthetic dblclick that finds no text target. `selection-layer.tsx:6005` → `:2785`. → hide/disable Edit when the block has no editable text, or route it to open the inspector.

---

## FAST — performance (the lag) · score 34
- **P0-1 · Server round-trip per edit.** `router.refresh()` after every mutation re-runs the entire `force-dynamic` page (loadPageForRender + JSON-LD RPC + HomepageCmsSections + service-role Supabase reads for talent/homepage/media). 300–900ms on prod, per edit. `edit-context.tsx:1738/3414/3858`, `inspector-dock.tsx:525`. **→ render the canvas CLIENT-side from the in-memory `builderTree`; `router.refresh()` becomes rare (conflict/publish only).** This is the single biggest leap.
- **P0-2 · `dragover` O(N²) layout thrash every frame.** `collectCanvasDropCandidates` (`selection-layer.tsx:362`) rebuilds from scratch each `onDragOver` frame: `querySelectorAll` + a `getBoundingClientRect` per node + N² `contains()` + tree-walk. ~40k checks/frame on a 200-node page. **→ snapshot a rect index + `Map<id,node>` once at drag-start, reuse across the gesture; recompute only on scroll.**
- **P0-3 · 200-key context → ~143 consumers re-render every edit.** `value` useMemo (`edit-context.tsx:5721`) deps include `slots`/`builderTree` (new refs each mutation) + `saving` (flips twice/keystroke) + hover ids. **→ split context (stable dispatch vs volatile state) or external store + selectors; move hover state out of the global value.**
- **P1-4 · Two full-tree `JSON.stringify` + two deep clones per commit.** `edit-context.tsx:3874/3882` change-detect + history. **→ structural-sharing diff; store undo as inverse patches, not whole-tree clones.**
- **P1-5 · `persistBuilderTree` PUTs the entire tree per edit.** `edit-context.tsx:3782`. **→ granular ops + debounce/coalesce.**
- **P1-6 · `render.tsx` zero `React.memo`** — fine while server-only, but mandatory once we client-render (else network lag → render lag). **→ memoize each node by immutable identity.**
- **P2-7 · Selection/hover rect recompute scans the document** (`selection-layer.tsx:702/774`); hover lives in global context so mouse-move re-renders the whole editor. **→ cached rect map; hover state local to the overlay.**
- **P2-8 · Synchronous `localStorage.setItem(JSON.stringify(history))` on the commit path.** `edit-context.tsx:2123`. **→ debounce off the hot path.**
- **P2-9/10/11 · Marquee re-scans all nodes; `reconcileBuilderTreeFromSlots` stringifies per-child 2–3×/mutation; id-maps rebuild on every tree ref change.**

**Architecture target:** client-rendered view of an immutable tree (structural sharing) → op-based store with selector subscriptions → debounced granular patches in the background → all DOM rect scans cached per layout. Kills network lag, wide re-renders, and per-frame thrash together.

## LEAN — bundle · 
- **P2-12 · ~56k LOC of `edit-chrome` ships eager** as client JS; drawers (assets/comments/theme/revisions/templates) + command palette are statically imported into the always-mounted shell. **→ `next/dynamic` open-on-demand surfaces; code-split inspectors.** Cuts editor TTI.

## CLEAN / PREMIUM FEEL — UX · score 78
- **P0-1 · Command palette (⌘K) + shortcut overlay (?) are invisible** — zero launcher anywhere. The most "native-program" feature is undiscoverable. **→ add a ⌘K pill + ? glyph to the topbar.** *(highest-leverage, cheap)*
- **P0-2 · One panel, four names** — "Navigator" (header) / "Layers" (rail+tab) / "Structure Navigator" (aria) / "Structure list" (inspector empty-state tells users to click something that isn't labeled that). **→ pick ONE word ("Layers") everywhere.**
- **P1-3 · Block toolbar = 9 same-weight icon-only buttons.** Copy vs Duplicate confuse; 4 arrows (move/add ×2) unparseable; destructive Delete flush in-row. **→ keep ~4 primary (Edit/Add/Duplicate/Delete) on the chip, demote the rest to the right-click menu, divider before destructive.**
- **P1-4 · Inline text edit is double-click-only with no hint** (images advertise "Replace" on hover; text doesn't). **→ hover affordance / tooltip on editable text.**
- **P1-5 · Inline-edit failure punts to "the inspector"** when a text value is duplicated/unmatched. **→ highlight candidates on-canvas, or auto-open the right field.**
- **P1-6 · Drawer mutex** — opening any panel slams every other shut; can't keep Theme/Assets open while editing. **→ let right-rail drawers coexist with the inspector.**
- **P2-7..12 · Topbar overload (~14 targets); mobile editing is an amber warning wall; 3 concurrent save/publish signals; "Reset position" is leftmost jargon; no onboarding for populated pages; inspector fixed-380px icon-only tab rail.**

## EASY TO DESIGN — feature gaps · score 84 (capability ~90)
- **P0-1 · No Form / input node** — only curated `section_embed` CTAs; can't build a custom lead/newsletter/contact form. Highest-impact missing primitive for a marketing-site builder. `builder-node/types.ts`, `registry.ts`.
- **P0-2 · Custom breakpoints impossible** — `responsive` is hard-coded `{tablet, mobile}` only; no large-desktop / custom widths. The biggest responsive ceiling.
- **P0-3 · Two style systems** — curated sections expose only **6** responsive fields vs freeform's full ~200-prop model under the same "Style/Responsive" tab names. **→ unify section editing onto the freeform style engine.**
- **P1-4 · Color picker** lacks eyedropper / recent+saved swatches / palette-from-image.
- **P1-5 · Raw-CSS text inputs** for high-value props (backgroundImage, clipPath, filter, gridTemplateColumns, focal point) instead of visual pickers — powerful but not "easy."
- **P1-6 · Motion is entrance-only** — no scroll/click/loop interaction timeline.
- **P1-7 · Media library image-only** — Videos/Documents are placeholders; no crop UI; no stock.
- **P1-8 · Data binding roster/collection-only** — no external CMS/API/products.
- **P2-9/10/11 · No find-replace / class-manager surface; only 8 starter designs, no template marketplace; free-drag positioning is escape-hatch, not a mode.**

## FIX — bugs / dead controls
- **P1 · "Discard draft" menu item is a logging stub** — clicks do nothing, no toast. `topbar.tsx:2595`.
- **P1 · Pin/Reset reload no-op (magnet-dock, parked)** — `savedWorkspaceLayout` seeded from SSR-null lazy state, never re-reads localStorage on mount; also leaves topbar **Reset wrongly disabled** on reload. `edit-context.tsx:2342`.
- **P2 · featured-talent / category-grid "+ Add secondary button"** renders a live editor whose keystrokes are silently discarded (`onChangeSecondary={()=>{}}`). `cta-duo-editor.tsx:169`.
- **P2 · `revisions-diff-panel` diff load has no `.catch`** → stuck-forever spinner on RPC reject. Also `BrandKitImport`, `comments-drawer` mutations lack try-catch.
- (separate) **talent-link 404** — `/t/CODE-CODE` doubled — fix in PR #251.

---

## Recommended execution order (localhost-first, verify each)
1. **Quick wins / trust (½ day):** the 2 dead icons; command-palette ⌘K launcher + ? overlay; unify panel name → "Layers"; remove/implement "Discard draft"; fix the "+ Add secondary" silent-loss. → instantly *feels* more finished.
2. **The lag — phase A (contained):** cache the drag/marquee/selection rect scans (P0-2, P2-7/9); debounce localStorage + saves (P2-8, P1-5). Real relief without touching the render model.
3. **The lag — phase B (the leap):** client-render the canvas from the in-memory tree + `React.memo` nodes + split the context/store (P0-1, P0-3, P1-6). Kills the prod round-trip lag. Biggest, most careful piece — profiled + verified on localhost.
4. **Lean:** `next/dynamic` the drawers + palette (P2-12).
5. **Easy-to-design:** Form node (P0-1), unify section/freeform style engine (P0-3), visual pickers for the top raw-CSS props (P1-5), custom breakpoints (P0-2).

Scores to beat after: Fast 34→80+, UX 78→90+, overall ~60→~85.
