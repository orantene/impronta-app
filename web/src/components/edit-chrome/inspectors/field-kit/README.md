# Inspector field kit

The one control kit for the Style and Content inspectors. Built by lane P1 of
the Inspector Reset; mounted by P2.

The 2026-08-16 audit found, in a single inspector column: **20 different control
patterns** for "pick one of N or set a value", **19 disclosures disguised as
labels**, **7 border radii**, **9 font sizes**, and a parchment/khaki palette
sitting beside a cool one. This kit replaces all of it. Its quality ceiling is
the program's quality ceiling, so the rules below are not suggestions.

---

## The three hard rules

Every primitive here obeys these, and every P2 section built on it inherits
them. If a section needs to break one, that is a kit change with a test, not a
local exception.

### 1. The value is always visible

A preset chip displays what it actually resolves to. Not "M" — **"M" with "24"
under it**. The numbers come from `preset-values.ts`, which mirrors the
renderer's own scales and is guarded by a test that reads `render.tsx` as text
and fails when the mirror drifts.

Nothing is faked to satisfy the rule. A fluid `clamp()` tier shows a **range**
(`21.6-36`), not a made-up single number. The `pill` radius shows no number at
all, because `999px` is a sentinel and not a corner size. The theme-default
option shows nothing, because "whatever the theme says" is the honest answer.

### 2. Custom is always allowed

The exact numeric input sits **beside** the preset chips, never behind a
"Custom value" disclosure. Presets are shortcuts, never ceilings. Clicking a
chip fills the number; typing a number the presets do not own drops the row
into an **explicit** custom state that says so in words, because "no chip is
lit" is not something an operator can read.

### 3. Visual choices are always glyphed

If the property has a look, the control shows the look. Corner radius, border
style, border weight, shadow, divider style: small minimal tiles rendering the
actual result, captioned with label plus value where the value is numeric.
"Solid / Dash / Dot" as three words asks the operator to compile CSS in their
head.

---

## The primitives

### `FieldRow`

The shared scaffold: fixed label column, one label-to-control gap, an
`accessory` slot for override and lock badges, and one hint line. Everything
else renders through it, which is what fixes the ragged left edge.

**A label is a label.** It does nothing when clicked except focus its control.
Progressive disclosure belongs to the *section* (`InspectorGroup` /
`InspectorAccordion`), never to a field's own label. That is D7, and it is the
19-disclosures finding.

Two orientations only: `inline` (label beside, the dense default) and `stacked`
(label above, for controls that need the full width).

**Search registration.** Pass `searchTerms` and the row joins "Find a setting"
with no other wiring — `FieldRow` calls `useInspectorSearchFilter` itself. Any
term matching keeps the row visible, so pass synonyms (`"Corner radius"`,
`"rounded"`, `"border radius"`), not just the visible label. Omitting the prop
falls back to the label when the label is a string; a row with no text at all
opts out of filtering and stays visible, because a control that vanishes from a
search reads to the operator as a control that does not exist.

### `PresetNumberRow`

Rules 1 and 2 in one control: chips carrying their real values, plus the exact
input beside them. Give it a table from `preset-values.ts` and a `FieldValue`.

The numeric input **is** `kit/number-unit.tsx` (`NumberUnit`) — the audit named
it the best control in the codebase, and it already has steppers, the unit
picker, and drag-to-scrub. Do not write a second numeric input; that is how a
kit becomes the 21st pattern instead of the one that replaces 20.

The component holds **no selection state**. Everything is derived from the
value by `preset-state.ts`, so a lit chip cannot end up contradicting the
number next to it.

### `ScaleStepper`

Rule 1 in the width a four-up box has. Minus, a readout, plus — walking the
same `preset-values` table the chips use, and printing the step's name AND its
resolved number ("M · 24") rather than a name on its own. The eight per-side
padding/margin fields use it; they were the only spacing controls in the panel
with no scale in sight.

It carries no exact input of its own: the group that owns the four sides shows
ONE "Exact values" expander for the whole box (`style-panel/exact-spacing-
sides.tsx`), which is rule 2 honoured once per box instead of four half-width
numeric inputs. That expander OPENS ITSELF whenever a side already holds a
length the scale does not own, so an existing hand-authored design shows its
real numbers on arrival. A value off the scale is never re-lit as the nearest
step and never rewritten on mount.

### `GlyphTiles`

Rule 3. A radiogroup of tiles, each with a glyph slot and a caption. Ships the
glyph set as small pure-CSS/SVG components: `CornerRadiusGlyph` (bends by the
real radius), `LineStyleGlyph` (none/solid/dashed/dotted), `BorderWeightGlyph`,
`ShadowGlyph` (wears the literal `box-shadow` it offers), `DividerGlyph`.

Use `radiusTileOptions()`, `lineStyleTileOptions()`, `shadowTileOptions()` to
turn a preset table straight into tiles rather than hand-assembling glyphs per
section.

### `ChoiceRow`

For one-of-N where text is enough. A thin wrapper over the existing `Segmented`
that adds a **policy**: horizontal only, **max 5 options**, never allowed to
wrap into a grid or collapse into a listbox. `Segmented`'s `fullWidth` auto-fit
grid mode is deliberately not forwarded — that mode is how one segmented
control silently becomes a three-row grid while its neighbour stays a row.

Violations warn in development and are covered by a test (including the
negative case: six options must fail).

---

## Which primitive when

| The field is… | Use |
|---|---|
| A size, spacing, radius, or any number with a preset scale | `PresetNumberRow` |
| The same, in a cell too narrow for chips (a four-up box) | `ScaleStepper` |
| A choice whose options have a **look** (radius, border, shadow, divider) | `GlyphTiles` |
| A choice of **at most 5** options where text says it all | `ChoiceRow` |
| More than 5 text-only options | Not this kit. Use a select, and reconsider the field. |
| Anything else with a label and a control | `FieldRow` + the control |

---

## Rules the tests enforce

- No parchment (`#faf9f6` `#f3f0e8` `#fdfcf9` `#f8f7f2`) and no khaki
  (`#cfc7b6` `#b3a892`). This kit is the beachhead of the palette retirement:
  every section P2 rewrites leaves that palette behind for good.
- No gold, rust, or amber. Owner rule, also enforced repo-wide by
  `no-gold-rust-chrome.static.test.ts`.
- Exactly three font sizes; exactly one border color; radii only from
  `CHROME_RADII`.
- No second numeric input.
- Preset tables match the renderer.
- Every user-facing string ships its Spanish entry in the same commit.
