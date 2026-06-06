# Capability Gaps Audit

**Area:** capability-gaps  
**Date:** 2026-06-05  
**Current score context:** Capability 86/100 — audit to scope the remaining 14 points across three specific gaps. Do LAST: Fast and Feel must come first.

---

## Framing

All three gaps are real but none is blocking daily work at the current score. The correct sequencing is: (1) Fast — eliminate whole-editor re-renders (Sub-step E); (2) Feel — Classes publish path, undo soul, premium paint; (3) only then Capability here. Adding capability before Feel inflates the score on paper while users still experience the editor as "not quite a program."

---

## Gap 1 — Custom Breakpoints Beyond Desktop / Tablet / Mobile

### Current state

The breakpoint system is hardcoded to exactly three tiers: `desktop`, `tablet` (≤1023px), `mobile` (≤640px). This is locked at four distinct layers:

- **Schema** (`web/src/lib/site-admin/sections/shared/presentation.ts` line 170–175): the `breakpoints` Zod object has only two optional keys: `tablet` and `mobile`. No additional key is accepted.
- **CSS** (`web/src/app/token-presets.css` lines 633, 677): two hardcoded `@media (max-width: 1023px)` and `@media (max-width: 640px)` blocks with data-attribute rules. No mechanism to emit a third media query at an arbitrary pixel value.
- **Inspector** (`web/src/components/edit-chrome/inspectors/responsive-panel.tsx` lines 814–820): the `BreakpointSwitcher` renders a fixed three-item array: `[desktop, tablet, mobile]`. `EditDevice` type (`edit-context.tsx` line 164) is a literal union `"desktop" | "tablet" | "mobile"`.
- **Preview frame** (`web/src/components/edit-chrome/topbar.tsx` lines 1163–1167): `VIEWPORT_NATURAL_WIDTHS` maps only those three keys. The custom-width input (`widthPx`) changes the canvas preview frame width but does NOT change the CSS media query thresholds or which breakpoint bucket the inspector edits. It is a preview-only tool, not a new breakpoint.

### What is missing

A genuine 4th breakpoint (e.g. "Large desktop" at 1440px, or "Laptop" at 1280px) requires:

1. Widening the Zod schema to accept an arbitrary `Record<string, BreakpointOverride>` or a typed 4th key.
2. Generating a runtime `<style>` block (or additional token-presets.css `@media` block) for the operator-defined threshold.
3. Extending `EditDevice` or replacing it with a dynamic type, which will cascade into every consumer of `useEditContext` (`device`, `setDevice` — 38 components).
4. Updating the `BreakpointSwitcher`, the `ResponsivePanel`, the `BuilderNodeStyle` responsive bucket keys (`responsive.tablet`, `responsive.mobile`), and the cascade in `cleanBuilderNodeStyle`.

The cascade is wide. Changing `EditDevice` from a 3-way literal to a dynamic type is a significant refactor with risk of silent breakage in the selection layer, mobile-edit mode, and the inspector's breakpoint-tab locking.

### Effort

**L** — Schema + CSS generation + EditDevice cascade across 38 consumers. The custom-width preview input (`widthPx`) already exists as a preview-only workaround and satisfies most real use cases. Operators who need to inspect a specific viewport can type any pixel value into the W field in the topbar.

### Slot

After Fast (Sub-step E) and after Feel (Classes publish + undo soul). The `widthPx` preview workaround is sufficient for nearly all real agency workflows. Custom breakpoints are a power-user feature; defer until the score plateau post-Feel work.

---

## Gap 2 — Visual Pickers for Spacing / Typography / Color vs Raw Inputs

### Current state

**Color:** Well covered. A `ColorPickerPopover` component (`web/src/components/edit-chrome/kit/color-picker.tsx`) provides a native HSL surface, eyedropper (Chromium), hex echo input, theme-token swatches, and recent-colors strip. It is wired to all three freeform node color fields (text, fill, border) via the `nodeColorField` / `roleColorField` pattern (`style-panel.tsx` lines 3480–3491, 5548, 6599). Color is not a gap.

**Typography — partial coverage:**  
- Font family: `GoogleFontPicker` inline panel (style-panel.tsx line 5143), toggled by a "Change" button. Adequate.
- Font size: `NumberUnit` with `units={["px"]}` (style-panel.tsx line 5160). A stepper + unit picker, reasonable.
- Line height: `NumberUnit` with `units={["%"]}` (style-panel.tsx line 5179). Reasonable.
- Letter spacing: `NumberUnit` with `units={["px"]}` (style-panel.tsx line 5205). Reasonable.
- Font weight: `Segmented` chip row (line 5228). Good.
- **Gap:** the curated-role Typography panel (the "section presentation" path, lines 4680–4745) uses bare `<input type="number">` fields for `fontSizePx`, `marginTopPx`, `marginBottomPx`, `letterSpacingPx`, `lineHeightPct` instead of `NumberUnit`. These have no stepper buttons, no unit label, and no keyboard arrow-key increment. They are visually consistent with the surrounding chrome but are less discoverable than the freeform-node equivalents.

**Spacing — gap:**  
The curated-role spacing section (style-panel.tsx lines 4680–4845) uses plain `<input type="number">` fields. Eight separate inputs for margin top, margin bottom, margin inline, margin left, margin right, padding top, padding bottom, padding inline, padding left, padding right — all raw number boxes with no visual reference to the box model. There is no spacing diagram (the "Figma / CSS box-model widget" that shows margin outside, padding inside) and no linked/unlinked lock. The `NumberUnit` control from the freeform-node path is NOT reused here; the curated path duplicates its own plain inputs.

The freeform BuilderNode standalone style path (which uses `NumberUnit`) is better than the curated-role path (which uses `<input type="number">`), but neither path has a box-model diagram that makes spatial relationships legible at a glance.

### What is missing

1. **Spacing box-model widget** — a CSS-box diagram showing margin (outer) and padding (inner) sides with linked/unlinked corner controls. This is the single highest-leverage addition: it lets operators understand what they are editing without counting inputs. Used by Figma, Webflow, Framer.
2. **Curated-role inputs upgraded to `NumberUnit`** — replace the eight bare `<input type="number">` fields in the curated path's spacing section with the `NumberUnit` component already in the kit. Low-risk, follows the freeform-node pattern.
3. **Typography scale slider** — a visual font-size slider (not a blocker; the stepper already works).
4. **`StateStyleFields` color pickers** — the hover/focus/active state fields (`StateStyleFields` component, lines 703–837) use raw text inputs for background, text color, and border color rather than the `ColorPickerPopover`. This is inconsistent with the primary color row which has the swatch picker.

### Effort

- Box-model diagram: **M** — new pure-UI component, no schema changes, slot into the existing patch path. About 200 lines of self-contained SVG + interaction logic.
- Upgrade curated inputs to `NumberUnit`: **S** — mechanical replacement, `NumberUnit` is already in the kit.
- `StateStyleFields` color pickers: **S** — wire `ColorPickerPopover` into the three fields following the existing `nodeColorField` pattern.

### Slot

After Fast but overlapping with Feel. The `NumberUnit` upgrade (S) can land with Feel work as a polish item. The box-model diagram (M) slots after Feel is done.

---

## Gap 3 — Full Image Crop UI

### Current state

`ImageCropModal` (`web/src/components/edit-chrome/image-crop.tsx`) exists and is wired. It provides:

- Aspect presets: Free, 1:1, 4:3, 16:9 (lines 44–49)
- Drag-to-move the crop rect inside the image frame
- Four corner resize handles (nw, ne, sw, se) with aspect-lock
- Rule-of-thirds grid overlay
- Dark scrim outside the crop area
- Canvas crop → PNG → new asset (non-destructive)
- Error handling for cross-origin / canvas failure
- Entry point: "Crop" button on each raster image tile in the Assets drawer (`assets-drawer.tsx` lines 910–938)

The modal itself is at `min(640px, 100%)` wide which is adequate for desktop use.

### What is missing

The code's own docstring at line 17 lists the deferred items:

1. **No zoom/pan inside the crop stage.** The image is rendered `object-fit: contain` at the modal's natural size. If the image is very large (e.g. 4000×3000 source) the working area is still 480px at most (modal minus head/foot). Operators cannot zoom into a precise region, and there is no scroll/pan within the stage. This is the P1 gap: fine-detail crops (faces, small logos) are imprecise.

2. **No crop-coords persistence.** Crop coords are not saved back to the asset row (no `crop_coords` column in `media_assets`). The crop creates a new permanent PNG on every use. If the operator changes their mind they cannot "re-crop from the original" — they must find the original asset and re-open it. Non-destructive writes land a new file each time, which will accumulate in the media library.

3. **No keyboard-nudge for handles.** The four corner handles are pointer-only. Precision adjustment requires holding shift during drag (not implemented — all drag is free movement within the aspect constraint).

4. **No flip / rotate.** Common operations (rotate 90°, flip horizontal for a mirrored shot) are absent. Minor absence.

5. **No mid-editor focal-point setter.** The crop is currently accessible only from the Assets drawer, not from the canvas image inspector (when an image node is selected and the right panel shows). This means operators must navigate away from their in-canvas selection to crop.

### Effort

- **Zoom/pan inside stage**: **M** — add a `scale` state + pointer-based pan with bounds clamping, update the display-to-source pixel mapping to account for the zoom. The coordinate math in `handleSave` (lines 333–377) would need to account for the stage-zoom transform. ~150 lines.
- **Crop-coords persistence**: **M** — requires a Supabase migration to add `crop_coords jsonb` to `media_assets`, a server action to update it, and a "re-crop from original" flow in the drawer. Also needs a "clear crop" affordance.
- **Keyboard nudge**: **S** — listen for arrow keys while a handle is "focused", move the rect by 1px or 10px with Shift.
- **Focal-point in canvas inspector**: **S** — add a "Crop" button to the image node's style panel that opens the same modal, following the assets-drawer pattern.

### Slot

**After Fast and Feel.** The current crop UI is functional and covers the common case (aspect-ratio crop for a hero image). The gaps are polish and power-user needs. Zoom/pan (M) is the one item with real daily friction for agencies whose photographers deliver high-res files.

---

## Summary Table

| Gap | Severity | Effort | Slot |
|---|---|---|---|
| Custom breakpoints (4th+) | low — workaround exists via `widthPx` | L | Post-Feel |
| Spacing box-model widget | medium — operators count inputs | M | Overlaps Feel |
| Curated inputs → NumberUnit | low — polish inconsistency | S | With Feel |
| StateStyleFields color pickers | low — inconsistency | S | With Feel |
| Crop zoom/pan | medium — precision gap | M | Post-Feel |
| Crop coords persistence | low — accumulates assets | M | Post-Feel |
| Keyboard nudge for crop handles | low | S | Post-Feel |
| Focal-point entry from canvas | low | S | Post-Feel |
