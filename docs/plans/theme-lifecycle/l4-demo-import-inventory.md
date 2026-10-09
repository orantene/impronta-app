# L4 — Demo content inventory + import proposal (research)

**Ticket:** [TUL-422](https://app.notion.com/p/3f32c5ee974381d98058df7e5ae423e3)  
**Scope:** Research only — inventory (where each demo content type lives; personal vs generic) + written proposal for what talents may import. **No import code.**  
**As of:** `origin/main` @ 2026-10-09

**Naming:** Two unrelated “demo” corpora exist. This card targets **theme demos** (`TAL-93xxx`, `is_demo=true`, Demo Registry). The older **directory pack** (`TAL-91xxx`, `supabase/demo_profiles.json`) is agency-roster QA seed — not the theme-demo import surface.

---

## Today (baseline)

No talent-facing “clone this live demo account” path is the product target. Platform rebuilds/restores demos via `demo-rebuild.server.ts` + Builder Lab / `/api/platform/demos/{rebuild,restore}`. Onboarding seeds starter content from Free starter + theme apply hydration of **the talent’s own** content — it does not copy a live demo.

There is a Maison starter-import surface (`maison-import-*`) that reads **catalog starter packs**, not live demo rows — still EN-gated and incomplete-step chrome exists. This proposal treats profession/fixture packs (not row-copy) as the safe source of truth.

---

## 1. Where demo content lives

### A. Theme demos (canonical for L4)

| Layer | Path / table | Role |
|---|---|---|
| Registry | `web/src/lib/talent-site/demos/registry.ts` (`DEMO_REGISTRY`) | Who may be rebuilt |
| Gallery list | `web/src/lib/talent-site/theme-catalog/theme-demos.ts` (`THEME_DEMOS`) | Design, profession, palette, siteSlug, displayName |
| Content fixtures | `web/design-references/{maison-v2,folio,gridline}/content.json` | Reference mockup content |
| Per-demo fixtures | `…/demos/gridline-demo-fixtures.ts`, `folio-demo-fixtures.ts` | Trade demos by profile code |
| Fixture types / loader | `…/demos/content-fixture.ts` | `DemoContentFixture`; `mockupOnly` never written to DB |
| Content apply | `content-fixture.server.ts`, `content-state.server.ts`, `fixture-plan.ts` | Offerings, FAQ, fields, languages, location, captions |
| Design step | `design-step.server.ts` + `site-copy.ts` | Rebuilds site trees from released design + demo style |
| Rebuild orchestrator | `demo-rebuild.server.ts` | Guard → snapshot → content → design → publish → bust |
| Guard | `guard.server.ts` + `theme-catalog/demo-account.ts` | `is_demo` + demo email + batch + registry |
| Seed scripts | `web/scripts/demo-talents/` | Create users/profiles/media/reviews/hours |
| Builder Lab UI | `…/builder-lab/themes/demo-rebuild-{actions,panel,copy}.*` | Platform-admin rebuild/restore |
| API | `app/api/platform/demos/{rebuild,restore}/route.ts` | Cron/admin HTTP entry |
| Backup table | `public.demo_rebuild_runs` | JSON `before` snapshot per write |
| Flag | `talent_profiles.is_demo` | Demo pill; bookings/inquiries refused |
| Starter pack metadata | `theme-catalog/maison/maison-seed-data.json` → `starter_content` | Preview-only; `images_licensed_for_reuse: false` |
| Demos channel | `theme-releases/manager/demos.ts` etc. | Auto-apply design to all `is_demo` sites |

### B. Older directory / agency demo pack (not theme import)

| Layer | Path | Role |
|---|---|---|
| JSON | `supabase/demo_profiles.json` | 20× `TAL-91xxx` roster identities |
| SQL | `supabase/seed_demo_profiles.sql`, `seed_demo.sql` | Non-prod seed |
| Media | `scripts/seed-demo-talent-media.mjs` | Unsplash cards |
| Agency clones | `is_starter_seed` + `onboard-starter-roster.ts` | Fabricated Free homepage roster — not theme demos |

---

## 2. Inventory table

Legend: **personal** = identity/likeness — never importable as-if-real. **generic** = profession/catalog structure — potentially importable. **mixed** = generic shape with personal fill.

| Content type | Where it lives | Personal vs generic | Notes |
|---|---|---|---|
| Display name / first+last | `talent_profiles`; fixtures; `THEME_DEMOS.displayName` | **personal** | Never copy onto a real talent |
| Profile code / site_slug / email | profile_code, site_slug, `@demo.tulala.digital` | **personal** | Registry + host identity |
| Tagline / short bio | fixture + `short_bio` / `bio_i18n` | **mixed** | Shape generic; wording first-person |
| Hero headline / lede | fixture `hero.*`; design trees | **mixed** | Layout generic; copy often personal |
| Trade / profession | `THEME_DEMOS.professions` | **generic** | Good import key |
| Services (names, categories, modes) | fixture → `talent_offerings` | **generic** (templates) | Catalog-shaped |
| Prices / currency / deposit % | fixture `priceAmount`, `depositPercent` | **generic** (editable starters) | Talent must own numbers — Oran confirms money |
| Service descriptions / includes | fixture | **generic** | Strip first-person names |
| Duration / booking mode | fixture → `booking_mode` | **generic** | Product templates |
| Cancellation / late policy | fixture `payment.*` / offering policy | **generic** | Trade defaults |
| FAQ | fixture → `talent_faq_items` | **generic** | Scrub demo names in answers |
| Reviews (DB) | seed → `talent_reviews` | **personal** | Never import as social proof |
| Ratings / mockup rating counts | `mockupOnly.hero.rating*` | **personal** / forbidden | Never written to DB |
| Portfolio captions | fixture → media captions | **mixed** | Captions generic; photos personal |
| Stock / work photos | `media_assets`; photo packs | **personal** (likeness) | Licence false / preview_only |
| Personal portrait | card/hero media | **personal** | F21: own card photo |
| Sections / layout / order | released design + demo styles | **generic** | Prefer `applyDesign` path |
| Look / palette / fonts | gallery + demo styles | **generic** | Theme product |
| Location zone / studio kind | fixture → location settings | **mixed** | Zone-only OK; exact address forbidden |
| Exact address / @handles | `mockupOnly.*` | **personal** / forbidden | |
| Contact / social | `social_links`; footer | **personal** | Fake handles |
| Site switches | `demo-site-settings.ts` | **generic** | Instant vs quote presets |
| Booking hours / slots | `talent_booking_hours` | **personal** | Fictional availability |
| Bookings / inquiries | refused for demos | **personal** | Not importable |
| Languages | fixture → `talent_languages` | **generic** | |
| Height / physical stats | Folio fields | **personal** | |
| Payment methods list | fixture | **generic** | |
| About / footer site copy | fixture + design | **mixed** | |
| Agency starter roster clones | `is_starter_seed` | **personal** (fabricated) | Not theme-demo import |

---

## 3. Rebuild / restore paths (`file:function`)

| Entry | Function |
|---|---|
| `demo-rebuild.server.ts` | `rebuildDemos` → `rebuildOne` |
| Same | `restoreDemoRun` |
| `demo-rebuild-actions.ts` | `actionRebuildDemos`, `actionRestoreDemoRun` |
| `api/platform/demos/{rebuild,restore}/route.ts` | HTTP → rebuild/restore |
| `theme-releases/manager/demos.ts` | `applyDemosWithPorts` (design channel fan-out) |
| `server/demo-pipeline.server.ts` | `applyThemeDemos`, `publishDemoSite` |
| `scripts/demo-talents/seed.mts` | Initial corpus create |

**Per-demo rebuild order:** `assertDemoTarget` → skip if unchanged → snapshot `demo_rebuild_runs` → content fixture → design (newest released, demos channel) → publish → cache bust.

---

## 4. Onboarding seed (not demo import)

1. Workspace signup → `onboardStarterContent({ seedFreeStarter: true })` — Free composition + classic agency Look, marketing imagery under `web/public`.
2. Talent design apply → `applySiteDesignAction` → `applyDesign` hydrates **that talent’s** name/bio/services/photos into design trees.
3. Explicitly does **not** read `DemoContentFixture` / live demo offerings/FAQ/reviews.
4. Maison `starter_content` in catalog JSON is preview/catalog metadata (`preview_only`), not auto-written as DB offerings on real apply.

---

## 5. Proposal — what talents may import

*(Written for PM / Oran decision. Money/pricing parts need Oran’s confirm. No code in this PR.)*

### Who

- **Eligible:** signed-in real talent (`is_demo !== true`) with a personal site, after choosing a **profession + design** (or a named demo as a *template picker*, not a clone of that account).
- **Source of truth:** static fixtures / theme `starter_content` catalogs — **not** a live read of another talent’s profile/media/reviews rows.
- **Not an importer:** QA accounts, starter-seed roster clones, anything that would fail the inverse of `assertDemoTarget`.

### What (candidates to allow)

| Allow (as editable starters) | Why |
|---|---|
| Service menu skeleton (category, name, duration, booking mode, deposit %, variants/addons shape) | Already structured in fixtures; Maison starter pack exists as preview |
| FAQ Q/A templates (scrub personal names) | Strong import candidate |
| Section arrangement / design + look | Already shippable via `applyDesign` / `applyLook` |
| Payment/cancel/reschedule defaults | Fixture payment patterns |
| Site switch presets (instant vs quote vs chat off) | `demo-site-settings.ts` |
| Generic section prompts | Maison `section_text` keys |
| Bilingual language pack toggles | Fixture languages |

**Prices:** import as suggested defaults marked “example — edit,” converted to her currency (MXN or USD rule) — **Oran confirms** before build.

### Never import

| Never | Why |
|---|---|
| Display name, slug, email, phone, DOB, gender | Identity |
| Personal / work photos from demo `media_assets` | Licence + likeness |
| `talent_reviews` / ratings / mockup rating counts | Fake social proof |
| Exact address, map pins, demo @handles, demo domains | `mockupOnly` |
| Live bookings, booking hours as “availability” | Simulated / personal |
| Any `mockupOnly` blob | Hard rule in fixtures |
| Copying `is_demo` / demo host onto a real talent | Would disable real bookings |

### Never overwrite (without explicit confirmation)

| Protect | Precedent |
|---|---|
| Existing offerings the talent already edited | Prefer additive / fill-empty |
| Existing approved media | Captions-only pattern on demos |
| Authored site trees after customization | Services/FAQ import ≠ full design rewrite |
| Non-empty bio/tagline | Starter seed skip-when-filled pattern |
| Location settings once set | Personal ops data |

### Recommended product shape

1. **Pick profession pack** (fixture keys / `THEME_DEMOS.professions`), not “clone Camila’s site.”
2. **Apply design + look** via existing gallery actions (layout).
3. **Optionally seed empty catalog:** offerings + FAQ when counts are zero; prices marked example.
4. **Never seed reviews or photos** from demos; prompt own media upload.
5. **Licence gate:** `preview_only` / `images_licensed_for_reuse: false` stays out of import writes.
6. **Mark imported text as seeded** so theme updates (L2) treat it as untouched until she edits (card requirement).

---

## 6. Open questions (product)

- UX: “profession pack” vs “preview this demo then Import services” (latter risks personal bleed if implemented as row-copy).
- Prices: exact demo numbers vs empty placeholders (money → Oran).
- FAQ answers that mention the demo name: auto-rewrite with talent display name vs leave blank.

---

## 7. Out of this PR

- Import implementation / services slice
- fxlank proof screenshots
- Remaining slice cards under EPIC L
