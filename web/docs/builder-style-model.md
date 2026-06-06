# Builder Style Model — the canonical one-page reference (W4-T5)

**Status:** canonical. Written for the Builder Marathon Wave-4 "collapse the dual
style engines" work. Read this before touching any styling code in the builder.

The builder has **one element-style model** and **one section-frame config**.
Historically it grew **two** element-style vocabularies; this doc names the
canonical one, explains why the second still exists, and pins the exact cascade
order so renders stay deterministic.

---

## 1. The three styling channels (what each one owns)

| Channel | Type | Scope | Length convention | Emitter | Where it binds |
|---|---|---|---|---|---|
| **Engine A — `BuilderNodeStyle`** (CANONICAL element model) | `web/src/lib/site-admin/builder-node/types.ts` | A freeform builder NODE (and, via the bridge, a curated section role) | **CSS strings** (`"740px"`, `"1.2"`, `"3rem"`, `clamp(…)`) + a few enum tokens (`align`/`size`/`tone`) | `sharedNodeStyle` (`render.tsx`) | every freeform node; the inspector's freeform branch |
| **Engine B — `NodePresentationValue`** (curated element overrides) | `web/src/lib/site-admin/sections/shared/node-presentation.ts` | A **role** inside a curated section (`headline`, `subheadline`, `copy`, `primaryCta`, …) | **px integers** (`maxWidthPx: 740`, `marginTopPx: 14`) + `lineHeightPct` | `nodePresentationInlineStyle` | the `nodePresentation` map on a curated section's props; the inspector's curated branch |
| **`SectionPresentation`** (section FRAME, NOT an element model) | `web/src/lib/site-admin/sections/shared/presentation.ts` | The whole **section** box | enum tokens + `*Custom` `{value,unit}` pixel escapes | `presentationDataAttrs` + `presentationInlineStyles` + `presentationScopedCss` | every section root |

**The rule:** *one element-style model (Engine A) + one section-frame config
(`SectionPresentation`).* Engine B is the curated-role **dialect** of Engine A —
the SAME concepts in a px-integer vocabulary — and is bridged to Engine A by a
single tested seam.

`customCss` (`SectionPresentation.customCss`) is a deliberately-retained raw CSS
escape hatch, scoped to the section root. It is **not** a fourth model; it is an
unstructured power-user override. Its removal is explicitly deferred (see §6 of
the marathon plan).

---

## 2. The conversion seam (Engine B ⇄ Engine A)

`web/src/lib/site-admin/builder-node/node-presentation-bridge.ts` is the **single,
tested** conversion between Engine B and Engine A:

- `nodePresentationToBuilderStyle(np)` — B → A (px int → CSS string, key-name map,
  inline-shorthand → per-side expansion).
- `builderStyleToNodePresentation(style)` — A → B (the inverse for every value
  Engine B can store; values with no clean px-integer home are dropped).

The seam is **lossless for everything Engine B can store**, proven by
`node-presentation-bridge.test.ts` (round-trip B→A→B and A→B→A) and by the
render-parity tests in `node-presentation-render.test.ts` (the curated emitter and
`sharedNodeStyle(nodePresentationToBuilderStyle(np))` emit **byte-identical** CSS
for every shared-vocabulary field).

### 2a. The three fields that DELIBERATELY do not collapse

A naive "make the curated emitter just call `sharedNodeStyle ∘ bridge`" was
evaluated and **rejected** — it regresses curated render on three fields that
have no lossless Engine-A emitter home. These are pinned by the W4-T2 tests; do
not collapse the emitter without first giving each a lossless Engine-A home, or
those tests go red:

1. **`size`** — a curated **section-scoped** token. Each curated section maps
   `size` to its OWN font-size scale via a `sizeMapper` argument (e.g. `xl` → a
   section-specific `clamp(…)`). `sharedNodeStyle` has no section context and no
   `size → fontSize` mapping, so it cannot reproduce the curated value. This is
   the hard blocker: the same `size:"xl"` renders a different font-size in
   different sections, which is fundamentally outside a context-free node emitter.
2. **`tone`** — curated `muted`/`strong` resolve to layered token fallbacks
   (`var(--token-color-muted, var(--impronta-muted, #8f877c))`); Engine-A's tone
   resolves to different literals. Different color string for the same input.
3. **inline shorthands `marginInlinePx` / `paddingInlinePx`** — the curated emitter
   writes the `margin-inline` / `padding-inline` SHORTHAND; the bridge expands
   them to per-side `left`+`right`. Same pixels, different serialized declaration
   (and different key order in the inline `style` attribute).

Everything else — per-side px spacing, `maxWidthPx`, `align`, the free typography
escapes (`fontFamily`/`fontSizePx`/`fontWeight`/`letterSpacingPx`/`lineHeightPct`/
`textTransform`/`textWrap`/`whiteSpace`/`lineClamp`), colors, borders,
`visibility` — is byte-identical across the two emitters and flows through the
bridge losslessly.

**Net:** the bridge is the canonical seam for **data** (eject, future inspector
unification, any B↔A move). The curated **emitter** keeps native handling of
`size`/`tone`/inline-shorthand because those have no context-free Engine-A home.

---

## 3. The cascade ladder (deterministic order — memorize this)

Both element emitters apply declarations in **token-first, escape-last** order so a
raw value always wins over a preset. Within a single node/role the order is:

```
Engine A (sharedNodeStyle) — per node:
  1. responsive style vars (--bn-* for tablet/mobile)
  2. structured tokens:      align → maxWidth(token) → margin(token) → padding(token)
                             → radius(token) → background(token) → tone(token)
  3. free typography escapes: fontFamily → fontSize → fontWeight → lineHeight
                             → letterSpacing → textTransform → textWrap → whiteSpace
                             → lineClamp
  4. free color escapes:      textColor → backgroundColor → border(color/width/style)
  5. free dimension escapes:  width/height/min/max → per-side padding → per-side margin
  6. surface/effect escapes:  boxShadow → background image/layers → clip/mask → opacity
  7. layout/position escapes: position/inset → sticky → z-index → transform → flex/grid
  8. visibility:              visibility:hidden → display:none   (applied LAST)

Engine B (nodePresentationInlineStyle) — per curated role (same spirit):
  1. align → maxWidthPx → per-side + inline-shorthand margins → per-side + inline padding
  2. size(token, via sizeMapper) → tone(token)
  3. free escapes (raw value WINS over the size/tone token):
       fontFamily → fontSizePx → fontWeight → letterSpacingPx → lineHeightPct
       → textTransform → textWrap → whiteSpace → lineClamp
  4. textColor → backgroundColor → border(color/width/style)
  5. visibility:hidden → display:none
```

Across the **channels** for one section, specificity resolves the layering:

```
SectionPresentation frame  (data-attrs = class rules; *Custom = inline on the section root)
        └── contains ──►  curated section roles styled by Engine B (nodePresentationInlineStyle)
                          OR freeform nodes styled by Engine A (sharedNodeStyle)
                                  └── customCss (scoped <style>, section-root selector) layers on top
```

`SectionPresentation` `*Custom` companions override their enum sibling by NOT
emitting the enum's `data-*` attr (so the inline style wins by specificity without
`!important`). Per-element Engine A/B inline styles sit on the element, below the
section frame in the DOM, so they never fight the frame's class rules.

Responsive: Engine B emits scoped `@media` rules via
`buildNodePresentationResponsiveCss`; Engine A emits `--bn-*` CSS vars +
`data-builder-style-{tablet,mobile}-*` attrs read by the static sheet.
`SectionPresentation` emits `data-section-{tablet,mobile}-*` attrs read by
`token-presets.css`. All three are pure-CSS cascades — no JS at render time.

---

## 4. Which model do I use when?

- **New freeform node styling** → Engine A (`BuilderNodeStyle`). This is canonical;
  prefer it.
- **A curated section role's "Type & color overrides"** → Engine B
  (`NodePresentationValue`), because the role's font-size scale is section-scoped
  (`size`) and the curated storage is px-int. Convert to/from Engine A only through
  the bridge.
- **Section-wide frame (band/background/container/section padding/dividers/
  scroll-reveal/video)** → `SectionPresentation`.
- **An unstructured one-off** the models don't express → `customCss` (last resort,
  scoped, workspace-internal only).

---

## 5. Deprecations (storage kept, authoring discouraged)

The Engine-B px-int fields in `nodePresentationValueSchema` are the **parallel**
element-style vocabulary. They are marked `@deprecated` at the type level to steer
new code toward Engine A (`BuilderNodeStyle`) + the bridge — **but the storage is
retained** because:

- curated section props persist `nodePresentation` in this shape (changing it is a
  data migration, out of scope), and
- the px-int convention is what the curated inspector + presets + clipboard speak
  today.

`@deprecated` here means: *do not hand-roll a new parallel px-int field; if you need
a new element style, add it to `BuilderNodeStyle` and let the bridge carry it.* It
does **not** mean the fields are unused or removable.

---

## 6. Pointers

- Bridge + its proof: `builder-node/node-presentation-bridge.ts` (+`.test.ts`)
- Curated emitter + schema: `sections/shared/node-presentation.ts`
- Freeform emitter: `builder-node/render.tsx` → `sharedNodeStyle`
- Section-frame config: `sections/shared/presentation.ts`
- Render-parity + seam-divergence proof: `sections/node-presentation-render.test.ts`
  (the `W4-T2 seam:` tests)
- Lossless eject (B→A on eject): `builder-node/section-eject.ts` (+`.test.ts`)
