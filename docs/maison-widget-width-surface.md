# Maison widget width + Nail Studio surface

Scoped Maison v2 / demo-template fixes so Builder Lab “Publish and update demos” picks them up (not one-off per talent).

## Services catalog (desktop width)

**Bug:** On desktop, the services catalog collapsed to a tall single column (~half width) even when the band was full-bleed.

**Cause:** Editorial type-system CSS used `repeat(auto-fit, minmax(min(100%, 22rem), 1fr))`, which can collapse to one track when the grid’s containing block is mis-measured. Maison already sets `--svc-columns` (typically `2`).

**Fix:** Desktop rows list uses `repeat(var(--svc-columns, 2), minmax(0, 1fr))` in:

- `web/src/lib/talent-site/theme-catalog/collection/design-type-system.ts` (`EDITORIAL_TYPE_SYSTEM_CSS`)
- `web/src/lib/site-admin/builder-node/services-catalog-row-card-css.ts` (card rows)

Folio parity pin for editorial CSS was re-pinned after this change.

## Nail Designer band (white surface)

**Bug:** `#nail-designer` / `demo-app-nail-band` sat on a raised white (`surface-raised`) card.

**Fix:** Template + render normalize in `web/src/lib/talent-site/demos/app-placement.ts`:

- Full-bleed gutters, 88/48 vertical pad
- No `backgroundColor: surface-raised`
- `normalizeNailBand()` strips a stale raised surface on already-placed bands

## Nail Studio desktop composition

Host iframe + in-app layout:

- Frame host CSS: taller desktop frame, `min-width` up to ~900px, rounded clip
- In-app `src/style.css`: preview-led desktop grid, transparent control panel (phone sheet background kept)
- `?layout=desktop|phone` sets `data-layout` on the root (gallery device toggle)

Rebuild path: edit `design-references/apps/nail-designer-v2/src/*` → `python3 src/build.py` → `npm run apps:sync-nail-studio`.

## Save look flow

### UX

1. Canvas footer (desktop + mobile): **Share** + **Save look** only — standalone **Download** removed.
2. **Save look** opens a modal with a **clean square** hand PNG (no slider, zoom, editing chip, or brand bar).
3. Modal actions:
   - **Download** — clean square PNG
   - **Share** — existing share sheet (branded export + WhatsApp / native / link)
   - **Save to my ideas** — local Ideas / My looks (`localStorage`), same as the old immediate save
   - **Request a quote** — host handoff
   - **Add to chat** — host handoff

### Host bridge (wired)

| App `postMessage` type | Host behavior |
|---|---|
| `chat` | `tulala:ask-question` with `nailStudioSummary(design, locale, "chat")` → front-door composer prefill via `pending-draft-message` |
| `quote` | same path with quote wording (`…quote for this nail design…` / ES cotización) |
| `save` / `share` / `download` | **not** opened into chat (save stays local; share stays in-app) |

Files: `nail-designer-model.ts` (`isNailStudioMessage` accepts only `chat` \| `quote`), `nail-designer-frame.tsx`.

### Front-chat follow-up (not in this PR)

Front-door chat today only accepts a **text** draft (`detail.message` → `setPendingDraftMessage`). There is no image/attachment channel on `tulala:ask-question`.

**Add to chat** / **Request a quote** therefore prefill the design summary text only. Attaching the look PNG into the inquiry composer (or as a message attachment) needs a follow-up on the messaging surface — do not invent a parallel chat path from Nail Studio.

## Republish

Template / CSS / public nail-studio changes land with this PR. Existing live demos that already hydrated a nail band still get `normalizeNailBand` at render. For theme demos to pick up the rebuilt Nail Studio HTML and services-grid CSS from the catalog payload, run Builder Lab **Publish and update demos** after merge (see store doc `maison-demos-builder-lab.md`).

## Verify

- Desktop Maison services catalog: two columns at ≥900px, full band width
- Nail band: no white raised card; page colour shows through
- Nail Studio desktop: preview + controls read as one composition; footer is Share | Save look
- Save look modal: square hand only; five actions work
- Add to chat / quote: front-door chat opens with text summary (no image yet)
