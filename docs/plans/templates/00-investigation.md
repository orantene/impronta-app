# Templates & Imagery — 00 Investigation

**Lead:** Templates & Imagery Lead. **Reports to:** Onboarding designer (session "Onboarding module").
**Branch:** `feat/templates-looks-stock` off `origin/main` @ `f829ea149` (worktree `/Users/oranpersonal/Desktop/impronta-templates`).
**Date:** 2026-09-15. Every path below is under `web/` unless it starts with `docs/` or `supabase/`. Line numbers are from that commit.

Legend: **HAVE** = verified in code · **GAP** = missing to the target · **NV** = not verified (stated why).

---

## 1. Page builder (the only editor)

| Item | Status | Where |
|---|---|---|
| 41 node kinds; `kind:` entries in the registry (50 matches incl. type and comments; the enumerated registry block runs `section` → `section_embed`) | HAVE | `src/lib/site-admin/builder-node/registry.ts:1691-2128` |
| Single gate `validateBuilderNodeTree` | HAVE | `src/lib/site-admin/builder-node/validate.ts` (imported at `builder-core/ai/generate-nodes.ts:27`) |
| Freeform page storage: `cms_pages.blocks` is the **draft** tree, `published_page_snapshot` is live; `is_freeform: true` | HAVE | insert pattern `src/lib/site-admin/server/onboard-notfound-page.ts:243-268`; shell apply reads `blocks` then falls back to snapshot `builder-core/templates/apply-shell-template-action.ts:112-146` |
| Theme tokens registry + `validateThemePatch` | HAVE | `src/lib/site-admin/tokens/registry.ts:81` (TOKEN_REGISTRY), `:1107` (validateThemePatch), `contrast-pair.ts`, `polarity.ts` |
| 6 theme presets: `modern-2026`, `neutral`, `classic`, `editorial-bridal`, `studio-minimal`, `editorial-noir` | HAVE | `src/lib/site-admin/presets/theme-presets.ts:86,149,221,297,377,458`; default `:549` |
| Tenant theme lives on `agency_branding` (`theme_json`, `theme_json_draft`, `theme_preset_slug`) | HAVE | `src/lib/site-admin/server/onboard-starter-content.ts:130-160` |
| 14 page designs (`PAGE_DESIGNS`), `bakePageDesignTree` = expand repeaters + re-mint ids | HAVE | `builder-node/page-designs/index.ts:58-73`; `expand-repeaters.ts:212-219` |
| Page-design imagery = 5 aliases over 15 marketing JPGs (7.7 MB total) | HAVE | `page-designs/photos.ts:23-35`; `public/marketing/photos/` (15 files) |
| Shell header/footer as `builder_templates` kinds `shell_header` / `shell_footer`, applied onto the tenant's `site_shell` row | HAVE | `builder-core/templates/shell-variant-seeds.ts:51,124`; `apply-shell-template-action.ts:100-166` |
| `site_shell` row is created only by an **edit-mode backfill action**, not at provisioning | HAVE | only writer: `src/lib/site-admin/edit-mode/site-shell-backfill-action.ts:297`; no `site_shell` in `src/lib/saas/*` or `onboard-*.ts` |
| Whether the backfill runs automatically on first builder open | NV | did not trace the edit-mode mount; would need a live click |

**Node kinds a Look may use (structure only):** section, container, split, card, cta_group, accordion(+item), tabs(+panel), carousel, masonry, heading, paragraph, rich_text, button, image, icon, divider, spacer, nav, social_links, form, stats, before_after, marquee, sticky_scroll, reveal, location_map, header_search/account/inquiry/language. **Layer-2 candidates already in the registry:** `menu_board` (:1934), `reserve_table` (:1942), `session_picker` (:1950), `ticket_picker` (:1958), `directory` (:1992), `featured_talent` (:2000), `talent_type_grid` (:1974), `hero_search` (:1926), `location_map` (:2008), `form` (:2120), `qr_code` (:1966), `pricing_table` (:2086).

**GAP-B1** No "booking form" kind for services (the `/book` page is a system page built by `onboard-booking-page.ts:26 buildBookingPageTree`, not a block). **GAP-B2** No "hours" block; hours are typed into paragraphs (`onboard-contact-page.ts:59`). **GAP-B3** No "WhatsApp order" block; WhatsApp is a `button` href.

## 2. Builder Lab and `builder_templates`

| Item | Status | Where |
|---|---|---|
| Table `builder_templates` (kind, status, target_context, slug, category, gallery_tab, tags, `builder_tree` jsonb, `theme_tokens` jsonb, required_plan, version…) | HAVE | `supabase/migrations/20260611034138_builder_templates.sql:84-109` |
| Kinds: element, section, connected, page_template, starter_kit, shell_header, shell_footer | HAVE | `builder-core/templates/registry-rows.ts:20-31` |
| Portable JSON export (allow-list) + zod import, in the Lab | HAVE | `src/components/builder-lab/template-export.ts:33-106`, `template-import.ts:92-190` |
| "Sync built-in starters": imports `PAGE_DESIGNS` into `builder_templates` as `builtin-<id>` | HAVE | `builder-core/templates/import-builtin-starters.ts:1-60` |
| Lab route + Site Starter Kit, default surfaces, component catalogue | HAVE | `src/app/(workspace)/platform/admin/builder-lab/page.tsx`; `components/builder-lab/catalog-starter-kit.tsx`, `default-surfaces-panel.tsx`, `component-catalog.tsx`, `preview-subject-picker.tsx` |
| `platform_default_template_pointers` | HAVE (table referenced) | `import-builtin-starters.ts`, `use-lab-platform-defaults.ts`; row contents NV (no DB read in this pass) |

**GAP-L1** A `builder_templates` row holds ONE tree. A Look is a *site*: header + footer + 6 pages + theme patch. No kind or grouping expresses "these 8 rows are one Look" (`starter_kit` is still one tree). **GAP-L2** `theme_tokens` exists on the row but nothing at provisioning applies it (only `FREE_STARTER_THEME_PRESET_SLUG` via `onboard-starter-content.ts:103-160`). **GAP-L3** No Lab preview of a template *with a business type's components and stock*; `preview-subject-picker.tsx` picks a tenant, not a type.

## 3. AI today

| Item | Status | Where |
|---|---|---|
| Signup starter: pick design by keyword/audience → bake → 5 s copy rewrite (Sonnet) → personalise → validate | HAVE | `src/lib/site-admin/server/signup-ai-draft.ts:1-40,144-205`; `signup-design-pick.ts:32-70`; served by `signup-ai-draft-serve.ts:25-92` |
| Builder generator, 18 allowed kinds, image by role → marketing photo | HAVE | `builder-core/ai/generation-allowed-kinds.ts:36-75` (kinds), `:93-112` (IMAGE_ROLE_TO_PHOTO) |
| Prompt assumes a talent agency | HAVE | `generate-nodes.ts:189` ("page-builder engine for a talent-agency platform"), `:234` ("this is a talent agency, not a store"), `:238` (roster rules), `:702` (refusal retry says "talent-agency page") |
| Prompt permits inventing a business name | HAVE | `generate-nodes.ts:231` "Give the business a plausible concrete name and voice." |
| Prompt permits invented prices (pricing_table example `"$49"`) and gives no ban on hours/reviews/awards | HAVE | `generate-nodes.ts:212` |
| Generator prompt has no business-type, no brief facts, no Look tree input | HAVE | `buildGenerationSystemPrompt(opts)` takes locale/polarity/palette only, `:186`; user message = brief string `:246-254` |
| Model is an admin setting | HAVE | `src/lib/ai/ai-generation-model.ts:16-31` (default `claude-opus-4-8`) |
| Image generation exists; OpenAI `dall-e-3`; quota free 3 / studio 30 / agency 120; $0.08 per image | HAVE | `src/lib/ai/ai-image-generation.ts:40-73,231`; `ai-image-quota.ts:11-38` |
| Production has no OpenAI key ("LIVE-TEST BLOCKER" note) | HAVE (comment) / NV live | `ai-image-generation.ts:40-43`; provider status page not opened in this pass |
| Cost log: `cms_ai_usage_log.context_jsonb.cost_usd`, features `builder_generate`, `builder_image`, scope `signup_starter`; failed calls are logged (`ok:false`) but the monthly counter only adds successful cost | HAVE | `src/lib/ai/record-generation-usage.ts:39-62`; `ai-image-generation.ts:235`; `ai-provider-admin.ts:362-372` |

**GAP-A1** Two sources of design truth: signup uses `pickSignupDesign` (description keywords + audience, `signup-design-pick.ts`), while the page-less storefront fallback and the composer contract use `preset.designId` (`words/presets.ts:95`, `agency-home-storefront.tsx:256`). `docs/plans/ai-composer-brief-contract.md` §1 rules `preset.designId` the single source. **GAP-A2** `resolveSignupStarterTreeForOnboard` calls `resolvePlatformDefaultStorefrontTree(client, personalisation)` **without `tenantId`** (`signup-ai-draft-serve.ts:69-72`), so the signup platform-default path cannot read the tenant's preset even though the resolver supports it (`default-storefront-template.ts:192`). **GAP-A3** No `composeSiteFromBrief`; nothing reads `tulala_briefs` at provisioning for page content (`brief-from-signup.ts` writes facts; `provisioning-reads-the-brief.test.ts` covers preset selection only, NV beyond the file name).

## 4. Provisioning

Order in `onboardStarterContent` (`src/lib/site-admin/server/onboard-starter-content.ts:520-695`): ensure homepage row → persist business description → `seedFreeStarterHomepage` (`:226`, uses `resolveSignupStarterTreeForOnboard`) → `ensureNotFoundPage` → `ensureDirectoryPageIfRosterActive` → `ensureBookingPage` → `ensureContactPageIfDetailsExist` → `ensureSeededNavigation`. Caller: `src/lib/saas/workspace-signup.server.ts:169`; `industry_preset` written at `:279` via `pickSignupPreset`.

| Item | Status |
|---|---|
| `applyStarterComposition` | HAVE, but callers are **edit-mode UI only**: `components/admin/shell/internal/page-modules/StarterDoor.tsx:97` and the `EmptyCanvasStarter` branch of `components/home/agency-home-storefront.tsx:364-369`. **No provisioning caller** (`src/lib/site-admin/edit-mode/starter-action.ts:849`). |
| Page-less fallback | HAVE: `resolvePlatformDefaultStorefrontTree(..., tenantId)` at `agency-home-storefront.tsx:245-258`, personalised with public_name / tagline / city, else `DefaultStorefrontBody`. Renders the **agency** tree when the preset has no `designId` (comment `:256`). |
| Pages a new tenant gets | Home (1 design, 1 locale), 404, `/book` system page, `/contact` only if details exist, directory only if roster active. **GAP-P1** No About, no Gallery, no Menu/Services/Classes page, no shell header/footer row. |
| Theme at signup | `FREE_STARTER_THEME_PRESET_SLUG` only when `agency_branding` is empty (`:110-160`). **GAP-P2** Owner logo/palette from the brief (`brand.logo_url`, `brand.palette`, `tulala/fact-keys.ts:399-415`) never reach the theme; "demoted never refused" mapper named in the fact-key comment (`applyBrandBrief`) **does not exist in `src/`** (grep: 0 hits). |

## 5. Brief and business types

| Item | Status | Where |
|---|---|---|
| Fact vocabulary (`business.name`, `work.industry`, `business.hours`, `presence.whatsapp`, `brand.logo_url`, `brand.palette` string_list of hexes, `menu.categories`, `menu.items` priced_items…) | HAVE | `src/lib/tulala/fact-keys.ts:180-475` |
| Brief store: `loadBriefById`, `loadBrief(owner)`, `confirmedFacts`, `stringFact/listFact` | HAVE | `tulala/brief-store.server.ts:131-199`; `brief-store.ts:214-249` |
| 20 industry presets, each with `features {menu, reservations, events, appointments}`, `headerVerb`, `designId`, `representsPeople` | HAVE | `src/lib/words/presets.ts:43-521` (presets `:120-504`) |
| **131 business types** (130 + `custom`) in 12 families: agency 13, beauty 10, craft 7, dining 17, education 12, events 10, fitness 11, hospitality 8, professional 23, tours 7, wellness 12, custom 1 | HAVE | `src/lib/words/business-types.ts:15-27` (families), `t(...)` rows `:70-219`, `FAMILY_DEFAULT_PRESET :40-53` |
| `preset.features` + `headerVerb` is a proto Layer 2 at preset granularity (20), not type granularity (131) | HAVE | same |

**GAP-T1** No type → components registry; nothing maps `nail-salon` to "booking form + team + gallery" or `food-truck` to "menu board + WhatsApp order + location". **GAP-T2** No empty-state copy per component; `menu_board` has its own empty message (El Paisa `menu.json` README) but nothing central, nothing ES/EN by type.

## 6. Media

| Item | Status | Where |
|---|---|---|
| Media page module (2,943 lines) with folders sidebar; folder actions (list/create/rename/delete/add/remove/list-assets/share) | HAVE | `src/components/admin/shell/internal/media-page.tsx:294-360`; `src/app/(workspace)/[tenantSlug]/admin/media/folder-actions.ts:27-483` |
| Upload/register actions, signed uploads | HAVE | `.../admin/media/actions.ts:69` (upload+assign), `:1911` (signed URL), `:2176` (register) |
| System folders (`media_folders.system_key`): `branding`, `lifestyle`; race-safe get-or-create | HAVE | `src/lib/media/system-folders.ts:36-80`; migration `supabase/migrations/20261112000000_branding_media_folder_system_key.sql` |
| **Platform stock already designed**: stock lives under tenant slug `tulala`, folder `system_key="stock"` "Tulala Stock", read-only `queryPlatformStock`, `metadata.stock_category`; importer script | HAVE | `src/lib/media/platform-stock.ts:38-50,74-140`; `scripts/import-stock-images.ts` |
| `queryPlatformStock` **has no caller** in `src/` (only its test and the unchecked-read baseline) | HAVE (inert) | grep `queryPlatformStock` → `platform-stock.ts`, `platform-stock.test.ts`, `quality/supabase-unchecked-read.baseline.json` |
| Stock source folder `~/Desktop/impronta-ai-images` | NV / absent | `ls` → 0 files on this machine |
| Media cap per plan (Free = 150) | NV | `quota-line.ts:33` quotes "142 of 150"; the cap constant's home was not located in this pass (no `src/lib/entitlements`, no `plan-entitlements*.ts`) |

**GAP-M1** Stock is one flat shelf with a free-text category, not per business type × role. **GAP-M2** Nothing shows stock on a tenant Media page (no folder, no read). **GAP-M3** No platform-admin UI for stock (script only). **GAP-M4** No seeding at registration, no push to existing tenants, no retire/replace semantics, no "keep the last served copy". **GAP-M5** No manifest (source, licence, prompt, palette hint, alt ES/EN). **GAP-M6** Stock cap exemption: not applicable yet because stock rows belong to the `tulala` tenant; if delivery copies rows into tenants (D-TPL-3 decides) the cap counter must exclude them.

## 7. Cases

48 case specs `web/e2e/cases/C01…C48-*.spec.ts` (76 files incl. MSG/POS/PERM) and 49 case MDs `docs/plans/program/cases/`. Each spec targets a fixture tenant on `qa-journeys` and asserts a journey (e.g. C01 `/book` → Gel manicure → deposit), not the site's look. **They are a business-type list, not a template acceptance harness.** The acceptance set for this program must be built (screenshot at 1440/390 per Look × type).

El Paisa reference: six validated trees `docs/plans/elpaisa-trees/*.json` (inicio, menu, reservas, nosotros, contacto, galeria) with `tulala-media://` photo placeholders. This is the only complete multi-page site in the repo and the closest thing to a Look × dining instance.

## 8. Gates and constraints verified

- `npm run gates` = typecheck (tsc queue) + lint (queue) + `test:size-ratchet` (13 static tests incl. `hex-literal-ratchet.static.test.ts`) + `test:phase1-i18n` (`web/package.json:227,72`).
- CPU governor (memory): 2 tsc / 1 lint caps; use the queues, never raw `tsc`.
- Contract changes code-first; additive schema only may go apply-before-merge.

## 9. Gaps to the target, ranked

1. **No site-level unit** (GAP-L1): a Look = shell + 6 pages + theme patch needs a container the Lab can import/export as one JSON and provisioning can instantiate.
2. **No Layer 2 registry** (GAP-T1/T2): 131 types → components, slots, fact keys, empty-state copy ES/EN, example data.
3. **Stock is flat and unreachable** (GAP-M1..M6): per-type × role library, tenant folder, admin section, seeding/push, manifest.
4. **Generator is an agency generator** (GAP-A1..A3, `:189/:231/:234/:702`): needs Look + components + facts in, invention out, one `composeSiteFromBrief` door.
5. **Provisioning seeds a single home** (GAP-P1/P2): no About/Gallery/catalogue page, no shell row, logo/palette unused.
6. **Two design-truth sources** (GAP-A1/A2): signup keyword pick vs `preset.designId`.
7. **No measured cost per site**: `cms_ai_usage_log` has the columns; no per-site roll-up (needs a `site_compose_id` in `context_jsonb`).

## 10. Not verified in this pass

- Live rows in `builder_templates` / `platform_default_template_pointers` / `media_folders.system_key='stock'` (no DB read; will read before Deliverable 3).
- Whether the OpenAI image key is set in production (`ai-providers` admin page not opened).
- Whether the shell backfill runs on first builder open.
- The Free media cap constant location.
- Whether `personaliseStarterBuilderTree` strips `{{business.name}}` placeholders on every page kind or only home (`starter-personalisation.ts:355`).
