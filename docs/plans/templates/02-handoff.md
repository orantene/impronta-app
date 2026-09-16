# Templates & Imagery — 02 Handoff to the onboarding designer

**Branch:** `feat/templates-looks-stock` → PR [#1989](https://github.com/orantene/impronta-app/pull/1989) (one PR, commits per deliverable, D-TPL-14). **Worktree:** `/Users/oranpersonal/Desktop/impronta-templates`.
**Read with:** `00-investigation.md` (what existed), `01-plan.md` (what was decided), `decisions.md` (D-TPL-1..24), `evidence/` (every screenshot named below).
Everything below is verified unless marked **NV**. Paths under `web/`.

---

## 1. The function you call

```ts
import { composeSiteFromBrief } from "@/lib/site-admin/builder-core/site-templates/compose-site-from-brief.server";

const result = await composeSiteFromBrief({
  tenantId,                 // required
  briefId,                  // optional; the tenant's newest stamped brief otherwise
  lookId,                   // optional; family default otherwise (DEFAULT_LOOK_BY_FAMILY)
  locale,                   // optional; the tenant's default locale otherwise (D-TPL-18)
  actorProfileId,           // optional; stamped on the rows
  publish: false,           // drafts by default; true publishes pages + shell + theme
  overwrite: false,         // never replaces a page a person edited unless true
});
```

Result (`ComposeSiteResult`):

| Field | Meaning |
|---|---|
| `outcome` | `composed` · `fallback_used` (no brief, copy pass missed, an image slot empty, or the shell write failed; the site still exists) · `missing_logo` (composed, no logo: the wordmark carries the header) · `failed` (nothing usable written; provisioning keeps the starter) |
| `pageIds` | `home, catalogue, transaction, about, contact, gallery` → `cms_pages.id` |
| `shellPageId` | the `site_shell` row (freeform header + footer) |
| `copySource` | `model` (Sonnet copy pass survived screening) or `defaults` (Look copy) |
| `imagePicks` | how many slots came from owner media / stock / nothing |
| `notes[]` | every reason it is less than `composed`, in plain words |
| `costUsd`, `siteComposeId`, `durationMs` | `costUsd` sums `cms_ai_usage_log` rows carrying `context_jsonb.site_compose_id` (failed and timed-out calls included, D-TPL-19) |

Where it is already wired:
- **Provisioning**: `server/onboard-starter-content.ts` calls it after the one-page starter when a brief is stamped on the tenant, with `publish: true, overwrite: true`; a `failed` outcome leaves the starter (non-fatal, logged).
- **Page-less tenants**: `server/default-storefront-template.ts` renders the family Look + components + stock under the owner's name before any page design (D-TPL-17).
- **Builder generator** ("describe your page"): `builder-core/ai/generation-prompt.ts` speaks in the tenant's family voice, locks the business name, forbids invented facts, and fills image roles from the tenant's media then stock (`site-templates/generation-context.server.ts`).

Dev/QA helper (dev + preview only, staff of that workspace): `POST /api/dev/compose-site { tenantSlug, lookId?, publish?, overwrite?, resetFacts?, facts? }`; `GET /api/dev/compose-site?ids=<siteComposeIds>` → cost per site.

## 2. Look ids

`editorial · warm · bold · minimal · dark · playful · classic · studio · coastal · night` — `src/lib/site-admin/builder-core/site-templates/looks/*.ts`, one recipe engine (`looks/shared.ts`). Family defaults: `look-defaults.ts`. Each Look = shell header + footer + six pages + theme patch (`validateThemePatch`-clean) + ES/EN copy table; no colour literal (token refs), no business-type word or block (static test). Export: `/api/platform/looks/<id>` (PortableLook v1). Import + sync into `site_looks`: Lab page `/platform/admin/builder-lab/looks` (super-admin). Preview any Look × any of the 131 types: `/template-preview/<look>?kind=look&type=<typeId>&page=<role>&locale=es|en` (signed-in users, D-TPL-13).

## 3. The business-component registry

`site-templates/business-components.ts`. 12 components: `menu_board, reserve_table, session_picker, ticket_picker, directory, team, service_list, booking_form, location_hours, whatsapp_order, gallery, proof`. `FAMILY_COMPONENTS` × `TYPE_OVERRIDES` → `resolveComponentsForType(typeId)` for all 131 ids (test). Empty-state copy ES/EN in `copy.ts` (`COMPONENT_EMPTY_STATES`). Fact keys each reads: `factKeys` on the entry. Rules that hold: no `presence.whatsapp` → no WhatsApp button; no `work.services` → "Los servicios aún no están publicados."; `session_picker`/`ticket_picker` only with a real offering/event id (D-TPL-11); `business.works_from` is a premises kind, the city is `person.city`.

## 4. The stock manifest

Table `platform_stock_images` (migration `20260916000356`, applied). Bytes stay on `media_assets` rows of the `tulala` tenant (so no tenant cap is touched). Read: `lib/media/platform-stock.ts` `queryLifestyleStockForType` (type → family → universal pack `custom`). Write: `lib/media/platform-stock-admin.server.ts` (≤ 300 KB via sharp, row-first, soft retire). Admin: `/platform/admin/stock`. Tenant view: Media page → "Lifestyle stock / Fotos de estilo de vida" (virtual, read-only). Manifest in git: `docs/plans/templates/stock-manifest.json` (`scripts/export-stock-manifest.ts`). Seeded today: **14 photos, universal pack only** (`scripts/seed-stock-universal-pack.ts`), licence line "platform-owned marketing asset; provenance not recorded in repo (owner to confirm)".

## 4b. The compose stamp (onboarding v3.2)

`agencies.settings.site_compose` on every outcome: `{ outcome, siteComposeId, lookId, typeId, family, at, pageIds, placed: { photos: { hero, heroSource, gallery, level, pendingJobId }, menuItems, hoursPresent, whatsappPresent, logoPresent }, copySource, notes }`. `photos.hero` is the pack level `owner | tenant | type | family | universal`; **`photos.heroSource` is the stored assignment's source (`owner | tenant_generated | type_pool | family_pool | universal`) and is what the arrival sentence reads: claim photos for `type_pool` or better** (owner decision-imagery §consequences). `photos.pendingJobId` is set when a per-site generation was enqueued (verified account only, D-TPL-31); the tenant's images swap in over the next minutes without a re-compose. After the logo lands: `rethemeSiteAfterLogo(admin, { tenantId, palette? })` (D-TPL-24). `palette` = 2–3 hexes the onboarding module extracts from the logo client-side; the same `themePatchFromPalette` mapper recolours the stamped Look (demoted, never refused) into `theme_json_draft`, and into `theme_json` when the shell was published. Pages are untouched: the theme is tokens.

## 5. Acceptance

`docs/plans/templates/evidence/acceptance/index.md` (+ `acceptance.json`, JPEGs per site). Harness: `scripts/acceptance-run.mts` over `scripts/acceptance-cases.json` (48 cases + F1 home cleaner Cancún, F2 nail salon 4-person team Playa, F3 Parrilla El Paisa with only the two facts the live brief holds). Tenant: `tpl-qa-studio` (created by `scripts/seed-templates-qa-tenant.mjs`, owner qa-admin; never a real tenant).

**Results (run of 2026-09-16, 102 sites = 51 businesses × 2 Looks, `evidence/acceptance/index.md`):**

| Measure | Value |
|---|---|
| Sites composed (site written, six pages + shell) | **102 / 102** — `missing_logo` 82 (= composed, no logo in the fixture), `fallback_used` 20, `failed` 0 |
| Model copy survived screening | 82 / 102; the 20 fallbacks were the provider returning `ok:false` (not a timeout); Look defaults shipped |
| Image slots empty | 0 / 102 sites (every slot filled; all from the universal pack) |
| **Hero assertion** (no two types share a hero; hero from the type pack) | **FAIL — 1 distinct hero asset across 47 types, 0/102 from a type pack.** This is the imagery gap the owner must unblock (image key or licensed packs); the harness will pass the day type packs exist. |
| Time per site (composer only, incl. copy pass) | mean 21.9 s · p90 27.0 s · max 31.2 s (copy race set to 40 s) |
| Cost per site (`cms_ai_usage_log` by `site_compose_id`, failed calls included) | mean **$0.0132** · max $0.0210 · run total $1.348 (102 calls, 20 failed at $0) |
| Screenshots | `evidence/acceptance/<case>--<type>--<look>/{home,inner}-{1440,390}.jpg` (JPEG q55; 17 MB) |

After the run, the 20 `ok:false` copy passes were traced to the reply hitting the 1.8k-token ceiling (the adapter reports a truncated reply as a failure, and a shorter one as "not json"). Fix in the final tree: the pass rewrites the eleven most-read lines instead of sixteen, with a 2.6k ceiling. Re-measured four times on F1 (house cleaner, playful): 4/4 model copy, 14.6–23.7 s, $0.016–0.025 per site. Expect the mean cost per site to sit near $0.02 rather than the $0.013 above, because more copy now survives.

Harness notes: the run was resumed three times: a dev-server navigation abort, a dropped fetch, and twice the dev server's route table lost `/api/dev/compose-site` until restart (a local Turbopack glitch, not app code); the harness now retries both calls and screenshots and resumes from `acceptance.json`.

## 6. What is still missing (honest)

0. **LAUNCH PREREQUISITE — shell render flag.** New tenants see the Look header only where `ENABLE_SITE_SHELL=all` (or `tenants` + `SITE_SHELL_TENANT_IDS`) admits them; today production admits only the code launch list (Impronta). Owner's production switch; not changed by this program (D-TPL-20).
1. **Front Door dependency**: `src/app/(public)/_chat/AgencyChatLauncherMount.tsx:107` falls back to the literal "the agency" when `agency_business_identity.public_name` is missing; the composer now seeds that row, but the literal belongs to Front Door's preset-voice work.
2. **Stock coverage.** 14 universal photos, no per-family or per-type packs: no OpenAI key in this environment and no supplier account, so `/platform/admin/stock` "Generate" refuses honestly and licensed supply stops at the owner (D-TPL-7, D-TPL-15). The admin section, manifest and delivery are ready for the day a key or a supplier exists. Provenance of the 14 marketing photos must be confirmed by the owner.
3. **Super-admin surfaces unclicked by me**: `/platform/admin/stock`, the Lab Looks page (`/platform/admin/builder-lab/looks`) and its import panel. Their reads/writes are the modules the tenant lane, the composer and the tests exercise; the gating fixture (`qa-admin`) is deliberately not a super admin.
4. **"N new photos" badge** on the tenant Media lane: deferred; the shelf itself refreshes on every open.
5. **Logo-derived palette**: the mapper takes hexes (`theme-from-palette.ts`); extraction from the logo image is the onboarding module's (Phase 4, client-side), handed to `rethemeSiteAfterLogo({ palette })`.
6. **Copy pass latency**: Sonnet 6–40 s on the same prompt; 40 s race. A timeout ships Look defaults (`fallback_used`) and still counts the cost.
7. **Provisioning door not exercised through a real signup** in this session (would create a real tenant). It is the same function the acceptance run called 102 times against the QA tenant; the door itself is 20 lines in `onboard-starter-content.ts` and guarded non-fatal. **NV live.**
8. `es` pages the first compose wrote on `tpl-qa-studio` (before D-TPL-18) remain as published rows in a locale the tenant does not serve; harmless on a QA tenant, delete if you reuse it.

## 7. Where to look first if something is wrong

- A page that renders empty: `instantiateSite(...).issues` (the compose `notes`); an image slot with no source is dropped, a copy key with no text is dropped, a slot with no component is removed.
- A page that 404s: check the slug the composer chose (`pageHrefsFor`) against `reserved-routes.ts` and the tenant locale.
- Cost: `select context_jsonb->>'site_compose_id', sum((context_jsonb->>'cost_usd')::numeric), bool_or(not ok) from cms_ai_usage_log where context_jsonb ? 'site_compose_id' group by 1;`

## 8. Owed after #1989 merges (owner's logo rule, 2026-09-16)

Rule: no branding asset gates account, path, workspace, generation or preview; PUBLISH needs brand identity = a logo OR "use my business name as my logo" (the Look wordmark); logo colours are never applied automatically; abuse controls stay separate.

1. Publish preflight `brand_identity` (blocking) + wordmark option: **owned by the onboarding designer (their T4.4)**, not built here.
2. ✅ `candidatePalettesFromHexes(lookPatch, hexes)` (`theme-from-palette.ts`, exported from the barrel): ≤ 3 candidates, each ≤ 3 swatches, `demotions` in plain words, `primary` the candidate ends with; pure, applies nothing. The chosen candidate's `swatches` go to `rethemeSiteAfterLogo({ palette })`; "keep current" calls nothing.
3. ✅ `rethemeSiteAfterLogo` has no caller on an upload path (verified: zero call sites outside its module); the module header now states the rule.

## 9. Visual Asset Engine (feat/visual-asset-engine, 03 v3)

Design and status: `03-visual-asset-engine.md §7`. What onboarding needs to know:

- Nothing to call: `composeSiteFromBrief` stores the picks in `tenant_asset_assignments`, enqueues the per-site job itself when the actor's auth user has `email_confirmed_at`, and reports `placed.photos.heroSource` / `pendingJobId` in the stamp.
- The pool serves `approved` (heroes) and `qa_passed` (gallery/detail) rows only; until the seed heroes are human-approved in `/platform/admin/stock/review`, `heroSource` stays `family_pool` / `universal` and the arrival copy must not claim photos.
- The builder shows "Your photos are being made" (ES: "Estamos preparando tus fotos") on exactly the pending slots (`PendingImagesWatcher`, polls `actionListAssetAssignments` every 5 s, refreshes the route on swap). Editing is never blocked; a manual replacement wins.
- Spend: `ai_image_daily_cap` (default 400 images/day across all tenants ≈ $4.3), `ai_image_regen_per_tenant` (default 20, enforced by the future builder Replace); model/prices/QA model are settings on the same page. Cron `/api/cron/tenant-images` every minute (Vercel) needs `CRON_SECRET` (already used by the other crons).
- Seed batch: `npx tsx --env-file=.env.local scripts/seed-stock-engine.ts` prints the plan and cost; `--apply` runs it. Waits for the owner's go.
- Live proof on the QA tenant: `evidence/engine/README.md` (15 tenant images, $0.19; home shows the tenant's own sushi images; builder pending state). The two platform admin pages are unclicked: only the owner holds `super_admin`.
