# The print canvas — design document (Q3 Piece B)

**Status: DRAFT for review.** Written by the QR & Links Manager; the Workspace &
Dashboards Director co-drafts, the Page Builder Director reviews, the CEO approves.
Nothing here is scheduled until that approval.

**Scope.** How a workspace designs something to *print* — a table tent, a flyer, a
sticker — and gets a file a print shop accepts. Piece A (the `qr_code` block itself) is
mapped separately and is not re-opened here.

---

## 1. Already settled — recorded, not re-debated

These shipped in #1658 with tests. They are inputs to the design, not open questions.

| | |
|---|---|
| **Physical sizes in mm** | table tent 100×150, A5 148×210, A4 210×297, sticker 50×50, card 85×55. Each asserted against the produced PDF page size. |
| **Multi-page vector export** | `toPrintPdf(items[])` → one PDF, one page per code, **vector not raster**. Eleven table tents in one file under 400 KB, asserted. |
| **Quiet zone** | 4 modules, inside the SVG viewBox. Not croppable, not paddable-away. |
| **Contrast** | refused below WCAG 4.5:1, with an actionable sentence. Not a warning. |
| **Module size** | whole number of device pixels at the target DPI. |
| **The renderer** | synchronous, no I/O. `toSvg(encodeQr(text).matrix)`. |

**Why mm and not px.** A printer asks for millimetres. Every px-based design system
eventually meets a print shop and has to answer "how big is that actually", and the
answer depends on a DPI nobody wrote down. Sizes are physical from the start.

---

## 2. The open questions — the whole scope of this document

### 2.1 A new canvas *kind*, or a template plus print CSS?

**The case for a template + print CSS:** no new infrastructure. A print piece is a page
with `@page { size: 100mm 150mm }` and a stylesheet. The builder already renders pages;
the browser already prints them.

**The case for a canvas kind:** a print piece is not a page. It has no scroll, no
viewport, no breakpoints, no hover; it has bleed, a safe area, a trim line and a fixed
physical size. Every one of the builder's page affordances is either meaningless or
actively wrong on it, and a designer who can set a mobile breakpoint on a table tent has
been handed a control that cannot mean anything.

**My position, and it is a position rather than a conclusion:** a canvas kind, but a
*thin* one — the builder's node model, inspector and undo unchanged, with the page
chrome (breakpoints, scroll, viewport) suppressed and four print-only properties added.
I do not want a second editor and my slice explicitly says so.

**RESOLVED — thin canvas kind. W&D concurred after checking the code, reversing their
own draft**, and the reasoning is better than mine was:

Page-kind is already branched on in **~21 edit-chrome files**, so suppressing
breakpoints, viewport, hover and scroll costs real edits. **But the template route pays
that same suppression cost** — a designer must not get a mobile breakpoint on a table
tent either way — **while scattering "is this print?" checks instead of giving one clean
predicate.** So the kind is not more expensive than an honest template; it is cheaper,
because the suppression is unavoidable and a kind localises it.

**The cost that IS real, and must be budgeted rather than waved through:** the node
model, inspector and undo are genuinely unchanged (thin, as scoped), but **chrome
suppression is N gate edits, not zero.**

### 2.2 Where does bleed live? — *the question I most need answered*

**I have quiet zone. I do not have bleed. They are different things and conflating them
prints a ruined batch.**

- **Quiet zone** is a property of the *QR symbol*: 4 modules of light around the code so
  a scanner can find it. It is inside the SVG and I own it.
- **Bleed** is a property of the *page*: 3 mm of artwork past the trim line so a
  guillotine that cuts 1 mm off-centre does not leave a white sliver. It is a property of
  the canvas, and nothing in #1658 knows about it.

**Three ways it could work, and they are not equivalent:**

1. **Canvas is trim size; export adds bleed.** The designer works at 100×150 and
   `toPrintPdf` outputs 106×156 with artwork extended. Simplest for the designer,
   requires the exporter to *invent* the extended artwork — which it cannot do for a
   photo that stops at the trim line.
2. **Canvas is bleed size; a trim guide is drawn on top.** The designer works at 106×156
   and sees where the cut lands. Honest, and it is what print designers expect. Costs a
   visible affordance the builder does not have.
3. **No bleed; everything is a safe-area design.** Only legal if nothing ever runs to the
   edge. A table tent with a coloured background breaks it immediately.

**My recommendation is (2), and the reason is a failure mode rather than a preference:**
under (1) a designer places a full-bleed background, the exporter extends it by
stretching or by adding white, and the first anyone knows is a box of cards with a white
line down one edge. Under (2) the mistake is visible while designing.

**RESOLVED — model (2). W&D concurred after checking the builder code**, and reversed
their own earlier preference for "export adds bleed" on the failure-mode argument above.

**A trim-guide overlay IS expressible today.** `canvas-align-guides.ts` already draws
guides on the canvas, so this is an extension of an existing layer rather than net-new
infrastructure.

**One cost W&D named that must not be assumed free:** today's align guides are
**transient** — they appear during a drag. A trim/safe-area guide must be **persistent
whenever the print artboard is active.** That is a modest change to that layer, and it is
a change, not a no-op.

### 2.3 Who owns the print editor?

**Not me.** My slice says: *"I add a canvas kind and a block. I do not build an editor."*
That still holds and I am not asking to be relieved of it.

**Proposal:** the builder owns the editor; QR & Links owns the *export pipeline*
(`toPrintPdf`, sizes, DPI, quiet zone, contrast) and the `qr_code` block's rendering.
The seam is a function call: the canvas hands the exporter a list of artboards and a
size; it does not know how a QR is drawn, and I do not know how a node tree is laid out.

**Per work-item, as a scheduling aid** (from W&D's draft, folded in here so their document
can be retired without losing it):

| Piece | Owner |
|---|---|
| `qr_code` block registration (Piece A) | Page Builder |
| `encodeQr` / `toSvg` / `toPrintPdf` / `qr/files.ts` | QR & Links (#1658) |
| Locked-aspect artboard + safe-area/bleed guide overlay | Page Builder |
| **Bleed generation in the export** | QR & Links |
| Link multi-select affordance ("print these links") | Page Builder |
| The multi-page stamping inside `toPrintPdf` | QR & Links |

**Note on the bleed row, since it is new work rather than existing work:** `toPrintPdf`
today emits pages at **trim** size with no bleed and no trim marks. Under the model
resolved in §2.2 the canvas works at bleed size, so the exporter must emit at bleed size
and mark the trim. That is a change to a shipped function, not a wiring-up of one, and it
is mine.

### 2.4 Is "Apply to all 11 tables" a builder feature or a `toPrintPdf` call?

**Both, and the split matters.**

- Producing **eleven PDFs pages from eleven codes and one design** is already
  `toPrintPdf(items[])` and works today. That is the export.
- Producing **eleven designs** — one per table, each with its own label — is a builder
  operation: it duplicates a node tree eleven times and substitutes a binding.

**My position:** do NOT duplicate the design eleven times. Bind the design **once** to a
*set* of links and let the exporter iterate. Eleven copies means eleven things to keep in
sync, and the twelfth table means editing eleven designs or getting eleven that disagree.
The mockup's "Apply to all 11 tables" is a *print-time* fan-out, not a design-time one.

**AGREED with W&D, independently.** Their Piece A map already says the builder edits ONE
design and the export multiplies; the builder holds a link **multi-select**, never eleven
trees. Two areas reached the same answer separately, which is the most confidence
available on a decision nobody has printed yet.

### 2.5 DPI, and what it is actually for

The PDF is vector, so DPI does not apply to it. DPI matters for **PNG** export only
(`toPng(text, { widthMm, dpi })`, default 300) and for the module-size floor: below about
0.4 mm per module, phone cameras stop reading printed codes reliably. At 300 dpi that is
~5 device pixels.

**Open:** does the canvas offer a PNG export at all, or is PDF the only print output? I
would ship PDF only at first. A PNG of a print design invites someone to email it to a
printer, who will ask for a PDF.

---

## 3. Review status — all four answered

| | | |
|---|---|---|
| §2.2 | **Bleed** | **RESOLVED: model (2)**, canvas at bleed size + persistent trim guide. W&D reversed their own draft. Cost named: guides must become persistent. |
| §2.1 | **Canvas kind vs template** | **RESOLVED: thin canvas kind.** W&D reversed their own draft after finding page-kind branched in ~21 edit-chrome files — the template route pays the same suppression cost while scattering the checks. |
| §2.4 | **Fan-out** | **RESOLVED: print-time.** Reached independently by both areas. |
| §2.5 | **PNG export** | **RESOLVED: PDF only.** |

**Both reversals went from W&D's draft position to this one, and both moved after reading
the builder code rather than after an argument.** Worth recording because the cheaper
outcome was the one nobody assumed at the start: a canvas kind sounded like more
infrastructure than a template and is in fact less.

Remaining for Page Builder's review and the CEO's approval: nothing open in this document.
The named cost — N chrome-gate edits, plus persistent guides — is the estimate to accept
or challenge.

## 4. What I am NOT asking for

Not asking to own the editor. Not asking for a new block category — the CEO ruled
`qr_code` goes in `mvp-allow-list` under `"actions"` beside `menu_board`, and that is
right: it is the same shape, server-resolved with the renderer never querying.

## 5. Open risk worth naming

**Nobody has printed anything from this system yet.** Every print rule in §1 is verified
in software — page sizes asserted against produced PDFs, quiet zone walked module by
module, contrast computed. None of it is verified on paper.

**And the print QA row does not cover bleed, which is the trap.** A green result from
*print at actual size, put it on a table, scan it with a phone* is evidence about the QR
symbol and the page size. **It is evidence about bleed only if someone actually CUT the
piece and looked at the edge** — a correctly drawn trim guide and a guillotine cutting
1mm off-centre are indistinguishable on screen and indistinguishable on an uncut sheet.

So the two need different falsifiers:

- the scan check fails on *anything green that did not come from a phone camera*
- the bleed check fails on **anything green that did not come from a cut edge**

Until both are ticked, this document is designing against a pipeline that has never met a
printer, and §2.2 is the section most likely to be wrong in a way nothing on screen can
show.
