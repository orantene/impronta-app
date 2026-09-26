# Maison free website — architecture decisions (PR 0)

Recorded 2026-09-26 against `origin/main` tip at branch creation.  
Binding product words live in the Maison product spec; this file locks **which engine** does the work. Any deviation needs an update here **before** coding it.

Source pack: project store `docs/maison/` (dev prompt, product spec, seed JSON). PDF parts 1–2 and prototype slices were **missing** at Phase A start — visual pixel claims stay blocked until they land.

---

## A1. One catalog, three kinds

Keep `talent_theme_catalog`.

| Kind | Role |
|---|---|
| `design` (Theme) | Maison = Design whose payload is builder nodes (`shellTree` + `homeTree`) |
| `look` (Palette) | Gains optional `for_design` scope. Maison's five Looks are valid only for Maison; existing six global Looks stay global |
| `demo` (new) | `for_design` = theme; payload = offering_mode, default_look, section_arrangement, menu_style, hydration pack, starter_content, image_licence |

Tags + description live on the Design (payload or catalog metadata). Seed from `maison-seed-data.json` only — never retype hexes from screenshots.

**Why:** apply, publish, tokens, preview, and validation already run on this catalog.

---

## A2. Maison is builder nodes

Port Maison into a Design payload from existing node kinds (hero, about, `services_catalog`, gallery, custom slot, how-to-book, FAQ, footer, `reveal` where needed). Extend `DESIGN_ALLOWED_NODE_KINDS` to admit `tabs`, `accordion`, `reveal`, `services_catalog` with validator tests. Content is **bound** and hydrated (Demo or My content). Profile template at `/t/<code>` is **untouched**.

**Why:** free website is one page in the page builder.

---

## A3. Demo / My content

Preview-time hydration switch only — never stored on the site. Demo previews are **inert** (no booking, message, lead, or payment).

---

## A4. Design state and `pending_design`

Additive `talent_sites` columns: `theme_demo_slug`, `custom_palette` jsonb, `menu_style`, `pending_design` jsonb (proposed design + `previous` for Undo + `created_at` + `source`).

- **Never published:** Use this design writes shell/home/tokens_draft directly; keeps `previous` for Undo.
- **Live site:** design actions write **only** `pending_design`; Publish applies atomically. Discard clears it.

Page-level drafts remain an open item; not solved here.

---

## A5. Design versions

On every successful site publish, write a `talent_site_revisions` row (kind `published`) with the design snapshot. Restore copies into `pending_design` (source `restore`), never live directly. If revisions cannot hold the payload cleanly, add narrow `talent_site_design_versions` and update this file.

---

## A6. FAQ items (already ruled: yes)

Add `talent_faq_items` (talent_profile_id, question, answer, status draft/published, sort_order, import_batch_id, timestamps; RLS owner-read + public read of published; writes via service role). Maison FAQ binds like `services_catalog` binds offerings.

---

## A7. Import batches

Add `talent_content_import_batches`. Import is idempotent on (batch id, starter item key). Writes service drafts, FAQ drafts, section text drafts. Undo removes exactly the batch's records (ask if edited). Images never copied unless `image_licence.reusable`. Maison Nails & Lashes = preview-only.

---

## A8. One completion number

Extend `lib/talent/website-eligibility.ts` as the single source. Profession-aware sets per product spec §4.2. Unlock threshold **100** everywhere. Header states from site state (Unlock / Activate / Finish / Website live). A published site must never produce "Unlock your free website".

---

## A9. Readiness before publish

Server function returns real blockers + optional suggestions. `publishMaxSiteAction` refuses while blockers exist. Reuse `runPublishPreflight` where applicable; never generic copy.

---

## A10. Custom colors (owner default: advisory)

Talent-site color editor writing `custom_palette`. Contrast via existing a11y helpers (4.5:1 / 3:1). Suggestion previewed, applied only on "Use this adjustment". Advisory by default (single setting if owner later wants blocking).

---

## A11. Feature flag + flag-off production unchanged

`TALENT_MAISON_THEME_ENABLED` — default off; off in production until the owner flips it.

**Critical (binding plan correction):** `TALENT_THEME_GALLERY_ENABLED` is already on in production. Therefore:

1. **Gallery gate:** `gallery-bootstrap-action` uses `personalSiteEdit` **only when** `TALENT_MAISON_THEME_ENABLED` is on. When the Maison flag is off, keep today's `personalSiteSections` gate (Free talents still get the old starter-gallery fallback path). Unconditional `personalSiteEdit` would ship Free→5×6 gallery while Maison is off = prod change.
2. **Catalog load:** Maison Design, its Look palettes (`maison-*` / `for_design=maison`), and its Demo must **not** appear in `loadTalentThemeCatalog` — including the in-code built-ins fallback — unless the Maison flag is on.
3. **Tests:** explicit flags-off tests for both the gallery gate and catalog filter.

---

## A12. Setup UI

Choose a design, Theme detail, Import, Custom colors, Review, Design options = talent-dashboard surfaces (Presence › My website / Today), not builder canvas. Neutral chrome. After publish, Edit site opens the real page builder.

---

## Owner rulings (already ruled — not defaults to re-ask)

| # | Ruling |
|---|---|
| 1 | FAQ as real data — add `talent_faq_items`. |
| 2 | Contrast check is **advisory**, not blocking. |
| 3 | Demo images — licensed stock from `platform_stock_images` only, preview-only; never jor-beauty photos. |
| 4 | Jor stays on her hand-built page / read-only for this build; migration is a later owner-approved step. |
| 5 | Free-plan services and prices are public (owner 2026-09-24, comment at `web/src/app/t/[profileCode]/_light/LightProfileLayout.tsx:543`). Maison's menu shows published offerings on the free plan. |

---

## Deviations

_None._ PR #2317 = PR 0 docs + PR 1 foundation (schema `20261231287000_maison_website_foundation.sql`, seeds, allowlist, flag, conditional gate, catalog filter, flags-off tests, W8 probe).

### PR 2 notes (W9–W16)

- Maison Design payload replaces the editorial placeholder (`design-payload.ts`).
- FAQ binds via accordion `bindSource: "talent_faq_items"` (nested in contact kit slot — no new kit slot).
- Demo \| My content is preview-time only (`preview-hydration.ts`); gallery UI toggle lands with Choose-a-design (PR 4).
- Visual pixel match deferred until owner uploads PDF/prototype.

### PR 3 notes (W17–W23)

- Single website completion source: `getWebsiteEligibility` (not agency checklist %).
- Profession modes `bookings` / `inquiries` / `quotes` with optional slices omitted from the score.
- Unlock threshold **100** in `websiteRewardState`; header copy follows product §4.1.
- Finish-with-AI chrome: plain assistant text + soft surface-alt user bubble — no black chat bubbles.
- Live published sites short-circuit to Website live before any Unlock path.

### PR 4 notes (W24–W34, W75)

- New setup chrome under `components/talent/site/maison-setup/` (not the old ThemeGallery wizard).
- Mounted from `TalentMaxSiteManager` only when `TALENT_MAISON_THEME_ENABLED` + `personalSiteEdit`; flag-off → null (prod gallery path unchanged).
- One theme card, **no search/filters** (W75). Live preview via `/template-preview/maison`.
- Choices (palette, Demo|My content, screen) persist in localStorage; phone sheets do not.
- **Use this design** is chrome-only here — apply / Undo / Review = PR 5.
- Visual pixel match deferred until owner PDF/prototype.

---

## File lock / coordination

- Do **not** collide with CatalogBookingSheet vanity 1:1 PR (#2308). Prefer Maison layout / theme / import / gallery paths.
- `services_catalog` behaviour for live vanity may land elsewhere — build on it, do not fork chrome.
- Demo inertness (A3) includes `CatalogBookingSheet` — never open a real booking/chat/payment from a demo preview (W15; PR 2).
