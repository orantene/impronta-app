# Marathon findings — "Easy to design" + first-run (Easy 85 → finding the last 15)

Audited against the canonical worktree `/Users/oranpersonal/Desktop/impronta-builder-marathon`
(clean `origin/main`, HEAD `fa830022d`). All claims cite real files + lines.

## TL;DR

The blank-to-page on-ramp is genuinely good and recently leveled up: **11 one-click
full-page designs** (`page-designs/summaries.ts`) sit at the top of the empty canvas,
**10 section-kit recipes** below, a searchable/categorized template gallery, a real
governed add-block palette with search + categories, undo/redo that survives F5, and a
forgiving "click any section to edit" first-paint tip. That's why Easy is 85, not 60.

The missing 15 is **not** "add more templates." It's three things, in order:

1. **The blank-tenant on-ramp is excellent; the *next 5 minutes* are not coached.** Once a
   design is applied, a non-designer is dropped into a 200-node freeform tree with a Layers
   panel, an Outline tab, a Classes tab, a Style inspector — and *zero* progressive guidance
   about what to touch first. The only coaching is a single dismissable pill ("Click any
   section to edit it", `edit-shell.tsx:1255`). There is no "here are the 3 things to
   personalize" checklist, no "edit your headline / swap this photo / set your brand color"
   nudge. The first-run gallery is 9/10; the **second-run editing loop is ~6/10** for a
   non-designer.
2. **Classes are a discoverable dead-end that erodes trust** — the Classes tab is fully
   visible to everyone, but classes are `localStorage`-only (`navigator-panel.tsx:4042-4072`)
   and **do not publish**. A non-designer who finds the tab, creates a class, and publishes
   gets nothing on the live site. This is the single worst "easy" violation because the
   product actively invites the action and then silently fails it. (Already flagged in the
   audit's unresolved item #4 — re-confirming it lands squarely in the Easy bucket too.)
3. **First-run copy over-promises plan limits in a way that's both inconsistent and
   self-defeating.** The empty canvas shows all 11 premium full-page designs to every plan
   and `applyPageDesignToHomepage` has **no plan gate** (`page-design-apply-action.ts` —
   only `requireStaff`), yet the footer copy says "Free includes one starter design. Upgrade
   to Studio for the full gallery" (`empty-canvas-starter.tsx:769-774`). Meanwhile the
   *section kits* below ARE gated to one tile on Free. So the same screen tells a Free user
   "you get one" while showing+enabling eleven. Confusing, and it accidentally trains users
   to distrust the upgrade copy.

---

## What a tenant actually sees, blank → page (current state, with refs)

1. **Enter edit mode.** Live storefront shows a floating "Edit" pill bottom-right
   (`edit-pill.tsx`); form-based so it works pre-hydration. Good. Deep-link `/?edit=1`
   auto-engages.
2. **Blank homepage → `EmptyCanvasStarter`** (`agency-home-storefront.tsx:220`, gated to
   zero-section homepages). Card reads "Start with a design." Three tiers, top to bottom:
   - **11 full-page designs** (`PAGE_DESIGN_SUMMARIES`) rendered as cards with archetype
     gradients + "Use this" (`empty-canvas-starter.tsx:550-617`). One click bakes the whole
     tree into the draft (`page-design-apply-action.ts`). This is the headline 2026 feature
     and it's strong.
   - **Section kits** (`STARTER_TEMPLATE_TILES`, 10 of them, `empty-canvas-starter.tsx:118-335`)
     — wireframe tiles → open the gallery modal.
   - **"Start from scratch"** → inserts a single `hero` section
     (`addEmptyCanvasHeroAction`, `starter-action.ts:856`).
3. **Template gallery modal** (`StarterTemplateGalleryModal`) — search + 6 category chips +
   "Home core" filter + per-tile preview panel with section-order list + source-kind badges
   (Live data / Navigation / Starter). Genuinely premium for a "pick a starter" surface.
4. **First-paint tip** (`edit-shell.tsx:1174`) — one pill, "Click any section to edit it",
   auto-dismisses on first hover/select, session-scoped.
5. **Editing chrome**: Layers/Outline/Classes navigator, inspector dock, inline editor,
   canvas insert affordances, undo/redo, command palette, shortcut overlay.

---

## Ranked friction (the last 15)

### 1. [HIGH] No "now personalize this" guidance after a design lands — the editing cliff
The whole first-run investment funnels a non-designer into applying a full-page design, then
abandons them. After apply, the *only* coaching is the generic "Click any section to edit it"
pill. There is no:
- "3 things to make this yours" checklist (headline, hero photo, brand color, CTA link),
- any pointer to the Theme drawer (where brand color/fonts live — `topbar.tsx:2062` "Theme"),
- any "replace the demo photos" nudge (designs ship with stock photography via
  `pageDesignPhoto(...)`, e.g. `coach.ts:38-42` — a non-designer may not realize the smiling
  stranger is a placeholder, which directly trips the user's documented "#1 acceptance
  blocker: imagery reads as unfinished").

A non-designer's mental model after "Use this" is "great, now what?" — and the editor answers
with a wall of equally-weighted chrome. **Root cause:** first-run effort is 100% concentrated
in *selection* (`empty-canvas-starter.tsx`) and 0% in *first-edit*. Impact: the single biggest
gap between "I picked a nice template" and "I made something premium fast."
*Fix:* a lightweight, dismissable post-apply checklist (3-4 steps, deep-linking to
headline-edit / Theme / Assets), keyed off "a design was just applied" (the
`impronta:starter-applied` event already fires, `empty-canvas-starter.tsx:474`).

### 2. [HIGH] Classes tab is a published-trust trap (Easy + Premium-feel)
`ClassManagerPanel` (`navigator-panel.tsx:4090`) is always visible as the 3rd nav tab
(`navigator-panel.tsx:1526`). Its empty state coaches the user to *go make a class*
("Select a block… open the Style tab… 'Create class from this block'", lines 4195-4197). But
the entire class registry is `localStorage`, keyed `tulala:builder:style-classes:v1:<pageId>`
(`navigator-panel.tsx:4042-4072`), and the doc-comment itself admits "syncing the class
registry into the persisted page snapshot" is **deferred** (lines 4086-4088). So: classes
don't survive a different browser, don't survive cache-clear, aren't visible to a teammate,
and **do not publish**. A non-designer who follows the in-product instruction ships nothing.
*Impact:* worse than a missing feature — the product invites the action then silently fails it.
*Fix (trust-first, cheap):* until publish exists, label the tab honestly ("Classes (editor
only)") + a one-line banner in the panel ("Classes are saved to this browser and don't appear
on your live site yet"). Real fix is persisting classes into the page snapshot + render path
(`render.tsx` already threads a `styleClasses` option, line 3207 — the render side is ready;
the *authoring/persist* side is the gap).

### 3. [HIGH] First-run plan copy is inconsistent and under-sells generosity
Empty canvas shows **all 11** full-page designs to everyone and the apply action is ungated
(`page-design-apply-action.ts` has only `requireStaff`/`requireTenantScope`, no plan check),
yet:
- footer says "Free includes one starter design. Upgrade to Studio for the full gallery"
  (`empty-canvas-starter.tsx:769-774`), and
- the **section kits** right above ARE filtered to `free-quickstart-5` only on Free
  (`empty-canvas-starter.tsx:424-432`, `allowedSlugs` default `new Set(["free-quickstart-5"])`).

So one screen simultaneously: (a) gives a Free user 11 premium designs for real, (b) tells
them they get one, (c) gives them one section-kit. A non-designer can't reconcile this; it
reads as broken or dishonest. *Fix:* make the copy match reality (full-page designs are the
free on-ramp — say so), or actually gate them. Either is fine; the current mixed signal is the
problem. Low effort, pure-copy + one conditional.

### 4. [MEDIUM] "Start from scratch" produces a bare hero with no momentum
`addEmptyCanvasHeroAction` (`starter-action.ts:856`) inserts a single `hero` section and
returns. For a non-designer who clicked "Prefer to build block by block?"
(`empty-canvas-starter.tsx:686-746`), the result is one section and a now-empty card — they're
back to the same "now what?" with even less scaffolding than the templated path. The coaching
text points at "+ Add block" lines and "the Layers panel" but doesn't *show* them; the add-block
affordance only appears on hover between sections. *Impact:* the scratch path is the least
forgiving entry and gets the least guidance. *Fix:* after the hero lands, auto-open the
between-blocks insert OR surface a transient "add your next block" affordance; or drop the
scratch path's prominence (it's the power-user route, not the non-designer route).

### 5. [MEDIUM] Outline vs Classes vs Layers — three peer tabs, no explanation of when to use which
The navigator's segmented control gives equal visual weight to "Layers", "Outline", "Classes"
(`navigator-panel.tsx:1526-1559`). For a non-designer:
- "Outline" (heading hierarchy / a11y view) and "Classes" (CSS-class reuse) are *advanced*
  concepts shown at the same altitude as the core "Layers" tree.
- There's no tooltip/affordance explaining what Outline or Classes are *for*. Outline silently
  shows the heading skeleton; Classes shows "No style classes yet" with jargon.
*Impact:* cognitive load + the impression that the tool is "for developers." *Fix:* either
demote Outline/Classes behind a "more" affordance, or add one-line hover descriptions; Classes
especially should not be a top-level peer until it publishes (see #2).

### 6. [MEDIUM] Template gallery still self-describes as a prototype
The gallery modal header copy reads: "Wireframe starters for the future template marketplace.
Today they use the existing section seeding action; later each card can become a full
saved-template preview…" (`empty-canvas-starter.tsx:929-933`). This is internal roadmap voice
leaking to the operator. A non-designer reads "wireframe starters for the future marketplace"
and concludes the feature is half-built. *Impact:* erodes the premium feel of an otherwise
polished surface. *Fix:* replace with confident product copy ("Start from a proven layout for
your industry"). Trivial.

### 7. [MEDIUM] Template previews are monochrome wireframes, not the real design
Every starter tile + the preview panel render a gray `Wire*` SVG skeleton
(`WireClassic/WireEditorial/WireStudioMinimal`, used at `empty-canvas-starter.tsx:646-647`,
`1076`, `1236`). The 11 full-page designs at least have archetype-tinted gradient cards, but
those are also abstract (no actual screenshot). A non-designer picks a template by *what it
looks like*, and here they're choosing between gray wireframes + named gradients. This directly
contradicts the user's documented rule "prototypes need real imagery, not placeholder boxes."
*Impact:* the selection step looks less premium than the result, and choice is harder than it
should be. *Fix:* real thumbnail renders (even static PNGs) for the full-page designs and the
top section kits.

### 8. [LOW] No empty-state defaults preview for a freshly-inserted plain element
When a beginner drops a bare element (Heading, Button, Container) from the palette
(`element-library-insert-picker.tsx`), the registry inserts it with minimal defaults. The
curated *sections* and full-page designs ship beautiful copy/photos, but a hand-inserted
`heading`/`paragraph` lands as unstyled lorem with no design intent — the non-designer sees the
gap between "template-quality" and "what I can make by hand" immediately. *Impact:* discourages
hand-building (which is fine — push them to templates), but worth knowing the palette path is
the un-premium one. *Fix:* richer insert defaults, or steer beginners to section embeds (the
`Tulala` category — 11 dynamic presets, `section-embed-presets.ts:47`) which are far more
"premium by default."

### 9. [LOW] Forgiveness is strong but invisible to a non-designer
Undo/redo is genuinely good — 50-deep, `localStorage`-persisted per page, survives an
accidental F5 (`edit-context.tsx:2165-2183`, `undoPersistKey`). The full-page design apply is
also non-destructive (draft only, "Nothing publishes until you click Publish",
`page-design-apply-action.ts:14-16`). **But** a non-designer doesn't know any of this. There's
no "you can always undo" reassurance at the moment of a big destructive-feeling action (applying
a design over work, deleting a section). The gallery's `confirmOnApply` review dialog
(`empty-canvas-starter.tsx:1305-1319`) exists for the *engaged* editor but the blank-canvas
path applies instantly with no "you can undo" note. *Impact:* the tool is more forgiving than it
feels; surfacing it would lower the fear that stops non-designers from experimenting. *Fix:*
a tiny "Undo" affordance in the post-apply toast.

---

## What's genuinely good (don't regress — and don't rebuild)

- **One-click full-page designs** (`page-designs/summaries.ts` + apply action) — the single
  best "easy" feature; 11 archetypes, real copy, real photos, repeaters baked.
- **Governed add-block palette** — search + category grouping + a real hover/press affordance,
  per-variant tones, empty-state with "Clear search" (`element-library-insert-picker.tsx`).
- **Template gallery UX** — search, category chips with counts, Home-core filter, sticky
  preview panel with section-order list and source-kind badges.
- **Undo/redo durability** — Figma-class (50 deep, F5-proof).
- **First-paint tip** — minimal, auto-dismissing, brand-toned (not another black void box).
- **Non-destructive apply** — designs and kits land in draft; publish is the only commit.

## Sequencing note
All of this is **UI/copy/coaching layer** work that lives in `empty-canvas-starter.tsx`,
`navigator-panel.tsx` (Classes tab labeling), `edit-shell.tsx` (post-apply checklist), and the
plan-copy conditionals — it does **not** touch `edit-context.tsx` core state or `render.tsx`.
It therefore **parallelizes cleanly** with the Fast/re-render workstream (Sub-step E) and the
section-embed SSR work. The one item with a backend tail is #2 (Classes publish), which needs a
persist path into the page snapshot — but the cheap honesty-labeling half ships immediately and
independently. Recommend Wave 1 (parallel, no shared core files) for #1/#2-label/#3/#6, with
#2-persist deferred to whoever owns the snapshot/render contract.
