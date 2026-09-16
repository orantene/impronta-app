# Templates & Imagery — 01 Plan

Builds on `00-investigation.md`. Paths under `web/` unless noted. Nothing in this file exists yet unless marked **(exists)**.

## 0. Shape of the work

Three layers, one composer, one door.

```
Look (site-wide visual system)      ─┐
Business components (per type)      ─┼─▶ instantiateSite() ─▶ validateBuilderNodeTree ─▶ cms_pages drafts + site_shell + theme_json_draft
Lifestyle stock (per type × role)   ─┘        ▲
Brief facts + owner media + logo ──────────────┘
                                    composeSiteFromBrief({ tenantId, briefId, lookId? })
```

The model writes copy into named slots; it never lays out. Layout is the Look. Type-specific blocks are the registry. Imagery is owner media first, stock second, never a placeholder box.

PR sequence (each independently mergeable, each gated by `npm run gates`):
1. **PR-A** `site-templates/` registry + 10 Looks + instantiate + tests. Code only.
2. **PR-B** Stock: migration `20260916000356_platform_stock_manifest.sql` (additive), admin section, tenant Media folder, importer changes.
3. **PR-C** Generator: prompt de-agency, invention bans, `composeSiteFromBrief`, provisioning door, cost roll-up.
4. **PR-D** Acceptance evidence (screenshots, cost table) + `02-handoff.md`.

## 1. Layer 1 · Looks

### 1.1 Storage — D-TPL-5
Authoring source is **code**: `src/lib/site-templates/looks/<look-id>.ts`, one file per Look, exported through `looks/index.ts` as `LOOKS`. Reason: provisioning must never depend on a DB row that a fresh environment lacks (the `builtin-*` sync pattern in `import-builtin-starters.ts` **(exists)** already treats code as the source of truth for built-ins).

DB unit is a **sibling table `site_looks`** (not `builder_templates`), created in PR-A's migration only if admin-authored Looks are in scope for this program; otherwise deferred. Justification: a Look is shell + 6 page trees + theme patch + copy table + image slots. `builder_templates` is one tree per row (`registry-rows.ts:53`), so a Look would be 8 rows with no transactional unit, no shared version, and export would be 8 downloads. One Look = one row = one JSON.

Lab import/export: extend `template-export.ts` / `template-import.ts` **(exists)** with a `PortableLook` schema (`kind: "look"`, `version`, `themePatch`, `shell`, `pages`, `copy`, `imageSlots`). Import validates every page with `validateBuilderNodeTree` and the patch with `validateThemePatch` before writing. Built-ins are exported the same way ("Sync built-in Looks" mirrors the starters sync).

### 1.2 Anatomy of a Look
```ts
interface Look {
  id: LookId; title: {es,en}; axis: string;            // what it explores
  themePatch: Record<string,string>;                    // TOKEN_REGISTRY keys only
  shell: { header: BuilderNode[]; footer: BuilderNode[] };
  pages: Record<SitePageRole, BuilderNode[]>;           // home, catalogue, transaction, about, contact, gallery
  copy: Record<CopyKey, {es: string; en: string}>;      // every text slot's default
  imageSlots: ReadonlyArray<{ key: ImageSlotKey; role: ImageRole; page: SitePageRole }>;
}
```
Slot mechanics inside a page tree (all persisted, all registry-legal):
- **Component slots**: a `container` with `anchorId: "slot-<slotId>"` (anchor ids are validated + normalised, `builder-node/anchor-id.ts` **(exists)**). `instantiateSite` replaces its children with the registry's nodes; an unfilled slot is removed (never an empty band).
- **Copy slots**: `heading`/`paragraph`/`button` text = `{{copy.<key>}}`, resolved from `look.copy[key][locale]`, overridable by the composer, and written as `i18n.en/es` overlays so both languages ship (the El Paisa trees do exactly this, `docs/plans/elpaisa-trees/README.md`).
- **Image slots**: `image` node with `props.src = "look://image/<slotKey>"`. Resolved before validation; a leftover `look://` src is a compose failure, never a rendered box.
- **Identity**: `{{business.name}}`, `{{business.city}}`, `{{business.tagline}}` resolved by the existing `personaliseStarterBuilderTree` conventions (`starter-personalisation.ts:355` **(exists)**); the header shows the logo when `brand.logo_url` exists, else the name (`shell.logo-variant` token).

Site map every Look ships: **Home** (hero, offer, proof, main action) · **Catalogue** (`slot-catalogue`) · **Transaction** (`slot-transaction`) · **About** (story + `slot-people`) · **Contact** (`slot-hours`, `slot-map`, `slot-whatsapp`, socials) · **Gallery** (`slot-gallery`). Header (logo/name, nav, main action = preset `headerVerb`), footer (name, nav, socials, hours line).

Image roles per Look: hero ×1, wide ×1, portrait ×1, gallery ×4, team ×1, detail ×1 = 9 slots.

### 1.3 The ten Looks and the axis each explores
| id | Axis | Tokens that carry it |
|---|---|---|
| `editorial` | type-led restraint; left-aligned serif hero, hairlines | `heading-preset: editorial-serif`, `scale-preset: editorial`, `density: airy`, `header-variant: editorial-sticky` |
| `warm` | hospitality; cream canvas, rounded photo cards | `background.mode: editorial-ivory`, `radius: soft`, `shadow: soft`, warm primary |
| `bold` | scale and contrast; display sans, full-bleed accent bands | `heading-preset: display`, `density: tight`, accent bands via `background:"accent"` |
| `minimal` | subtraction; monochrome, small type, air | `heading-preset: sans`, `scale: compact`, `shadow: none`, `radius: sharp`, `header-variant: minimal` |
| `dark` | polarity; dark canvas, one saturated accent | `background.mode: editorial-noir`, `header-variant: espresso-column`, `footer-variant: espresso-column` |
| `playful` | colour rhythm; pill buttons, bright secondary, stacked colour cards | `radius: pill`, `motion: snappy`, `background.mode: mesh-blush` |
| `classic` | symmetry; centred layouts, serif + sans, framed images | `header-variant: centered-editorial`, `heading-preset: serif`, `radius: soft` |
| `studio` | grid system; masonry gallery, split heroes, label type | `heading-preset: sans`, `tracking-preset` wide, `masonry` gallery |
| `coastal` | place; wide photos, sage/sand, marquee strip | `background.mode: plain`, sage/sand palette, `marquee` proof band |
| `night` | motion; sticky-scroll hero, neon accent on dark | `background.mode: editorial-noir`, `sticky_scroll` hero, `motion: refined` |

No Look contains a business-type word or a type-specific block. A static test asserts it (`looks/no-type-words.static.test.ts`): no `menu_board`/`reserve_table`/`session_picker`/`ticket_picker`/`directory` kinds in any Look tree; no words from a banned list (menu, table, class, ticket, roster, salon, …) in any copy default.

### 1.4 Palette from the owner's logo
`src/lib/site-templates/theme-from-palette.ts`: `brand.palette` hexes → roles by luminance (darkest = ink candidate, lightest = background candidate, most saturated = primary). Each pair is contrast-checked with `tokens/contrast-pair.ts` **(exists)**; a failing colour is **demoted** (moved to `color.accent`/`color.secondary`) or dropped, never refused; the result is merged over the Look's default patch and must pass `validateThemePatch`. Hex values live only in data (`brand.palette`) and `src/lib`, never under `src/app/(workspace)` or `src/components/admin` (hex ratchet).

## 2. Layer 2 · Business components

`src/lib/site-templates/business-components.ts` + `business-components.examples.ts` + `business-components.copy.ts`.

```ts
type SlotId = "catalogue" | "transaction" | "people" | "hours" | "map" | "whatsapp" | "gallery" | "home.offer" | "home.proof";
interface BusinessComponent {
  id: ComponentId; slot: SlotId; kinds: BuilderNodeKind[];      // what it emits
  factKeys: string[];                                            // brief keys it reads
  emptyState: {es: string; en: string};                          // honest line when facts are missing
  build(ctx: ComponentContext): BuilderNode[];                   // real nodes, or the empty line
  example(family: BusinessFamilyId): ComponentContext;           // preview data
}
```
Components (first set): `menu_board` (dining), `reserve_table` (dining/events/hospitality with a place), `session_picker` (fitness/education/wellness classes), `ticket_picker` (events), `directory` (agency; `preset.representsPeople`), `team` (any type with `business.has_staff`), `service_list` (beauty/wellness/professional/craft/tours; from `work.services`), `booking_form` (`form` node, services), `location_hours` (`location_map` + hours list from `business.hours`), `whatsapp_order` (button `https://wa.me/<presence.whatsapp>`; **omitted when the fact is missing**, never a dead CTA), `gallery` (masonry/grid from stock until owner uploads), `proof` (stats/testimonials only from facts; else omitted), `faq` (accordion from `brand.*` only when present).

Mapping: `FAMILY_COMPONENTS: Record<BusinessFamilyId, ComponentId[]>` plus `TYPE_OVERRIDES: Record<typeId, {add?, remove?}>` so all 131 types resolve (`resolveComponentsForType(typeId)`), with a static test that every id in `business-types.ts` resolves to ≥ 3 components including one catalogue and one transaction. Catalogue naming per family (Menu / Services / Classes / Roster / Tours / Programs / Spaces) reuses the words engine (`words/presets.ts` **(exists)**).

Empty-state copy, ES first, e.g. `menu_board`: "El menú aún no está publicado." / "Menu items are not published yet." Never an invented dish, price, hour, or review.

Examples for previews: one or two per family (dining: 12-item menu; agency: roster of 4; fitness: 6 sessions; beauty: 8 services + 4-person team; events: 3 ticketed dates…), used only by the Lab preview and tests, never written to a tenant.

## 3. Layer 3 · Lifestyle stock

### 3.1 Schema (additive, migration `20260916000356_platform_stock_manifest.sql`)
```sql
create table public.platform_stock_images (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null unique references public.media_assets(id) on delete restrict,
  business_type text,            -- null = family-level pack
  family text not null,
  role text not null check (role in ('hero','wide','portrait','gallery','team','detail')),
  source text not null check (source in ('generated','licensed')),
  licence text not null,
  prompt text, supplier text, palette_hint text,
  alt_es text not null, alt_en text not null,
  sort_order int not null default 0,
  retired_at timestamptz, created_at timestamptz not null default now(), created_by uuid
);
```
Assets stay under the `tulala` tenant in the `stock` system folder (`platform-stock.ts` **(exists)**), so they never count against any tenant's media cap (the cap counts `media_assets` rows by tenant). `on delete restrict` + soft `retired_at` = a retired photo keeps its object; a published page keeps rendering. RLS: platform-admin write, authenticated read of non-retired rows. Reads go through one server module `src/lib/media/platform-stock.ts` (extended: `queryStockForType(type)` = type rows ∪ family rows, not retired).

Manifest export: `scripts/export-stock-manifest.ts` writes `docs/plans/templates/stock-manifest.json` per type (source, licence, prompt|supplier, palette hint, alt ES/EN) so the licence trail lives in git without the bytes.

### 3.2 Delivery to tenants — D-TPL-6
The tenant's "Lifestyle stock / Fotos de estilo de vida" folder is **virtual**: injected into the Media page folder list (`media-page.tsx:294-360`) with id `stock:<business_type>`, read from `queryStockForType`, with the family pack as fallback. No per-tenant rows are seeded, so "refreshed when platform admin adds photos" is automatic and a "N new since you last looked" badge covers the push. Tenants can place (URL reference), favourite (existing favourites path) and use; rename/delete/move actions refuse `tulala`-owned asset ids server-side. Owner uploads always win: the composer reads `branding` + `lifestyle` folders and imported photos before stock.

### 3.3 Platform admin section
`src/app/(workspace)/platform/admin/stock/page.tsx` + `src/components/platform-admin/stock/*`: grid by family → type → role with coverage counts; upload per type × role (signed upload into the `tulala` tenant, server enforces ≤ 300 KB, resizes via the existing raster path when larger); retire / replace; edit manifest fields; "Generate with AI" per type × role through `generate-node-image-action.ts` **(exists)** when a key is configured, else the button states "Image provider not configured" (D-TPL-7: stop at the point that needs the owner's account; document in handoff).

### 3.4 Coverage order
1. 12 family packs × 9 roles = 108 images (every type has imagery on day one via fallback).
2. The 48 case types × 9 = 432.
3. Remaining 83 types.
Alt text ES/EN is written from the generation prompt or supplier caption, never from an unlooked-at guess.

## 4. Generator changes and `composeSiteFromBrief`

`src/lib/site-templates/compose-site-from-brief.server.ts`:
```
composeSiteFromBrief({ tenantId, briefId, lookId? }) →
  { outcome: "composed" | "fallback_used" | "missing_logo" | "failed", lookId, pageIds: Record<SitePageRole,string>, siteComposeId, costUsd }
```
Steps: load brief (`loadBriefById` **(exists)**) → resolve type from `work.industry` via `searchBusinessTypes` else the tenant's `industry_preset` family → resolve components → pick Look (`lookId` ?? family default table ?? stable hash of tenantId) → theme patch (Look default ⊕ owner palette) → images (owner media by role → stock by type → family) → `instantiateSite` → copy pass: ONE bounded model call (Sonnet, ≤ 1,500 tokens, 6 s race, same pattern as `signup-ai-draft.ts`) that rewrites copy slots from facts with a hard ban list (no names, prices, hours, reviews, awards, credentials, addresses, phone numbers not in facts) and returns JSON keyed by copy key; on miss the Look's defaults + identity ship (`fallback_used`) → validate every tree → write drafts: `cms_pages` rows (`is_freeform`, `blocks`, `status: draft`, `template_key: standard_page`) for the five inner pages, home draft, `site_shell` row (backfill pattern from `site-shell-backfill-action.ts:297`), nav via `ensureSeededNavigation`, `agency_branding.theme_json_draft` → log usage with `context_jsonb.site_compose_id` (success and failure) → outcome. `missing_logo` when the type usually has one and `brand.logo_url` is absent (site still composed, name-mark header). Pages with edit history are never overwritten.

Provisioning door: `onboardStarterContent` calls `composeSiteFromBrief` when a brief with a stamped `tenant_id` exists; otherwise the existing path. The page-less fallback (`agency-home-storefront.tsx:245`) resolves Look + components + stock with the owner's identity instead of the agency tree.

`generate-nodes.ts` (builder "describe your page" door): prompt line `:189` becomes family-voiced ("for a {family} business"; the agency family keeps today's roster voice `:238`); `:231` invention sentence removed; new RULE bans invented names/prices/hours/reviews/awards/credentials; `:702` refusal retry de-agencied; `IMAGE_ROLE_TO_PHOTO` replaced by `stockForRole(type, role)` with the marketing photo as last fallback. `signup-design-pick.ts` retired in favour of the Look picker (one design-truth source, closes GAP-A1/A2).

## 5. Acceptance set
- 48 case types (`docs/plans/program/cases/C01…C48`) + 3 fixtures (home cleaner Cancún; nail salon, 4-person team, Playa del Carmen; Parrilla El Paisa from the pasted link) × 2 Looks each = 102 composed sites on a seeded test tenant (never a live tenant).
- Per site: header + hero + one inner page at 1440 and 390, rendered through the real render path, saved under `docs/plans/templates/evidence/<case>/<look>/`.
- Gates: every tree passes `validateBuilderNodeTree`; no `look://` or `{{` left; no banned words; no image slot empty; catalogue + transaction blocks present in markup (assert the render, not the resolver).
- Cost: SQL over `cms_ai_usage_log` grouped by `context_jsonb->>'site_compose_id'` including `ok=false` rows; table in handoff.
- Time: compose ≤ 120 s wall clock measured per site.

## 6. Risks named now
- No OpenAI key in prod → generated stock cannot be produced there; family packs can be generated locally if a key exists on this machine, else licensed supply stops at the owner's account (D-TPL-7).
- `site_shell` creation outside the backfill action is new territory; verify the render path (`shell-reads.ts:346`) accepts a provisioning-created row.
- Copy pass and image fallbacks must be proven by a rendered page, not a returned tree (contract §3 rule 4).
