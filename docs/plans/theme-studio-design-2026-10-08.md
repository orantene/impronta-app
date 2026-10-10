# TUL-20: Talent Theme Studio (design)

**Status:** DESIGN ONLY. For PM review. No implementation in this PR.  
**Board:** [TUL-20](https://app.notion.com/p/3ef2c5ee9743811895a4ead1faeb5a82) · Epic T (Themes & demos) · Done-checklist **#65**  
**Size:** XL · Family: Themes & sites · Persona: Platform admin  
**Written against:** `origin/main` + TUL-208 audit ([#2851](https://github.com/orantene/impronta-app/pull/2851), [`theme-experience-audit-2026-10-08.md`](./theme-experience-audit-2026-10-08.md))  
**Related prior vision:** [`cursor-master-directive-2026-10-03.md`](../handover/cursor-2026-10-04/docs/cursor-master-directive-2026-10-03.md) ("edit a theme visually vs its mockup, then release"), [`how-to-make-a-new-theme.md`](../factory/how-to-make-a-new-theme.md)

---

## 0. One sentence

Theme Studio is the platform-admin workspace where Oran (or a Factory operator) edits a talent Design **side by side with its Theme Review mockup**, runs parity, and ships a version through the existing release ladder, without leaving Builder Lab for a CLI-only loop.

---

## 1. Why this exists

Done-checklist **#65**: *Can the owner edit a talent design visually against its mockup and release it (Talent Theme Studio)?*

Today that answer is **partial**:

| Piece | Exists today? | Gap |
|---|---|---|
| Talent Template Factory (list, sync, Save as new design) | Yes · `talent-factory/*` | Sync dumps raw JSON (TUL-330) |
| Design editor (Home / Shell trees, demo subject, look) | Yes · `theme-template-editor-mount.tsx` | No mockup pane; canvas only |
| Publicar y actualizar demos | Yes · `publish-design-button.tsx` | Stays |
| Release manager (Open to talents / Make default / Rebuild demos) | Yes · `/builder-lab/themes` | Stays; Studio links into it |
| Theme Review mockups under `web/design-references/<slug>/` | Partial (see §5) | Incomplete packs block finishing themes |
| Pixel parity (`qa:mockup-parity`) | CLI only | Factory card shows path + "run this command"; production mode is CLI-hint only |
| Visual edit **against** the mockup | **No** | Core of TUL-20 |
| One "ready to open" gate that checks mockup + parity + widgets | **No** | Needed so TUL-37 cannot ship unfinished designs |

Without Theme Studio, finishing themes stays a multi-tool hop (editor → terminal parity → release page → overlay pull). That is why #65 remains open and why TUL-37 is parked until Theme Review mockups exist.

---

## 2. Product definition

### 2.1 What Theme Studio is

A **mode of Builder Lab** (not a separate product host) for talent Designs only:

1. **Compare:** live canvas (reference demo content) next to the pinned Theme Review mockup (same widths: 390 / 360 / 1440).
2. **Edit:** same talent design editor as today (sections, tokens, copy), with the mockup still visible.
3. **Prove:** trigger or surface the latest mockup-parity run (pass / known baseline / open deltas by layer).
4. **Ship:** same release actions: Publicar y actualizar demos → review release → Open to talents → pull authored overlay.

Agency / Studio starters never appear here. Same hard split as Factory today.

### 2.2 What Theme Studio is not

- Not the **talent** gallery or change-design UX (Maison setup / ManagerThemeGallery). That is consumer-side; see §4.
- Not a replacement for Theme Review mockups. Studio **consumes** mockups; TUL-328 builds the missing packs.
- Not automatic "Open to talents." Human review on the release page stays required (`how-to-make-a-new-theme.md` §5.6).
- Not a second page builder. One editor mount; Studio adds compare + prove chrome around it.
- Not a path to ship solace / mono / frame without mockups + widget capabilities (PM rule on TUL-37).

### 2.3 Primary user and jobs

| Job | Actor | Outcome |
|---|---|---|
| Close visual deltas vs mockup | Platform admin | Open deltas → 0 (or baselined with ticket) |
| Publish a new design version to demos | Platform admin | New version + demos updated; not yet open to talents |
| Open a proven version to talents | Platform admin | Release channel opt-in; gallery can offer it |
| See why a design is blocked from "finished" | Platform admin | Clear checklist: mockup pack, widgets, parity, gallery flag |

---

## 3. Relationship map

```
Theme Review mockup          Theme Studio (TUL-20)           Talent experience
(web/design-references)      (Builder Lab authoring)         (dashboard + public demos)
─────────────────────        ───────────────────────         ──────────────────────────
Static HTML + kit.js    →    Side-by-side edit + parity →    Gallery pick / switch
parity-map + content.json    Publicar demos + release        ThemeUpdateNotice
README + index row           Overlay pull                    Publish site
                             (admin only)                    (talent; TUL-321…327)
```

| Surface | Owner ticket(s) | Theme Studio role |
|---|---|---|
| Builder Lab Factory list / sync | Existing Factory + TUL-330 | Entry: "Open Theme Studio" on a design row |
| Theme Review mockup packs | **TUL-328** (P1) | Hard dependency for unfinished designs; soft for Folio (complete) |
| Widget families for solace/mono/frame | Gate list in `how-to-make-a-new-theme.md` §4 | Studio surfaces "missing capability" from parity / `COLLECTION_DESIGN_GAPS`; does not invent widgets |
| More finished themes | **TUL-37** (Backlog) | Unblocked only after mockups + Studio prove path |
| Demo content packs | **TUL-38** (#2834) | Studio uses reference demos as canvas subjects; does not author demo seeds |
| Talent dual pickers / draft vs live | **TUL-321** (+ G9) | Out of Studio scope; Studio must not invent a third pick model |
| Demo soft-nav wrong content | **TUL-322** | Out of scope (public hosts) |
| Demo `/en` locale | **TUL-323** | Out of scope; Studio preview should still offer ES + EN once demos support it |
| Manager gallery ES copy | **TUL-324** | Out of scope |
| Theme update → Publish CTA | **TUL-325** | Out of scope (talent) |
| Publish drawer EN blockers | **TUL-326** | Out of scope (talent) |
| Planned demo fallback | **TUL-327** | Out of scope (talent gallery) |
| Fallback chrome / Factory JSON / honest count / fonts | **TUL-329…332** | TUL-330 overlaps Studio Factory entry polish; others stay separate |

**Dependency rule for PM:** Theme Studio implementation should land **after or with** TUL-328's mockup bar work for any design it claims to "finish." Building Studio chrome first against Folio (complete mockup) is fine; opening solace/mono/frame through Studio is not.

---

## 4. UX proposal (admin)

### 4.1 Entry

From Builder Lab → Talent Template Factory design card:

- Primary: **Open Theme Studio** (authored designs: current Edit design href with Studio chrome; code designs: same editor once authored path exists).
- Secondary links stay: Releases, Preview from code, Rebuild demos, copy parity CLI (escape hatch).

Rename mental model: "Edit design in builder" becomes the Studio entry. No parallel "v2" screen.

### 4.2 Studio layout (desktop first; Phone 390 is a canvas width, not the admin chrome)

```
┌────────────────────────────────────────────────────────────────────────┐
│ Design: Folio · vN · status chips · ES/EN · widths 390|360|1440        │
│ [Publicar y actualizar demos]  [Open release]  [Pull overlay CLI]      │
├─────────────────────────────┬──────────────────────────────────────────┤
│ MOCKUP (pinned reference)   │ PRODUCT CANVAS (reference demo subject)  │
│ iframe → design-references  │ existing theme-template editor canvas    │
│ scroll-synced optional      │ Home | Shell tabs                        │
│                             │ subject + look pickers (existing)        │
├─────────────────────────────┴──────────────────────────────────────────┤
│ Parity strip: last run · open deltas by layer · Open report · Re-run   │
│ Finished checklist: mockup pack · parity · widgets · overlay · gallery │
└────────────────────────────────────────────────────────────────────────┘
```

Mobile admin: stack mockup above canvas; parity strip sticky. Do not try to fit both panes side by side under ~1100px.

### 4.3 Modes

| Mode | Behavior |
|---|---|
| **Compare** | Both panes visible; editing locked or limited (inspector read-only) so attention stays on deltas |
| **Edit** | Canvas editable; mockup remains as ghost/side pane |
| **Prove** | Highlights open delta units (from last parity report) mapped via `parity-map.json` / `data-w` |

Default landing: **Edit** with mockup visible (the missing piece vs today).

### 4.4 Finished checklist (gate UI)

Surface the TUL-208 / PM rule in-product:

1. Theme Review pack complete (`index.html`, `kit.js`, `parity-map.json`, `content.json`, README, index row).
2. Reference demo set and content matches `content.json`.
3. Parity: zero open deltas at 390 / 360 / 1440 (known baselines only with linked ticket).
4. No blocking `COLLECTION_DESIGN_GAPS` for this slug.
5. Authored overlay committed (or "pending pull" with command).
6. Gallery visibility decision explicit (hidden unfinished vs finished).

**Open to talents** remains on the release page, but Studio shows a hard "Not ready" state that links the missing checklist items (especially mockup pack for solace/mono/frame).

### 4.5 Production vs local

Today Factory `mockupMode === "production"` only shows a CLI hint. Theme Studio must pick one product rule (PM decision D2):

- **A (recommended):** Studio compare uses the **committed** mockup served from the deployment (static files under `design-references` or a small authenticated static route). Parity **runs** stay CI / local; Studio shows last CI artifact or attached report URL.
- **B:** Studio on production is view-only for mockup iframe; Re-run parity stays local/CI only.

Never require SSH or raw JSON to understand "are we close?"

### 4.6 Copy rules

Admin UI strings: EN + ES, neutral Mexican Spanish, **no em dashes**. No "buyer" / "cart." Factory and Studio share one copy module (extend `factory-copy.ts` / editor copy; do not fork).

---

## 5. Theme Review mockups (input inventory)

Definition locked in TUL-208 audit § "Theme Review mockup." PM rule (TUL-37): **no theme is finished without a Theme Review mockup.**

| Design | Gallery | Mockup pack | Theme Studio implication |
|---|---|---|---|
| `maison` | Finished (legacy) | None (starter seed) | Out of Theme Review scope; Studio optional / low priority |
| `maison-v2` | Finished | Partial: missing `kit.js`; no authored overlay | Studio usable after TUL-328 completes kit pin |
| `folio` | Finished | Complete + overlay | **Best first Studio dogfood** |
| `gridline` | Finished | Complete on disk; missing README index row; no overlay | Studio after README + overlay (TUL-328) |
| **`solace`** | Hidden unfinished | **None** | Studio must refuse "finished"; mockup work is TUL-328 + widgets |
| **`mono`** | Hidden unfinished | **None** | Same |
| **`frame`** | Hidden unfinished | **None** | Same |

Widget gaps (still blocking unfinished designs): solace (rotating word, hero toggle), mono (no-nav header, slot picker), frame (contact-sheet filter / loupe). Studio lists them; kit work is separate 4-layer capability tickets.

---

## 6. Phasing (recommended for PM)

Implementation is out of this PR. Suggested slices once design is approved:

### Phase 0: Decisions (this doc)

PM answers §8. No code.

### Phase 1: Studio chrome on Folio (M)

- Side-by-side mockup iframe + existing editor for Folio only.
- Finished checklist UI (read-only from filesystem / Factory row fields).
- Parity strip reads last local/CI report; keep CLI copy button.
- Entry from Factory card.

**Does not** change release semantics or talent gallery.

### Phase 2: Prove loop (L)

- Map open deltas to canvas sections (`parity-map.json`).
- Optional "scroll sync" mockup ↔ canvas.
- Attach report link on release page before Open to talents.
- Human sync summary for Factory (overlaps TUL-330; can land here or as that card).

### Phase 3: Finish bar for maison-v2 / gridline (depends TUL-328)

- Complete packs + overlays.
- Studio checklist green path proven on all three finished collection designs.

### Phase 4: Unfinished designs (depends TUL-328 + widgets + TUL-37)

- Solace / mono / frame enter Studio only after mockup packs exist.
- Gallery stay hidden until checklist green + Open to talents.

**Do not** start Phase 4 before P0 talent trust gaps TUL-321–323 are handled; otherwise we polish authoring while talents still hit dual pickers and broken `/en` demos.

---

## 7. How triage gaps TUL-321–332 bind

| Cards | Bind to Theme Studio? |
|---|---|
| **TUL-321** (unify pickers) | Prerequisite for a trustworthy "open to talents" outcome. Studio can ship Phase 1 without it; do not market new themes until pick safety is one model. |
| **TUL-322** (soft-nav demo content) | Independent public-host bug. Studio demos links should prefer hard navigation when deep-linking demos. |
| **TUL-323** (`/en` demos) | Independent. Studio EN preview quality tracks this. |
| **TUL-324–327** | Talent gallery / publish polish. Parallel, not Studio. |
| **TUL-328** | **Hard dependency** for mockup-complete designs and for unblocking TUL-37. |
| **TUL-329** | Talent fallback chrome. Parallel. |
| **TUL-330** | Factory entry UX; fold into Phase 1/2 if convenient. |
| **TUL-331** | Honest finished count; Studio checklist feeds the truth that UI should show. |
| **TUL-332** | Demo fonts. Parallel. |

---

## 8. Decisions for PM (blockers before build)

| ID | Decision | Options | Recommendation |
|---|---|---|---|
| **D1** | Is Theme Studio a Factory **mode** or a new top-level Builder Lab tab? | Mode on design editor · New tab · Separate host | **Mode on design editor** (one composition, no parallel surface) |
| **D2** | How does production compare work? | A committed mockup iframe + CI reports · B local-only prove | **A** |
| **D3** | Must parity be green before **Publicar demos**, or only before **Open to talents**? | Gate publish · Gate open only · Warn only | **Warn on Publicar; hard gate on Open to talents** (matches today's human review, adds teeth) |
| **D4** | First dogfood design | Folio · Maison v2 · Gridline | **Folio** (complete mockup + overlay today) |
| **D5** | Build order vs TUL-328 / TUL-321 | Studio first · Mockups first · Parallel chrome + Folio | **Parallel: Phase 1 Studio on Folio + TUL-328 pack gaps; talent P0s (321–323) stay higher priority than Studio Phase 2+** |
| **D6** | Done-checklist #65 "done" bar | Chrome only · Chrome + Folio prove · All finished designs | **Chrome + Folio prove + Open-to-talents gate wired** (maison-v2/gridline pack completion can track TUL-328) |

---

## 9. Success criteria (when #65 can flip)

- [ ] Platform admin opens Folio in Theme Studio and sees mockup + product canvas at 390 and 1440 without a separate HTTP server ritual (or with one documented in-product launch).
- [ ] Admin can edit, Publicar demos, open the release, and Open to talents from the same mental loop (Studio → release page is one hop, not a wiki).
- [ ] Finished checklist visibly blocks Open to talents when mockup pack or open parity deltas are missing.
- [ ] Solace / mono / frame cannot be marked finished or gallery-visible without Theme Review mockups (enforced in UI + existing `FINISHED_GALLERY_SLUGS` policy).
- [ ] No new talent-facing picker; TUL-321 remains the single change-design safety track.
- [ ] Overlay pull remains required and is surfaced (not forgotten) after publish.

---

## 10. Out of scope (named)

- Talent ThemeUpdateNotice / merge-site / lazy fan-out behavior changes (already shipped; only linked from release).
- Agency Studio builders and starters.
- Design compiler (`design:compile`) beyond showing its future gate status if present.
- Authoring ~32 themes' content (TUL-37 / TUL-38).
- Signed-in talent QA (Live QA / TAL-93900 after authoring ships).
- Any production DB writes from agents.

---

## 11. File / surface touch list (for a future build PR, not this one)

| Area | Likely touch |
|---|---|
| Factory entry | `talent-factory-tab.tsx`, `factory-copy.ts`, `factory-model.ts` |
| Editor chrome | `theme-template-editor-mount.tsx`, theme-template builder config |
| Mockup serve | static route or existing `design-references` serve path (D2) |
| Parity summary | read `qa-evidence/mockup-parity` (local) + CI artifact link (prod) |
| Release gate | release manager page + Open to talents action guards |
| Docs | `how-to-make-a-new-theme.md` § update once built |

No migration expected for Phase 1. Confirm if Open-to-talents hard gate needs a column; prefer computing from mockup filesystem + last parity report first.

---

## 12. Open questions / uncertainties

1. Can production Builder Lab serve `web/design-references/**` as static assets today, or do we need a small authenticated route? (Not verified in this design pass.)
2. Scroll-sync across iframe mockup vs canvas may be fragile; Phase 1 can ship without it.
3. TUL-208 did not browser-verify Factory while signed in; Studio layout should be click-tested on `app.tulala.digital` by Live QA after Phase 1, not assumed from code alone.

---

## 13. PM review checklist for this design PR

- [ ] Approve or amend D1–D6.
- [ ] Confirm build order vs TUL-321–323 (talent P0) and TUL-328 (mockups).
- [ ] Confirm Folio-first dogfood.
- [ ] Confirm solace/mono/frame stay hidden until mockups exist (reaffirm TUL-37 park).
- [ ] After approval: spawn implementation card(s) from Phase 1 (do not implement inside TUL-20 without a sized build slice).
