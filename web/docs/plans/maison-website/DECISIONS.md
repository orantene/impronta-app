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

## A6. FAQ items (owner default: yes)

Add `talent_faq_items` (talent_profile_id, question, answer, status draft/published, sort_order, import_batch_id, timestamps; RLS owner-write, public read of published). Maison FAQ binds like `services_catalog` binds offerings.

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

## A11. Feature flag

`TALENT_MAISON_THEME_ENABLED` — default off; off in production until the owner flips it. Existing three flags are already on in production.

---

## A12. Setup UI

Choose a design, Theme detail, Import, Custom colors, Review, Design options = talent-dashboard surfaces (Presence › My website / Today), not builder canvas. Neutral chrome. After publish, Edit site opens the real page builder.

---

## Owner decisions (defaults — ask once in plain language)

| # | Question | Default if unanswered |
|---|---|---|
| 1 | FAQ as real data (`talent_faq_items`)? | **Yes** |
| 2 | Contrast check advisory, not blocking? | **Yes** |
| 3 | Demo images source? | Licensed stock / preview-only; **never** jor-beauty photos as Maison demo |
| 4 | Migrate Jor to Maison theme now? | **No** — separate owner-approved step after this build is proven |

Already ruled (do not re-ask): services and prices show on the free site (2026-09-24).

---

## Deviations

_None yet. Phase A ships docs + gallery gate fix + Maison flag + typed seed constants; schema migrations wait for program-assigned timestamps._

---

## File lock / coordination

- Do **not** collide with CatalogBookingSheet vanity 1:1 PR (#2308). Prefer Maison layout / theme / import / gallery paths.
- `services_catalog` behaviour for live vanity may land elsewhere — build on it, do not fork chrome.
