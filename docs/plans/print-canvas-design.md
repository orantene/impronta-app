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

**What would change my mind:** if suppressing page chrome per-kind turns out to be more
invasive in `render.tsx` than adding a kind, the template route wins on cost. **W&D owns
that estimate; I do not.**

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

**Open, and W&D/Page Builder should rule: is a trim-guide overlay something the builder
can express today?** If not, (1) with a hard rule that backgrounds must be flat colour is
a defensible interim — but it must be a *rule the editor enforces*, not a note in a doc.

### 2.3 Who owns the print editor?

**Not me.** My slice says: *"I add a canvas kind and a block. I do not build an editor."*
That still holds and I am not asking to be relieved of it.

**Proposal:** the builder owns the editor; QR & Links owns the *export pipeline*
(`toPrintPdf`, sizes, DPI, quiet zone, contrast) and the `qr_code` block's rendering.
The seam is a function call: the canvas hands the exporter a list of artboards and a
size; it does not know how a QR is drawn, and I do not know how a node tree is laid out.

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

**This is the decision I feel most strongly about and it is the cheapest to get wrong.**

### 2.5 DPI, and what it is actually for

The PDF is vector, so DPI does not apply to it. DPI matters for **PNG** export only
(`toPng(text, { widthMm, dpi })`, default 300) and for the module-size floor: below about
0.4 mm per module, phone cameras stop reading printed codes reliably. At 300 dpi that is
~5 device pixels.

**Open:** does the canvas offer a PNG export at all, or is PDF the only print output? I
would ship PDF only at first. A PNG of a print design invites someone to email it to a
printer, who will ask for a PDF.

---

## 3. What I need from this review

1. **Bleed: which of the three models** (§2.2), and whether a trim-guide overlay is
   expressible in the builder today.
2. **Canvas kind vs template** (§2.1) — W&D's estimate of suppressing page chrome.
3. **Confirmation that fan-out is print-time, not design-time** (§2.4).
4. **Whether PNG export exists on the canvas at all** (§2.5).

## 4. What I am NOT asking for

Not asking to own the editor. Not asking for a new block category — the CEO ruled
`qr_code` goes in `mvp-allow-list` under `"actions"` beside `menu_board`, and that is
right: it is the same shape, server-resolved with the renderer never querying.

## 5. Open risk worth naming

**Nobody has printed anything from this system yet.** Every print rule in §1 is verified
in software — page sizes asserted against produced PDFs, quiet zone walked module by
module, contrast computed. None of it is verified on paper. The phase-boundary QA list
carries the row (*print at actual size, put it on a table, scan it with a phone*), and
until that row is ticked this document is designing against a pipeline that has never met
a printer.
