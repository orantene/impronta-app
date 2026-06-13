# Builder published-page performance budget

P4 made builder fidelity *proven* — screenshots, not adjectives. But a screenshot
can't see page **weight**. A real hero photo, a third webfont, a repeater bound to
a 500-row source, or an accidentally-duplicated renderer stylesheet each add bytes
and requests that look identical in a PNG while making the published page slower.
"Proven quality" has to include performance, or fidelity work can silently bloat
every page it touches.

This budget is the guard. `scripts/fidelity/perf-budget.ts` renders every
registered fidelity design through the **real** renderer
(`buildFidelityHtml` → `renderBuilderNodes`), measures the things that drive page
weight, compares them against documented ceilings, and **fails CI** when a design
goes over.

## What it measures

For each registered design (`scripts/fidelity/designs.ts`), deterministically and
**offline** — every byte comes from the rendered HTML string or a committed file
on disk, so the same commit always produces the same report:

| Metric | Meaning |
|---|---|
| **Renderer CSS blocks** | How many times the global `BuilderNodeRendererStyles` sheet appears. Must be **exactly 1** — this is the PERF-1 de-dup invariant. |
| **Renderer CSS size** | Byte size of that global sheet. Every page pays it, so its growth must be deliberate. |
| **Rendered HTML size** | Byte size of the whole document a browser receives (markup + inline CSS + any inline `data:` images). |
| **DOM node count** | Element count in the published markup. Catches structure/repeater runaways. |
| **Font files requested** | Self-hosted bundled woff2 faces + distinct Google-Fonts families the page declares. |
| **Font payload** | Bundled woff2 measured exactly on disk + an estimate per Google family (see limitations). |
| **Image payload** | Root-relative photos resolved against `web/public` and sized on disk, plus any inline `data:` image bytes. |
| **Largest single image** | The heaviest individual asset — catches one unoptimized multi-MB image hiding inside an otherwise-fine total. |
| **Total transfer weight** | `HTML + fonts + external images` — the headline uncompressed page weight. |

The JSON report (written to the gitignored `web/fidelity/perf-budget.json`) also
carries sub-metrics (bundled vs. estimated font bytes, external vs. inline image
counts, remote-image count, font stylesheet requests) and free-text `notes` that
surface observations — e.g. that the renderer currently requests *system* font
families (Georgia, Menlo) from Google Fonts, a small real cost worth knowing about.

## The budgets

Defined once in `BUDGETS` in `scripts/fidelity/perf-budget.ts`. They are
**ceilings sized to comfortably allow rich, real-photography designs** — the whole
point of the P4 rebuild is real photos and real fonts, and a budget that punished
those would be working against the product. They are tuned to catch *genuine*
bloat, not to fit today's (deliberately light, placeholder-imagery) designs.

| Budget | Ceiling | Rationale |
|---|---|---|
| Renderer CSS blocks | **= 1** | PERF-1. A duplicate doubles a fixed per-page cost; zero breaks every page's styling. Locked here *and* in `render-perf-budget.test.ts`. |
| Renderer CSS size | **≤ 70 KB** | The global sheet is ~57 KB today and grows as node kinds / escapes are added. ~20% headroom makes the next jump a conscious, reviewed decision instead of a silent one. |
| Rendered HTML size | **≤ 220 KB** | Rich pages reference images *externally*, so the document itself stays small (~60–120 KB). A balloon here means inlined `data:` payloads or runaway markup. |
| DOM node count | **≤ 2,500** | A complex marketing page is ~500–1,200 nodes. 2,500 catches a repeater wired to an unbounded source without tripping on legitimately rich layouts. |
| Font files requested | **≤ 6** | Each webfont blocks text paint. 2–4 faces is tasteful; 6 is a hard ceiling. |
| Font payload | **≤ 420 KB** | Six bundled faces ≈ 360 KB; headroom covers the Google-family estimate. |
| Image payload | **≤ 3 MB** | Editorial photography is heavy *by design*: a hero + ~6 gallery crops at ~300 KB source each ≈ 2 MB. 3 MB honors that and still catches bloat. |
| Largest single image | **≤ 900 KB** | Real optimized web JPEGs are ~200–450 KB. Anything past 900 KB is unoptimized. |
| Total transfer weight | **≤ 3.8 MB** | The headline page weight (uncompressed source bytes). Generous for image-rich editorial pages; well under it for everything else. |

## Running it

```bash
cd web
npm run perf:builder-budget            # measure all designs + enforce budgets (exit 1 on breach)
npm run perf:builder-budget -- --json  # JSON only (for tooling)
npm run perf:builder-budget:selftest   # prove the gate REJECTS bloat (exit 0 = gate healthy)
```

The default command prints a per-design table, writes the JSON report, and exits
non-zero if any design breaches any budget.

`--selftest` is the inverse check: it runs a synthetic 5,000-node, multi-MB design
through the **real** measure→evaluate pipeline and asserts it is rejected, asserts
every budget fires when exceeded, and asserts an at-the-limit page produces no
false positives. It exits **0 when the gate correctly rejects bloat** (so CI can
assert a healthy gate) and 1 if the enforcement has been weakened into uselessness.
A budget that can never fail is worse than no budget.

## CI

The `perf-budget` job in `.github/workflows/builder-fidelity.yml` runs both
commands on every PR to and push on `main`. It runs on `ubuntu-latest` (no browser,
no Playwright, no macOS runner needed — the script is pure and fast) and uploads
the JSON report as an artifact. PERF-1 is *additionally* locked at unit level by
`src/lib/site-admin/builder-node/render-perf-budget.test.ts`, which runs in the
`test:builder-node-bindings` suite.

## Changing a budget

Budgets are meant to be stable. Raising one to make a bloated change pass is the
exact failure this guard exists to prevent. When a change legitimately needs more
headroom (a new node kind genuinely grows the renderer sheet; a design genuinely
needs a fifth font), the discipline is:

1. Change the number in `BUDGETS` **in the same PR** as the change that needs it.
2. Say **why** in the PR description and update the rationale in the table above.
3. Prefer fixing the bloat (optimize the image, drop a redundant font, externalize
   an inlined asset) over raising the ceiling.

## Known limitations (deliberate, documented)

- **Uncompressed.** Budgets are raw source-asset bytes — an upper bound. Real
  transfer is gzipped (HTML/CSS compress ~5–8×) and images are typically re-encoded
  smaller by `next/image`. Measuring raw bytes keeps the gate deterministic across
  zlib versions and conservative (it never *under*-counts).
- **Google-font payload is estimated.** Off-origin woff2 can't be fetched offline,
  so each declared Google family contributes a fixed ~24 KB estimate. Self-hosted
  bundled faces are measured exactly. The *count* of Google families is exact.
- **Source bytes, not optimized transfer.** Image payload is the committed file
  size under `web/public`, not the resized/`webp`/`avif` variant `next/image` would
  actually serve. Conservative on purpose.
- **Freeform harness only.** Mirrors the fidelity harness scope: curated live-data
  sections are out of scope here.
