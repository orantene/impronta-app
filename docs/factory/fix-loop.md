# Template factory: the parity fix loop

The parity tool is the definition of done for a design. A design is finished when a full
run on its reference demo is green: no failing check outside
`web/design-references/<design>/parity-baseline.json`.

## The pieces

| Piece | Where |
|---|---|
| Full run (all sections, all states, report) | `npm run qa:mockup-parity -- --talents alba --widths 390,360,1440` |
| One targeted pass (the loop) | `npm run qa:parity-loop -- --design maison-v2 --demo alba --section menu --width 390` |
| Pixel diff + thresholds | `scripts/qa/mockup-parity/pixel.mjs`, `pixel-thresholds.mjs` (reference demo only) |
| Delta classifier | `scripts/qa/mockup-parity/classify.mjs` |
| Accepted known deltas | `web/design-references/<design>/parity-baseline.json` |
| In-code render | `/template-preview/<design>?kind=talent-theme&demo=<design>:<demoKey>&source=code` |

Run all commands from `web/`. The product server is the integrator's (`http://localhost:3001`, a
prod build): never start, restart or build it. The loop needs a server that has the `?source=code`
route and your edits (see "Server" below).

## Delta layers: where the fix goes

Every failing check is a delta `{section, check, layer, evidence, suggestedFile}`. The layer tells you
which file to edit, and whether you may edit it at all.

| Layer | Meaning | Fix in | Allowed? |
|---|---|---|---|
| `token` | a computed style differs (font family, size, weight, colour, button fill) | `collection/maison-v2-tokens.ts` (the design's `tokenDefaults`) | yes |
| `payload` | the kit variant exists; a prop, the order, the copy or a node differs | `collection/maison-v2.ts` (the design payload), `maison-v2-footer.ts` for the footer | yes |
| `kit` | the same structural delta on every demo, or a shell landmark or interaction control is missing | `section-kit*.ts` | yes, but it moves every design: run the sweep (below) |
| `platform` | overflow, overlap, clipping, fixed layers, `lang`, header rows | `TalentSiteFreeformRenderer.tsx` and the renderer | yes, with a platform ticket; it crosses designs |
| `new-capability` | the mockup's `data-w` unit has no slot in `TALENT_KIT_SECTIONS` | a new kit block | no. File a ticket with the unit name; do not improvise one inside a design |

A pixel-only failure has no structural cause, so its layer is inferred and marked so in `deltas.json`
(`inferred: true`): the layer of the other deltas on that section, else `kit` when the height differs by
more than 5 percent, else `token`.

Prefer the lowest layer that fixes it: token before payload before kit. A kit or platform change is
shared code; a token or payload change is this design only.

## Protocol

1. **Start red.** Run the full pass once, at 390, 360 and 1440, and read `deltas.json` (the terminal shows the
   grouped list). Pick one section, the lowest layer first.
2. **Edit the suggested file.** One cause at a time. Do not edit the mockup, the thresholds or the baseline to
   make a delta go away.
3. **Loop.** `npm run qa:parity-loop -- --design maison-v2 --demo alba --section <key> --width <w>`.
   It prints the pixel ratio for the section, the open deltas with their suggested file, and `since last pass: N fixed, M new`.
   Open `img/TAL-93020-<w>-<section>.diff.png` (red = mismatch) next to `.product.png` and `.mockup.png`.
   Repeat until the section prints `GREEN`. Check the other two widths before moving on: a fix at 390
   often breaks 1440.
4. **Move to the next section.** New deltas that appear in a section you did not touch are a regression:
   undo, or fix at a lower layer.
5. **Full run.** When every section is green, run the full pass again (all widths, all states, other demos
   too) and read the report, not just the exit code.
6. **Attach the report.** Your hand-off must contain the report path (`report.html`, self-contained, under 16 MB), the
   delta counts by layer before and after, and the SHA. "Done" without a report path is not accepted.

## Baseline: accepting a known delta

A delta that cannot be fixed in this change goes into `parity-baseline.json`, with a ticket. Nothing else
makes it pass.

```json
{ "section": "menu", "check": "pixel diff", "width": 1440, "ticket": "TF-123", "reason": "photo crop differs until the media pipeline lands" }
```

- `section` and `check` are required; `check` may end in `*` for a prefix match.
- `width`, `demo` (profile code) and `layer` narrow the entry.
- `ticket` is required. An entry without one makes the tool refuse to start.
- Known deltas show as KNOWN in the report and do not turn the run red. When a baselined delta stops failing,
  the report lists the entry as stale: delete it.

## Server

- Reference demo: Alba (TAL-93020), content word for word from the mockup. Pixel diff is enforced on Alba only; other
  demos get structure checks.
- `?source=code` is for platform admins and local development only. It renders the in-code payload (not the
  published catalog row) hydrated with the demo's content, and skips the demo's saved page and saved tokens,
  so a TS edit is visible after an HMR refresh. The loop checks the page actually carries the demo's name
  and refuses to compare a different persona.
- The loop defaults to `--source code`. Against a prod build that predates the route it cannot hydrate the demo, so use
  `--source live` there (compares the published page) or point `--base-url` at a dev server that has your edits. The
  integrator owns :3001; do not start servers to get a loop.
- Mockup: served at `http://localhost:3099/` by the factory mockup server (override with `--mockup-url`).
- Read-only: only GET and HEAD leave the browser. Nothing is written to a tenant.

## Kit and platform changes: the sweep

A `kit` or `platform` change touches every design. Before you hand off, run the full pass for every demo
that wears an affected design (`--all-maison-v2`) and say so in the report. Do not widen a change past its ticket.
