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
| **Renderer CSS sheets per tree** | How many times `BuilderNodeRendererStyles` appears in **one rendered tree**. Must be **exactly 1** — this is the PERF-1 caller convention. It is *not* a per-page count; see "Per-tree vs per-page" below. |
| **Renderer CSS size** | Byte size of that sheet. Reported twice: the full unscoped sheet, and the REND-2 scoped sheet a page body actually ships. |
| **Renderer CSS sheets per page** | Sheets in a **composed** page — shell header + body + shell footer, the way a public route assembles one. Observed, not assumed. Currently **3**. |
| **Renderer CSS per page** | The sum of those three sheets: the renderer CSS one visitor downloads. |
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

> The ceilings below are restated from `BUDGETS` for readability. **The code is
> the source of truth** — every ceiling carries its measurement, its date and its
> retune history in a comment right above it. If this table and the code
> disagree, the code wins.

| Budget | Ceiling | Rationale |
|---|---|---|
| Renderer CSS sheets per tree (PERF-1) | **= 1** | A duplicate doubles a fixed cost; zero breaks the tree's styling. Per **tree**, not per page. Locked here *and* in `render-perf-budget.test.ts`. |
| Renderer CSS size (full sheet) | **≤ 126 KB** | The worst case — the unscoped sheet, emitted when a caller cannot name the node-kinds on the page (Lab canvas, dev previews). Measured 125.2 KB (2026-09-01, after Phase 2A's twelve node kinds). A build-time early warning, not what a visitor pays. |
| Renderer CSS size (scoped, shipped) | **≤ 90 KB** | What a visitor downloads **for the page body**. REND-2 scopes the sheet to the kinds present (`collectPresentNodeKinds` → `buildScopedRendererCss`), and every public render path passes it. Measured 2026-09-01: 49.1 KB (trivial) to 77.8 KB (store). Attributes growth to the kinds a page really uses. |
| Renderer CSS sheets per page (composed) | **= 3** | The composition shape the byte ceiling below assumes. If this ever becomes 1 (a hoisted sheet) that is a ~93 KB win — and the gate should still go red, because the byte ceiling would then be ~2× too loose. Re-tune both together. |
| Renderer CSS per page (all sheets) | **≤ 208 KB** | **The number a visitor actually pays.** Measured 2026-09-02: 164.2 KB (trivial) to 192.9 KB (store). Derived, not rounded: a body spending its full 90 KB allowance composes to 205.1 KB, so anything lower would contradict the scoped ceiling; 208 KB is that floor plus ~2.9 KB of named pad for the shell. |
| Rendered HTML size | **≤ 220 KB** | Rich pages reference images *externally*, so the document itself stays small (~60–120 KB). A balloon here means inlined `data:` payloads or runaway markup. |
| DOM node count | **≤ 2,500** | A complex marketing page is ~500–1,200 nodes. 2,500 catches a repeater wired to an unbounded source without tripping on legitimately rich layouts. |
| Font files requested | **≤ 6** | Each webfont blocks text paint. 2–4 faces is tasteful; 6 is a hard ceiling. |
| Font payload | **≤ 420 KB** | Six bundled faces ≈ 360 KB; headroom covers the Google-family estimate. |
| Image payload | **≤ 3 MB** | Editorial photography is heavy *by design*: a hero + ~6 gallery crops at ~300 KB source each ≈ 2 MB. 3 MB honors that and still catches bloat. |
| Largest single image | **≤ 900 KB** | Real optimized web JPEGs are ~200–450 KB. Anything past 900 KB is unoptimized. |
| Total transfer weight | **≤ 3.8 MB** | The headline page weight (uncompressed source bytes). Generous for image-rich editorial pages; well under it for everything else. |

## Per-tree vs per-page (added 2026-09-02, Builder 2027 Lane B)

Until 2026-09-02 this harness rendered **one** builder tree and measured **one**
renderer sheet, and `rendererCssScopedBytes` was read as "what a visitor
downloads". It was not. A public route composes **three** independently rendered
trees, and each mounts its own `<BuilderNodeRendererStyles>`:

```
PublicHeader  → PublishedShellHeader   src/components/public-header.tsx
page body     → the route's own BuilderNodeRendererStyles
PublicFooter  → PublishedShellFooter   src/components/public-footer.tsx
```

Measured on production on 2026-09-01, before the REND-2 scoping fixes landed:

```
improntamodels.com   shell header 100.0 KB + body 87.0 KB + footer 87.8 KB = 274.8 KB
```

so the scoped budget was policing roughly **one third** of the renderer CSS a
visitor downloaded.

There is **no de-dup mechanism** in the renderer — `BuilderNodeRendererStyles`
has no module-level `Set`, no `React.cache`, no context, and the
`key="site-builder-node-styles"` inside `renderBuilderNodes` is React list-key
hygiene, not de-dup. "Exactly one sheet" is a **caller convention**: each
`renderBuilderNodes` call emits at most one, and nested nodes recurse through
`BuilderNodeView`, which never emits. Three call sites means three sheets. So
PERF-1 was a correct invariant with a misleading label, and it is **kept and
relabelled** ("per tree") rather than replaced.

`scripts/fidelity/page-shape.ts` adds the missing per-page view. It composes each
design between the **heaviest shipped shell header and footer variant**
(`SHELL_VARIANT_SEEDS` — the six templates every new workspace picks from, pure
TypeScript, no tenant/DB/network), renders the three trees the way the routes do
(`includeRendererStyles: false` + a separate sheet with `kinds` + `nodes`), and
then re-extracts the `<style>` blocks from the composed HTML so the sheet count
is **observed rather than assumed**.

Cross-checked against the real Impronta shell trees
(`scripts/impronta-rebuild/shell/seed-shell.ts#treesForLocale("en")`), scoped:

| | production shell | heaviest shipped variant |
|---|---|---|
| header | 63.5 KB | 61.9 KB |
| footer | 53.0 KB | 53.2 KB |

within ~2.5% and ~0.4%. The repo-owned variants are used rather than the Impronta
trees on purpose: `scripts/impronta-rebuild/**` is one tenant's rebuild script and
is actively edited — a CI budget must not move because somebody re-worded a nav
item.

**Nothing was redefined.** `rendererCssScopedBytes` still measures exactly the one
body sheet it always measured, so every historical retune recorded in `BUDGETS`
stays comparable. The relationship is stated once, in code:

```
pageRendererCssBytes   =  header sheet + body sheet + footer sheet
rendererCssScopedBytes IS the body sheet in that sum
```

Only renderer CSS is composed. Fonts, images, HTML bytes and DOM nodes stay
single-tree metrics, for exactly the same reason.

### Why this matters going forward

The ~46.5 KB always-shipped base bucket is paid by **all three** sheets. A byte
added to the base costs a visitor three bytes; a byte saved there is saved three
times. Concretely, a mutation adding 5.6 KB of base CSS on 2026-09-02 measured:

| | after +5.6 KB base |
|---|---|
| full sheet | 130.8 KB — green after the routine retune |
| scoped (body) | 83.3 KB — **green**, ≤ 90 KB |
| **per page** | **209.5 KB — RED**, > 208 KB |

That is the class of regression this budget exists for, and it was previously
invisible.

## The 2026-08-15 re-tune (and why the gate was soft)

The renderer-CSS ceiling was 70 KB, written on 2026-06-01 (`619b895d0`) when the
sheet measured ~57 KB. By 2026-08-15 the sheet measured **88.5 KB (90,666 bytes)**
— *identical for all seven fidelity designs*, which is the signature of one shared
sheet growing, not a per-design regression. Because the step had been red for
weeks, `builder-fidelity.yml` carried `continue-on-error: true`, so the gate ran
but never blocked.

The growth is cumulative and is **not dead weight**. Measured additions to the CSS
source constants in `render.tsx` *after* the ceiling was set:

| Δ | commit | what |
|---|---|---|
| +4.9 KB | `408f17492` | nav dropdown / mega menu + `social_links` (2026-06-15) |
| +2.4 KB | `77b261745` | interactive header embeds + mobile nav (2026-06-15) |
| +9.6 KB | `e4edfa09b` | Noir & Or `carousel_hero` system (2026-06-21) |
| +2.3 KB | `e2abfd486` | flexible grid / slider display (2026-06-24) |
| +3.9 KB | `1196c14ee` | `social_feed` widget, #947 (2026-08-15) |

`social_feed` was the prime suspect and is **not** the cause: subtracting it still
leaves ~84.8 KB, so the gate was already red by ~15 KB before #947 merged. Roughly
23.6 KB of the sheet is generated `@container` breakpoint escapes and 27.9 KB is
`@media` blocks — the freeform responsive system, shared by every design.

Nothing here is deletable without re-architecting the renderer, so the ceiling was
**re-tuned to the measured reality** rather than trimmed, a second **scoped** budget
was added to measure what actually ships, and `continue-on-error` was removed so
the step blocks again.

**If you breach either ceiling:** do not bump the number in isolation. Establish
*what* grew (the per-constant history above is reproducible with a byte-count over
`git log -- src/lib/site-admin/builder-node/render.tsx`), decide trim-vs-re-tune,
and record the measurement, the date, and the reason in the `BUDGETS` comment.

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
- **The page composition uses a fixture shell, not a tenant's.** `page-shape.ts`
  composes the heaviest *shipped* header and footer variant, which is a worst-case
  envelope over the shell catalogue — not a specific tenant's shell. A tenant who
  authors a header heavier than any shipped variant pays more than this budget
  measures. Cross-checked within ~2.5% of the live Impronta shell (see above);
  re-check it if the shell catalogue or the renderer's scoping changes materially.
- **Renderer CSS only is page-shaped.** Fonts, images, HTML bytes and DOM nodes
  remain one-tree numbers. A real page's HTML also carries the shell's markup, so
  `htmlBytes` and `domNodeCount` under-count a composed page by the shell's share.
  Deliberate: composing them would change the meaning of every historical number
  recorded against those budgets.
