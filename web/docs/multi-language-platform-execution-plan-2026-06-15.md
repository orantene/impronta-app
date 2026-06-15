# Multi-Language Platform — Multi-Agent Execution Plan

_Authored 2026-06-15. Coordinator: main agent. Status: **REFINING** (no code until plan is locked)._

## Decision log

- ✅ **MODE = AGGRESSIVE (pre-launch).** No expand/contract, no dual-read shims, no backfill window. Migrations transform `_es → _i18n` and **drop** the old columns in one shot. Clean 2026 build.
- ✅ **Storage shape = pure per-locale JSONB map** (`label_i18n jsonb = {"en":…,"es":…}`). No legacy base column retained. Adding a language = data, not schema.
- ✅ **Homepage/CMS builder = unify on per-element overlay.** Migrate ES locale-rows into `node.i18n.es`, delete whole-page-swap path.
- ✅ **R1:** talent preference overrides agency default for the talent's **own dashboard + their public page**, constrained to the agency's supported set.
- ✅ **R2:** build the **full back-end translation infra** (dynamic message catalogs + locale-keyed lookups + Translation Center). FE + BE both honor default; ES chrome copy is data that follows.
- ✅ **R3:** **primary** (= default + first fallback) + **ordered secondary** list.
- ✅ **R4:** drop `_es` columns in the migration (no keep-as-backup).

## Refinement questions (resolve before Phase 0)

**R1 — What does a talent's "preferred language" control?** Three distinct things it could mean: (a) the language of the talent's **own dashboard/back-end UI**; (b) the **default language of their public talent page**; (c) both. The agency already sets a tenant default; talent pref would **override** it for their surfaces. _Recommend: (c) both, talent pref overrides agency default for the talent's own dashboard + their public page, still constrained to the agency's supported set._

**R2 — Does the operator/back-end *chrome* get translated, or just content?** Today the dashboard nav ("Website/Pages/Posts/Configuration") is hardcoded English; only content + field labels translate. Full chrome translation = WS7 (dynamic message catalogs + the 155-ternary sweep + translating every UI string). _Recommend: phase it — content/field/taxonomy/builder translation first (the product value), dashboard-chrome translation as a fast-follow, since it's a large independent string-translation effort._

**R3 — Default + secondary: ordered list or true primary/secondary?** Options: (a) one **primary** + an **ordered** secondary list (fallback follows the order); (b) flat co-equal set with one flagged default. _Recommend: (a) — primary is the default + first fallback target; secondaries are ordered so a 3-language tenant has deterministic fallback._

**R4 — After migration, drop the `_es` columns or keep them?** _Recommend: keep through a full release cycle as a read-only backup, drop in a later contract migration once prod is verified._


## Goal (product owner's vision)

1. **Platform admin adds a language** in a DB registry → a translation slot for it appears across **all** fields, taxonomy, and builder content.
2. **Agency and talent** each pick their language(s) from the platform-provided set. Multi-language → pick a **default + secondary**; single-language → just one.
3. That choice drives the **default language everywhere** — public front-end (storefront → homepage) **and** back-end (dashboard, page builder).
4. **Single language → no switcher** anywhere. Multi → switcher appears.
5. **Page builder authors translations per element, inline** (EN/ES tabs per text field, status dots, top-header toggle, 40%-opacity "needs translation" cue).

## Why this is a "finish", not a "build"

The audit found the foundation already exists but the content + authoring layer is hardwired to en/es:

- ✅ `app_locales` registry table (with `enabled_admin`/`enabled_public`/`is_default`/`fallback_locale`) — designed for exactly this, but **no write UI** and nothing sources from it.
- ✅ Routing/middleware/fallback resolve locale dynamically; `Locale = string` in `i18n/config.ts`.
- ✅ Public storefront / homepage / auth / in-place builder editor already honor `default_locale` + `supported_locales` and hide the switcher when single-language.
- ❌ Content stored in **hardcoded `_es` columns** (~1,150 refs) + **155 `locale === "es"` branches**.
- ❌ A competing hardcoded `PLATFORM_LOCALES = ["en","es"]` union + DB CHECK constraints that **reject** a third locale.
- ❌ No platform admin UI; no talent-tier preference; `DashboardLocaleToggle` hardcodes EN│ES.
- ✅ A fully-built but **unmounted** "Translation Center" for per-locale authoring.

---

## 0. LOCKED CONTRACTS (Phase 0 — serial, lands first, coordinator-owned)

Everything below is frozen before fan-out so the 7 workstreams code against **interfaces, not each other**. Ships behind no behavior change (data stays en/es-only until a real language is added).

### 0.1 Locale registry = `app_locales` as single source of truth

```ts
// @/lib/i18n/contracts
export type LocaleCode = string; // ISO: "en", "es", "fr", "pt-BR"

export interface PlatformLocale {
  code: LocaleCode;
  labelNative: string;       // "Español"
  labelEn: string;           // "Spanish"
  enabledAdmin: boolean;     // selectable for dashboard/back-end
  enabledPublic: boolean;    // selectable for storefront/front-end
  isDefault: boolean;        // platform default
  fallback: LocaleCode | null;
  sortOrder: number;
}
export function getPlatformLocales(): Promise<PlatformLocale[]>;  // cached, from app_locales

export interface TenantLocaleSettings {
  defaultLocale: LocaleCode;        // the "primary"
  secondaryLocales: LocaleCode[];   // ordered "secondary" set
  supportedLocales: LocaleCode[];   // = [default, ...secondary], derived
  showSwitcher: boolean;            // forced false when supported.length <= 1
  fallbackChain: (l: LocaleCode) => LocaleCode[]; // [l, l.fallback, …, platformDefault]
}
export function getTenantLocaleSettings(tenantId: string): Promise<TenantLocaleSettings>;
```

**Decision:** delete `PLATFORM_LOCALES`/`isLocale()` union (`lib/site-admin/locales.ts`); re-export thin shims that validate against the registry so the ~18 call sites keep compiling during migration.

### 0.2 Universal translation storage + resolver

**Storage shape — per-locale JSONB map** ✅ DECIDED (simpler joins, matches the already-scaffolded `dynamic_json` strategy, RLS stays on the owning row):

```
label_es text   →   label_i18n jsonb   -- { "en": "Height", "es": "Estatura" }
```

**Universal resolver** (the ONE function every render path calls — replaces all `locale === "es" ? x_es : x_en`):

```ts
export function resolveLocalized(
  map: Record<LocaleCode, string> | null,
  locale: LocaleCode,
  chain: LocaleCode[],                 // from TenantLocaleSettings.fallbackChain(locale)
): { value: string; isFallback: boolean };  // isFallback drives the builder's red dot + 40% opacity
```

### 0.3 Migration recipe — one-shot transform (aggressive, pre-launch)

Single migration per table:
1. `ADD COLUMN *_i18n jsonb NOT NULL DEFAULT '{}'::jsonb`.
2. `UPDATE … SET *_i18n = jsonb_strip_nulls(jsonb_build_object('en', base_col, 'es', base_col_es))`.
3. `DROP COLUMN base_col, DROP COLUMN base_col_es`.
4. Regenerate `database.types.ts`; swap every reader to `resolveLocalized(*_i18n, locale, chain)`.

No dual-read window — pre-launch, so a one-shot transform is correct and clean. Apply via `db:push` (or Supabase MCP) **before** the code PR merges so the drift gate passes.

### 0.4 Builder node i18n overlay (powers the page-builder feature)

Default-locale values stay in the node's normal props; translations live in an **overlay** (backward-compatible, N-locale):

```ts
node.i18n?: Record<LocaleCode, Partial<LocalizableProps>>
// node.i18n = { es: { text: "Hola", ctaLabel: "Reservar" }, fr: { … } }

resolveNodeProp(node, "text", locale, settings) // → { value, isFallback }
```

`isFallback === true` ⇒ render that text at **40% opacity** in the editor (the "needs translation" cue) and a **hollow/red dot** in the Content panel. Element "fully translated for L" = every localizable prop has a non-empty `node.i18n[L][prop]`.

---

## 1. PAGE BUILDER — per-element inline translation (WS5, the headline feature)

The current homepage model swaps the **whole page** per locale (separate `cms_pages` rows + a navigate-and-reload `LocaleSwitcher`). We replace that with **per-element, in-session** translation on one page. Decision: migrate the homepage's ES locale-row content into the EN page's `node.i18n.es` overlays and retire the whole-page swap (fallback kept until verified).

### Behavior 1 — EN/ES tabs on each Content field

- Above every localizable text input in the **Content panel**, render `<LocaleTabStrip>`: one tab per tenant-supported locale, **default first**, each with a **status dot** — 🟢 filled = value present, 🔴 hollow = empty.
- The textarea edits the **active tab's** locale: default tab → writes `node.text` (base); ES tab → writes `node.i18n.es.text`.
- The element/panel header shows a roll-up dot: **all locales green = fully translated**.
- **Single-language tenant → no tab strip** (plain textarea). Satisfies "single language → no switcher in the builder."

### Behavior 2 — Top-header toggle drives content locale + canvas

- The edit-chrome top-bar toggle sets an **in-session `activeContentLocale`** — **no reload/navigation** (the key UX change).
- Switch to ES: (a) canvas re-renders every node via `resolveNodeProp(node, prop, "es")`; (b) nodes whose ES falls back to EN render at **40% opacity** + dotted "untranslated" outline; (c) the Content panel's per-element tabs **default to ES**.
- Switch back to default: full opacity; tabs default to the default locale.
- **Single-language tenant → toggle hidden.**

### Behavior 3 — Inline authoring of the missing translation

- Low-opacity (untranslated) text is **directly editable in-canvas**: typing while `activeContentLocale === "es"` writes to `node.i18n.es.text`, flips opacity to full + dot to green.
- Or: click the element → Content panel opens with the **ES tab already active** (because the header is on ES) → type there.
- Draft autosave persists the per-locale `node.i18n` overlay.
- **Published render** uses `resolveNodeProp` with the visitor's resolved locale + fallback chain; the 40% opacity is **editor-only**.

### Files WS5 owns
`components/edit-chrome/topbar.tsx` (replace navigate-LocaleSwitcher with in-session toggle), `components/edit-chrome/edit-chrome-mount.tsx`, the builder **Content/inspector panel** (locate the per-element props editor), the canvas node renderer (opacity + resolveNodeProp), `builder_templates`/`talent_pages` node-schema (`i18n` overlay), and the homepage locale-row→overlay migration.

---

## 2. WORKSTREAM MAP (parallel after Phase 0)

| WS | Scope | Owns (files/tables) | Migrations | Depends on |
|----|-------|---------------------|------------|------------|
| **P0** | Locked contracts (§0) | `lib/i18n/contracts`, `app_locales` read API, `resolveLocalized`, `resolveNodeProp`, kill `PLATFORM_LOCALES` union | none (read API) | — |
| **WS1** | Platform language registry admin | `app/(workspace)/platform/admin/**` language pages, `app_locales` write actions | RLS/write policy if needed | P0 |
| **WS2** | Settings hierarchy: agency picker from registry + **talent-tier preference** + **default/secondary** model | `drawers/light-05.tsx`, `server-actions/admin-workspace-settings.ts`, identity schema | relax `agency_business_identity` CHECK → registry-driven; add talent locale-pref; secondary-locale columns | P0, WS1 (iface) |
| **WS3** | Content storage: **fields + sections + groups** | `profile_field_definitions`, `profile_editor_sections`, `profile_field_groups`, `field-engine/resolve-talent-fields.ts`, `fields/field-locale.ts` | `_i18n` cols + backfill (expand) | P0 |
| **WS4** | Content storage: **taxonomy + locations + bios + services** | `taxonomy_terms`, `locations`, talent bios (`bio_en/bio_es`), `services_menu` JSON | `_i18n` cols + backfill; services per-locale name/desc | P0 |
| **WS5** | **Page Builder per-element translation** (§1) | edit-chrome, Content panel, node `i18n` overlay, canvas render, homepage migration | homepage locale-row → overlay backfill | P0 |
| **WS6** | Switcher/render fixes | `dashboard-locale-toggle.tsx` (→ config-aware), single-language hide sweep, dashboard honors tenant default, `["en","es"]` UI-default sweep | none | P0, WS2 (read) |
| **WS7** | UI message catalogs + ternary sweep + mount Translation Center | `i18n/messages.ts` (dynamic load), 155 `=== "es"` → locale-keyed, `lib/translation-center/**` routes | none | P0, WS3/WS4 (storage) |

**Real parallelism** comes from P0 freezing interfaces: WS3 and WS4 touch **disjoint tables**; WS5/WS6 touch **disjoint components**; WS1/WS2 mock each other's interface. The only serial points are P0 (first) and the final `_es`-column **drop** (contract phase, after all readers migrate).

---

## 3. COORDINATION PROTOCOL

Per repo multi-agent rules (CLAUDE.md, development-workflow.md):

- **Isolated worktrees, not the shared main checkout** (memory repeatedly warns concurrent branch-switching in the main checkout corrupts in-flight work). Each WS gets its own worktree + branch off latest `main`.
- **One migration per agent**, unique timestamp via `date -u +%Y%m%d%H%M%S` at start. Coordinator keeps a **timestamp registry** to prevent collisions; park-restore if two collide.
- **TS + lint gate before every commit:** `cd web && npx tsc --noEmit && npm run lint`.
- **`db:push` before merge** for any WS with a migration — the Vercel prebuild drift gate **fails the build** if a referenced migration isn't applied to remote Supabase.
- **Merge train (coordinator-sequenced):** P0 → WS1/WS3/WS4/WS5/WS6 (independent) → WS2 (needs WS1) → WS7 (needs WS3/4) → integration wave → contract migrations (drop `_es`) → `deploy:smoke`.
- **Never force-push `main`.**

Coordinator (me) owns: P0, the interface freeze, worktree/branch assignment, the migration-timestamp registry, merge ordering, integration QA with a **third language ("fr") as the proof**, prod backfill, and the smoke test.

---

## 4. RISK REGISTER

| Risk | Mitigation |
|------|------------|
| Live prod data on `_es` tables | Expand/contract dual-read/dual-write; drop columns only after verified |
| Migration-drift gate fails the build | `db:push` each migration before its code PR merges; coordinator sequences |
| Two parallel locale systems (`app_locales` vs `agency_business_identity`) | P0 picks `app_locales` as platform SoT; tenant settings = a validated **subset** |
| 155-ternary sweep touches many files | Assign by directory; WS7 owns the sweep, WS3/4 expose the resolver it calls |
| Homepage locale-row → overlay migration | Keep locale-row fallback path until per-element overlay verified on Impronta |
| Builder node schema change breaks existing trees | `i18n` is an additive overlay; absent overlay = today's behavior |

## 5. DEFINITION OF DONE

End-to-end with a **brand-new third language** proves the architecture:

1. Platform admin adds **"fr"** in the registry UI (WS1).
2. It appears in the agency picker; agency enables EN default + FR secondary (WS2).
3. Fields, taxonomy, bios, services show a **FR slot** to fill (WS3/WS4/WS7 Translation Center).
4. Page builder shows a **FR tab** per element with status dots; top-header FR toggle renders the page in FR with 40%-opacity gaps (WS5).
5. Public storefront shows an EN│FR switcher; a single-language tenant shows **none** (WS6 already ✅ on public).
6. Dashboard honors single-language tenants (no stray EN│ES toggle) and the tenant default (WS6).
7. `deploy:smoke` green; no `_es` columns remain.
