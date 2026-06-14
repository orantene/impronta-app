# WS7 — Remove the legacy section system entirely (go fully freeform)

Audit date: 2026-06-13. Source: 6-agent audit (`ws7-legacy-section-audit`). User decision: **Option B** — remove ALL legacy sections, every surface on freeform. Constraints: verify freeform parity before deleting; content loss is OK (homepage being redesigned); **Tulala marketing stays hard-coded React, NOT page-builder**.

## Verdict (the headline)

- **Freeform parity is strong.** Of **56** legacy section types, **38 have FULL freeform parity** today (hero, cta, gallery, testimonials, faq, contact, split, stats, pricing, team, marquee, etc.). **8 are PARTIAL** (achievable via container + custom CSS / code node: timeline, before_after, comparison_table, lottie, sticky_scroll, image_orbit, donation, masonry-ish). **5 are true GAPS** needing new work.
- **Tulala marketing is SAFE.** Confirmed hard-coded React (`src/app/(marketing)/*` + `src/lib/marketing/copy.ts`), gated by `MARKETING_PAGE_PREFIXES`. It does **not** use `cms_pages`/`cms_page_sections`. Removing legacy sections does **not** touch it. ✅ (matches your instruction.)
- **Content-loss-OK massively simplifies it.** We don't need a slot→block content migration. We flip the homepage + system pages to `is_freeform=true` with empty `blocks=[]`, and you rebuild in the freeform canvas during your redesign.

## The real blockers (must build before deleting)

The only gaps that matter for **Impronta** (a talent agency — no blog/events/donations) are the **two data-driven homepage sections**:

| Legacy section | On the page | Status | Action |
|---|---|---|---|
| `hero_search` (search-first hero w/ live directory query + stat count) | Homepage hero | **partial** — freeform reaches it only via `section_embed` (which re-embeds the legacy section) | Build a **native** freeform Hero-Search node |
| `talent_type_grid` ("Talent by discipline", roster-derived taxonomy) | Homepage | **partial** — same `section_embed` dependency | Build a **native** freeform Talent-by-Discipline node |
| `featured_talent`, `directory`, `location_discovery` | Homepage / Faces-of-Fall / Our-Fashion-Models | freeform **wrappers exist** (`featured-talent-wrapper`, `roster-wrapper`, `location-discovery-wrapper`) | **Verify** they're fully native (not `section_embed`-backed); promote if needed |

Use-case GAPS that **don't block Impronta** (defer or keep behind a separate system): `blog_index`, `blog_detail`, `event_listing`, `donation_form`. `site_header`/`site_footer` are **site-shell infrastructure**, not page sections — handled in the shell migration, not parity.

**Key rule:** `section_embed` re-embeds a legacy section, so it is NOT parity for deletion. Every homepage data source must be a *native* freeform node before the legacy registry is deleted.

## Blast radius (this is large — be honest)

Removing the system touches **~60 files** + a table:
- **DELETE:** the entire `src/lib/site-admin/sections/` tree (56 section dirs + `registry.ts` + meta/editor/allowlist/types), `snapshot-slot-bridge.ts`, `HomepageCmsSections`, `homepage-adapter{,-core}.ts`, `composition-actions.ts` (the only `cms_page_sections` writer), `legacy-write-guard*`, `homepage-adapter-parity.test.ts`.
- **MODIFY (high-risk, live):** `/p/[[...slug]]/page.tsx` (slot fallback), `agency-home-storefront.tsx`, `homepage-reads.ts` + `page-reads.ts` (slot hydration), `edit-context.tsx` + `edit-chrome-mount.tsx` (homepage edit routing → freeform adapter), `PublishedShell.tsx`, `/directory/page.tsx`, `/share/[token]/page.tsx`, add-gallery catalog.
- **DB:** drop `cms_page_sections` (+ `cms_sections`?, snapshot columns, related RPCs/triggers).

The **live homepage render + the homepage editing path** are the highest-risk surfaces in the whole app. This is a **multi-PR epic, not a one-shot** — done wrong it blanks every tenant's homepage + breaks site editing.

## Phased plan (each phase = its own PR + gate + live QA)

**Phase 0 — Native parity for homepage data sections (ADDITIVE, safe).**
Build/promote native freeform nodes for `hero_search` + `talent_type_grid`; verify `featured-talent` / `roster` / `location-discovery` wrappers are native (no `section_embed` to a legacy section). Nothing deleted; nothing live changes. This is the "make sure freeform has all the sections first" you asked for. → Ship + QA.

**Phase 1 — Homepage + system pages render via freeform.**
Flip `homepage`, `__site_shell__`, `__directory__` to `is_freeform=true`, `blocks=[]`; route their render through `renderBuilderNodes` (reuse the `/p/` freeform path; drop the `is_system_owned=false` guard for system pages). Shell header/footer become named freeform roots. Public homepage shows the default/empty state until you rebuild. → Ship behind careful prod QA (every render surface).

> **DE-RISKING FINDING (2026-06-13, render-path trace):** `agency-home-storefront.tsx:155-242` ALREADY has a freeform branch — `hasFreeformBuilderTree = builderTree.length>0 && slots.length===0` renders the homepage `snapshot.builderTree` via the shared renderer (the "one-click starter design" path). So the homepage render does NOT need a deep rewire to *show* freeform: Phase 1 is largely **populating the homepage `builderTree` with the 3 native sections + clearing the slots** (data), and it's **reversible** (the `published_homepage_snapshot` slots are preserved in revisions — restore to fall back). The intricate/risky part is the EDIT path (Phase 2, homepage editor still uses the slot composer/homepage-adapter) and the legacy DELETION (Phase 3, ~60 files) + table drop (Phase 4) — those remain the multi-PR core.

**Phase 2 — Homepage EDIT path → freeform adapter.**
Re-route `edit-chrome-mount` + `edit-context` homepage editing from `composition-actions` (slots) to the `cms-page` freeform adapter. → Ship + QA the homepage editor end-to-end.

**Phase 3 — Delete legacy code.**
Remove `SECTION_REGISTRY` + the 56 section dirs + `composition-actions` + `homepage-adapter` + `snapshot-slot-bridge` + `HomepageCmsSections` + `legacy-write-guard*` + their tests. Update add-gallery to reference `BUILDER_NODE_REGISTRY` only. → Gate (expect large test churn) + QA.

**Phase 4 — Drop the DB table.**
Migration: drop `cms_page_sections` (+ snapshot columns / RPCs). Apply after Phase 3 deploys. → `db:push` + smoke.

## Out of scope / preserved
- **Tulala marketing** (`tulala.digital`) — hard-coded React, untouched.
- **Blog / events / donations** — defer (Impronta doesn't use them); if ever needed, build as dedicated dynamic components, not legacy sections.
- **Talent Max pages** — already freeform.

## Risk posture
This is the single highest-risk change available to this codebase (live homepage render + edit + a table drop). Phase 0 is safe/additive. Phases 1–2 touch the live homepage and must each be live-QA'd on prod before the next. Phases 3–4 are cleanup once nothing reads legacy. Do NOT collapse phases.
