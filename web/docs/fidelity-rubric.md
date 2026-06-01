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

Artifacts land in `web/fidelity/<design>/`:

- `<design>-1440.png`, `<design>-768.png`, `<design>-390.png`
- matching HTML files for local inspection
- `trivial/determinism.json` proving the same tree renders to a 0-diff screenshot
- `capture-summary.json` listing all captures

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
