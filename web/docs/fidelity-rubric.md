# Design Fidelity Rubric

This rubric turns a BuilderNode rebuild into a repeatable 0-100 fidelity score.
It is deliberately screenshot-backed: score only what is visible in the captured
desktop, tablet, and mobile artifacts.

## Run Commands

From `web/`:

```bash
npx tsx scripts/fidelity/capture.ts
npx playwright test e2e/fidelity/fidelity.spec.ts
```

To intentionally refresh golden screenshots after a reviewed design change:

```bash
npx playwright test e2e/fidelity/fidelity.spec.ts --update-snapshots
```

Artifacts land in `web/fidelity/<design>/` (git-ignored; regenerated):

- Static frames: `<design>-1440.png`, `<design>-768.png`, `<design>-390.png`
- Motion frames: `<design>-<width>-<state>.png` (e.g. `saas-1440-scrolled.png`,
  `editorial-1440-reveal.png`) — see [Motion-state frames](#motion-state-frames)
- matching HTML files for local inspection
- `<design>/determinism.json` proving the same tree renders to a 0-diff screenshot
- `capture-summary.json` listing all captures (static + motion)

`capture.ts` renders the **truth**: it self-hosts the real registry fonts (so
Typography is scored on the real face, not a system fallback — see
[Font bridge](#font-bridge)), loads real raster images via `file://` + image
`.decode()`, and **fails the capture** if any declared registry family falls back
to a system font.

## Breakpoints

| Name | Width | Height |
|---|---:|---:|
| Desktop | 1440 | 1100 |
| Tablet | 768 | 1024 |
| Mobile | 390 | 844 |

## Scoring

Each axis is scored 0-5. The total score is:

```text
(Layout + Typography + Color + Spacing + Responsive + Motion + Assets) * 20 / 7
```

Round the final 0-100 score to one decimal place. Scores in Phase 1 are
provisional until a human reviews the screenshots against the target description.

## Axes

| Axis | 0 | 3 | 5 |
|---|---|---|---|
| Layout accuracy | Structure is missing or broken. | Major regions exist, with visible proportional or alignment drift. | Regions, hierarchy, alignment, and composition match the target intent closely. |
| Typography | Text scale, family, weight, or rhythm is largely wrong. | Main hierarchy is present, with font loading, tracking, or wrapping gaps. | Font family/loading, scale, line-height, weight, tracking, and wrapping are faithful. |
| Color and surface | Palette or surface treatment is materially wrong. | Palette is close, but depth, glass, gradients, or texture drift. | Color, contrast, gradients, borders, shadows, and material feel match. |
| Spacing rhythm | Crowding, gaps, or section heights break the design. | Spacing is directionally right but manually uneven. | Section cadence, gutters, whitespace, and local spacing are faithful. |
| Responsive behavior | Mobile/tablet layout breaks or hides key content. | Breakpoints work, with some manual compromises. | Desktop, tablet, and mobile each preserve the target hierarchy and intent. |
| Interaction and motion | Expected interaction/motion is absent or broken. | Basic hover or entrance behavior exists, but timing/scroll behavior is limited. | Motion, hover, sticky, and reveal behavior match the target intent without regressions. |
| Asset handling | Assets are missing, unstable, or badly cropped. | Assets render, with crop/srcset/library/focal-point compromises. | Assets are stable, correctly cropped, responsive, and production-manageable. |

## Motion-state frames

In addition to the static 1440/768/390 frames (captured with
`reducedMotion: reduce` so entrance-animated nodes settle to their final visible
style), the harness captures **motion-state frames**. These run with
`reducedMotion: no-preference` (so the animation/transition exists) and are
screenshotted with Playwright `animations: "disabled"`, which fast-forwards
time-based animations/transitions to their settled end state. Scroll position
and `:hover` are position/pseudo-class driven, so the result is deterministic;
a tight `maxDiffPixels` in the goldens absorbs only sub-pixel AA drift.

This converts two previously-unscoreable axes into **measured** ones. Each
motion frame backs a specific axis:

| Frame | State | Backs axis | What it proves |
|---|---|---|---|
| `saas-1440-scrolled.png` | scrolled 50% | **Color and surface** (glass) + **Interaction and motion** (sticky) | `position:sticky` nav stays pinned AND `backdrop-filter` glass renders OVER real scrolled content — invisible in a pre-scroll static frame. |
| `saas-1440-hover.png` | hover (first CTA) | **Interaction and motion** (hover) | The sticky-nav "Start free" CTA's `style.hover` (scale + glow + colour shift, eased by a base transition) settles to its hovered end state under `animations:"disabled"` — a real state change vs. rest. |
| `editorial-1440-reveal.png` | reveal (scrolled into view) | **Interaction and motion** | The scroll-driven (`animation-timeline: view()`) entrance animation reaches its settled end state when the node enters the viewport, vs. being stuck at `opacity:0`. |

Scoring rule: score **Color/glass and Interaction/motion from the motion
frames**, not the static frames. A static frame may *show* a glass panel against
the page's initial background, but only the `scrolled` frame proves the blur
composites over moving content; score the glass component of Color from there.
Likewise, score sticky + reveal behavior only from the motion frames.

### Hover (committed in P4 Lane B)

`applyMotionState` drives a `hover` state (real pointer → CSS `:hover`). It was
previously omitted as a golden because no registered design wired up hover
styling — a hover frame would have baselined a frame identical to rest. The P4
Lane B `saas` rebuild gives its sticky-nav CTA a real `style.hover` block, so
`saas-1440-hover.png` is now a committed golden that captures a genuine hovered
end state (see the motion-frame table above). The editorial and agency CTAs +
cards also declare `style.hover`, but only the `saas` nav CTA (the first
`.site-builder-node--button` on the page, which `FIDELITY_HOVER_SELECTOR`
targets) is captured as a hover golden; the others are exercised but not
independently frame-proven — scored accordingly in the M2 scorecard.

## Goldens are CI-seeded (read before "fixing" a local red)

The `e2e/fidelity` `toHaveScreenshot` goldens are pinned `chromium-darwin` and
**seeded on the CI macos-14 runner**. On a newer local macOS they fail by ~2–4%
(`ratio 0.02–0.04`) — font anti-aliasing + SVG rasterization drift, **not** a
structural regression. Treat a local fidelity red as "verify it's only AA before
touching anything"; the same-machine determinism guarantee is enforced robustly
by `capture.ts`'s 0-byte self-test, not by the cross-machine e2e goldens.

To seed/refresh goldens to match CI (new frames, or after an intentional design
change): run the **`builder-fidelity.yml` workflow via `workflow_dispatch` with
`update_snapshots=true`**, download the `fidelity-goldens-seeded` artifact, and
commit its PNGs into `e2e/fidelity/fidelity.spec.ts-snapshots/`. This is how the
originals were seeded; do not commit dev-mac PNGs as canonical goldens.

## Font bridge

The standalone capture HTML is not a Next.js page, so the `var(--font-X)`
properties `next/font` defines in `app/layout.tsx` do not exist; bundled
registry faces (Geist/Inter/Raleway/Cinzel/Playfair/Fraunces) would silently
fall back to the system serif/sans and Typography would be scored on the wrong
glyphs. `scripts/fidelity/fonts-bridge.ts` fixes this:

- **Bundled faces** → self-hosted via committed woff2 under
  `scripts/fidelity/fonts/` + `@font-face` + the `--font-*` vars the renderer's
  `cssFamily` expects. Offline + deterministic; no Google CDN dependency.
- **Google faces** (Manrope, DM Sans, Lora, …) → a `fonts.googleapis.com`
  stylesheet `<link>` (CI has network).
- **Self-check**: `capture.ts` calls `document.fonts.load` + `.check` for every
  declared registry family and **throws** if any fell back. System families a
  design declares on purpose (Georgia, Menlo) are not registry faces and are
  intentionally excluded.

## Remaining limitations

- **Click / multi-step interaction timing** — only discrete settled states
  (scrolled, hover, reveal-end) are captured, not the in-between animation
  curve or click-driven flows. Score timing nuance with human eyes.
- **Cross-machine pixel exactness** — see *Goldens are CI-seeded* above.

## Fill-In Template

```markdown
## <design id>

Target:
1. ...
2. ...
3. ...

Screenshots:
- Desktop: `fidelity/<design>/<design>-1440.png`
- Tablet: `fidelity/<design>/<design>-768.png`
- Mobile: `fidelity/<design>/<design>-390.png`

Scores (PROVISIONAL - needs human visual verification):
| Axis | Score | Evidence |
|---|---:|---|
| Layout accuracy | 0.0 | ... |
| Typography | 0.0 | ... |
| Color and surface | 0.0 | ... |
| Spacing rhythm | 0.0 | ... |
| Responsive behavior | 0.0 | ... |
| Interaction and motion | 0.0 | ... |
| Asset handling | 0.0 | ... |
| Total | 0.0 / 100 | `(sum * 20 / 7)` |

CAN'T:
- [Track B, section 11 Capability] ...

PAINFUL:
- [Track C, section 11 Editor UX] ... What would make it easy: ...

NEEDS HUMAN EYES:
- ...
```
