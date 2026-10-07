---
cursor:
  subagentId: "bc-3b8f42ac-c06c-5d92-85c1-bf839a49faa7"
---

# Theme release chain — LIVE audit (learn only)

Updated: 2026-10-03 ~23:40Z · Agent `bc-3b8f42ac`  
Live tip: **`c3214cac3`** · Persona: **TAL-93900** (`demo-jor-clone@impronta.test`) · Cloud Chrome on `DISPLAY=:1`  
Plan: [production-talent-goal.md](./production-talent-goal.md)  
Shots: [media/theme-release-chain/](../media/theme-release-chain/)  
**No new themes built.** Mutative prove only on TAL-93900. Jor (`TAL-JORGBEAUTY`) configure-ok / no fake bookings — not mutated.

---

## Verdict

| Lane | LIVE status |
|---|---|
| Talent Factory authoring (`builder-lab/talent-factory/*`) | **BLOCKED** — needs working platform-admin password |
| Release manager (`/platform/admin/builder-lab/themes`) | **BLOCKED** — same |
| Finished gallery Folio / Maison / Maison v2 / Gridline | **WORKS** — all four cards on TAL-93900 |
| ThemeUpdateNotice → preview → apply (keeps content in draft) | **WORKS** on TAL-93900 (Maison v2 **21 → 23**) |
| New release from Factory → fan-out → notice | **NOT ATTEMPTED** (admin blocked); prior open release already on prod |
| Folio switch (content-keep promise) | **PARTIAL** — detail + “¿Publicar Folio?” modal shows keep/restore copy; restored to Maison v2 without publishing Folio |
| ~32 themes | **NOT READY** — finished gallery = 4 (`FINISHED_GALLERY_SLUGS`) |

---

## 1. Architecture map (code)

### A. Talent Template Factory (authoring)

| Piece | Path |
|---|---|
| Factory UI tab | `web/src/components/builder-lab/talent-factory/talent-factory-tab.tsx` |
| Gate (platform admin only) | `talent-factory-gate.ts` → `isPlatformAdmin` |
| Server load / sync (gated, `flipCatalog: false`) | `talent-factory.server.ts` |
| Publish design + demos (not open to talents) | `publish-design-button.tsx` → `actionPublishDesignAndUpdateDemos` |
| Design editor | `/platform/admin/builder-lab/talent-designs/<slug>/edit` |
| How-to | `docs/factory/how-to-make-a-new-theme.md` |

Flow: **Edit in builder → Publicar y actualizar demos → review release page → Open to talents (opt-in) → optional Make default**.

### B. Theme catalog

| Piece | Path |
|---|---|
| Finished gallery slugs | `FINISHED_GALLERY_SLUGS` = `maison`, `maison-v2`, `folio`, `gridline` in `theme-catalog/gallery-meta.ts` |
| Collection designs (code) | `theme-catalog/collection/designs.ts` (+ solace/mono/frame hidden from finished set) |
| Maison flag filter | `maison/catalog-visibility.ts` — collection slugs ride `TALENT_MAISON_THEME_ENABLED` |
| Sync builtins | `sync-builtins.server.ts` (Factory sync never flips live catalog) |
| Apply design picker | `release-design.server.ts` `pickApplyDesign` — newest **published optin/default** wins over catalog row |

### C. Theme releases

| Piece | Role |
|---|---|
| `manager/release-manager.server.ts` | Overview, channel moves, fan-out orchestration |
| `manager/merge-site.server.ts` | base / ours / theirs merge (dry or write) |
| `manager/base-resolver.server.ts` | Exact pin snapshot or `noBase` |
| `lazy-fan-out.server.ts` | Sites that land under an open release later still get update rows |
| `offer-actionable.server.ts` | Hide empty offers |
| `talent-update/*` + `ThemeUpdateNotice.tsx` | Talent banner / sheet / preview / apply / dismiss |

Channel ladder: `draft → demos → optin (Open to talents) → default (Make default / catalog flip)`.

---

## 2. Production DB snapshot (Tulala Digital)

### Catalog vs versions

| Design | Catalog version | Max `talent_theme_versions` | Open release (highest) | Sites on design |
|---|---|---|---|---|
| **folio** | **23** (source builtin; snaps authored) | 23 | **default** published 22→23 @100% | 9 @ v23 |
| **maison-v2** | **14** (stale vs snaps) | 23 | **optin** published 22→23 @100% | 10 @ v23, 2 @ v21, 1 @ v20 |
| **maison** | 14 | 15 | (none in open set this pass) | — |
| **gridline** | **1** | 1 | no optin/default beyond v1 | 8 @ v1 |

**Not a bug that maison-v2 catalog is 14:** catalog flips only on **Make default**. Opt-in releases still serve new applies via `pickApplyDesign` + version snapshots. Folio already made default → catalog=23.

### Persona pins (before/after this audit)

| Profile | Before | After audit |
|---|---|---|
| TAL-93900 | maison-v2 **v21** | maison-v2 **v23** (update applied; Folio not left published) |
| TAL-93901 Valeria | maison-v2 v21 | unchanged |
| TAL-JORGBEAUTY | maison-v2 **v23** | **not touched** |

### Flags (Vercel prod)

| Flag | Prod |
|---|---|
| `TALENT_MAISON_THEME_ENABLED` | `all` |
| `TALENT_THEME_GALLERY_ENABLED` | `1` |
| `TALENT_STUDIO_V2` | `1` |
| `TALENT_FREE_WEBSITE_ENABLED` | `true` |

---

## 3. LIVE prove — release → notice → preview → upgrade

Used an **already-open** Maison v2 opt-in release (22→23), not a new Factory publish (admin blocked).

| Step | Result | Evidence |
|---|---|---|
| Presence shows notice | **PASS** — “Maison v2: actualización disponible · Ver novedades” | `t93900-04-mi-sitio.png`, `t93900-12-mi-sitio-clean.png` |
| Open What’s new sheet | **PASS** — “Versión 21 → 23”, Maison v2 2.9 notes, “Aplicar 2 cambios” | `t93900-22-update-sheet.png`, `t93900-30-sheet.png` |
| Preview | **PASS** — draft tab `…/t/site/jorg-beauty-qa?preview=draft&themeUpdate=d438f16f-…` with Jorg content | `t93900-31-preview-tab.png` |
| Apply | **PASS** — toast “Actualización aplicada a tu borrador”; notice cleared; DB pin **v23**, update row `applied` | `t93900-32-after-apply.png` + SQL |
| Content kept | **PASS** for upgrade path (same name/services/hero in preview + after apply) | preview + after-apply shots |
| Undo | **NOT walked** this pass | — |
| Author new release in Factory | **BLOCKED** | platform-admin login fail `admin-20-after.png` |

Note: v23 update row had been `dismissed` earlier; sheet still opened (quiet-entry / reopen) and apply succeeded. Older `available` rows for to_version ≤ pin remain in DB (harmless; loader filters `to_version > pin`).

---

## 4. LIVE — Folio / Maison / Gridline switchable

| Design | In gallery | Detail / Explorar | Switch |
|---|---|---|---|
| Maison | yes | card visible | — |
| Maison v2 | yes (★ App, 8 demos) | detail + current design | was / is pin |
| Folio | yes (8 demos) | Explorar → detail | “¿Publicar Folio?” modal: keeps services/photos/settings; changes layout + Piedra palette — **not published**; restored Maison v2 |
| Gridline | yes (Electricista · 8 demos) | card visible | not switched (avoid leaving trades layout on beauty QA) |

Shots: `t93900-05-gallery.png`, `t93900-06-folio.png`, `t93900-07-gridline.png`, `t93900-17-maison-v2-detail.png`, `t93900-33-folio-detail.png`, `t93900-34-folio-used.png`, `t93900-35-restored-maison-v2.png`.

---

## 5. What works / broken / blocked

### Works
- Finished design gallery for talents with Maison=`all`
- Cambiar diseño → Elige un diseño (Maison, Maison v2, Folio, Gridline)
- ThemeUpdateNotice on Presence + What’s new sheet
- Preview merge URL + Apply to draft + toast
- Merge keeps talent content on version upgrade
- Folio publish confirm honestly lists what stays / what changes
- Lazy fan-out + open opt-in releases already in prod for Maison v2 / Folio

### Broken / debt (not P0 for handoff)
- Maison v2 never **Make default** → catalog row stuck at v14 (confusing in Factory overview when admin can open it)
- Stale `available` update rows for superseded lower versions on TAL-93900
- Builder floating update pill not re-proved this pass (`t93900-20-builder.png` after apply had no pill — expected)
- Gallery UX debt from [design-gallery-audit-2026-10-02.md](./design-gallery-audit-2026-10-02.md) still open (not re-litigated here)
- Extra collection designs (solace/mono/frame) exist in code but not in finished gallery

### Blocked
- **Platform admin** `qa-platform-admin@impronta.test` → “We couldn't sign you in” (stale `QA_PLATFORM_ADMIN_PASSWORD` in store secrets; same blocker as Desk portal)
- Therefore: Talent Factory list, Publish design, Open to talents, Make default, demo rebuild UI — **unreachable this VM**
- Authoring a **new** release version end-to-end cannot be LIVE-proved until admin password is refreshed

---

## 6. STATUS / FEATURES impact (evidence-backed)

| STATUS # | Was | Now | Why |
|---|---|---|---|
| 66 Update available + one-click | 🟡 | **✅** | LIVE notice + sheet + Apply on TAL-93900 tip `c3214cac3` |
| 67 Upgrade keeps content / preview / undo | 🟡 | **🟡** (stronger) | Preview + apply + content kept proved; **undo not walked**; Folio full publish not completed |
| 71 Switch theme without losing content | 🟡 | **🟡** | Folio confirm modal proves product copy; full publish round-trip not finished (restored Maison v2) |
| 64–65 Factory / Theme Studio | 🟡 | **🟡** blocked | Need platform-admin |
| 68–69 / 78 theme count | 🟡/❌ | unchanged | 4 finished designs |

FEATURES: theme gallery row stays ON; add release-chain row — see FEATURES.md.

---

## 7. Do not build yet

Per Oran order: **no new themes** until Jor handoff + journey prove finish. This audit only.

Unblock for Factory→new-release prove: inject working `QA_PLATFORM_ADMIN_PASSWORD` (or Oran session), then: Factory edit → Publicar y actualizar demos → Open to talents → confirm TAL-93900 notice (may need pin below new to_version).

---

## Screenshot index

All under `media/theme-release-chain/`:

- Login / Presence / notice: `t93900-01`…`04`, `12`, `21`
- Gallery + cards: `05`, `06`, `07`, `16`, `17`
- Update sheet / preview / apply: `22`, `30`, `31`, `32`
- Folio detail / publish modal / restore: `33`, `34`, `35`
- Admin blocked: `admin-20-after.png`
