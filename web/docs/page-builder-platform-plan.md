# Page Builder Platform — Execution Plan (multi-agent)

> Canonical engineering plan for turning the page builder into ONE reusable Page Builder Core
> reused across Platform Admin, Workspace/Agency admin, Talent Max, and future Tulala apps —
> plus a Platform Admin **Builder Lab** that authors/tests templates against real data and
> publishes them into the Workspace + Talent builders' gallery.
>
> This file is the single source of truth for the multi-agent build. Each agent reads the
> **Hard rules** + the **Architecture** + only its assigned **Workstream**.

---

## Hard rules (every agent — non-negotiable)

1. **One Page Builder Core only.** Different surfaces differ ONLY by *config / permissions / connectors / templates / publish-targets* — never by duplicated builder code. Do not fork the editor.
2. **Freeform builderTree everywhere.** No new `composition[]` writes. **No new `cms_page_sections` writes from any new surface.** Page templates, section templates, and connected templates MUST become editable freeform layers after insertion (every node carries `data-builder-node-id`, immediately editable; never a locked page).
3. **Homepage stays byte-identical in Phase 1–3.** The existing homepage path (`server/homepage.ts`, the only legacy `cms_page_sections` writer) is *frozen and wrapped*, not changed, until Phase 4.
4. **Branch off latest `main`** (`git fetch origin && git switch -c <type>/<topic> origin/main`); never commit to `main`. One migration per agent (`date -u +%Y%m%d%H%M%S` for the timestamp). `npm run db:push` before merge if you add a migration.
5. **Gate before every commit:** `cd web && npx tsc --noEmit && npm run lint` + the builder-node + edit-chrome test suites. Tests use the node runner: `node_modules/.bin/tsx --test <file>` (NOT vitest).
6. **Worktree `.env.local` carries prod secrets** — never commit it; remove after QA.
7. If you change behavior an agent downstream depends on, document the exact new signature in your handoff summary.

---

## Architecture (shared by all agents)

### A. Shared Core — Builder Context / Adapter (no rewrite)
Inject one `surfaceConfig: BuilderContextConfig` prop into `EditProvider` (`edit-context.tsx`); replace the ~6 hardcoded homepage call-sites (imports L40-58; calls ~3827 load, 4487/6703 save, restore) with calls through `surfaceConfig.surface`. The adapter speaks the **existing `CompositionData` shape** (`composition-actions.ts`) as its lingua franca → the 7782-line provider's internals stay untouched (~30 lines of churn).

```
src/lib/site-admin/builder-core/
  surface-kind.ts        # BuilderSurfaceKind: homepage | workspace_page | talent_page | platform_lab
  surface-adapter.ts     # BuilderSurfaceAdapter { kind, load(ctx), save(ctx,input), publish(ctx,input), restoreRevision?() }
  config.ts              # BuilderContextConfig { surface, permissions, galleryPolicy, dataSources, previewSubjectKind, capabilities }
  legacy-write-guard.ts  # assertNoLegacyBuilderWrite(kind, table) — throws if non-homepage writes cms_page_sections
  adapters/{homepage,platform-lab,workspace-page,talent-page}-adapter.ts
  mount/BuilderEditorMount.tsx  # reusable wrapper: mounts <EditShell> for a given BuilderContextConfig (outside the storefront ?edit=1 flow)
```
`EditChromeMount` keeps building the homepage config (storefront-only, unchanged). New mount points build their own config with a different adapter — same `EditProvider`, zero duplicated code. `homepage-adapter` is a **pure pass-through** over the existing 4 actions → byte-identical.

### B. Template Registry (DB-backed, freeform)
ONE `builder_templates` table (kind discriminator) + `builder_template_revisions` (mirrors `cms_page_revisions`). Payload is always freeform `builder_tree` JSONB — never slots.

```sql
-- builder_template_kind:  element | section | connected | page_template | starter_kit
-- builder_template_status: draft | in_review | published | archived
-- builder_template_target: talent | workspace | both | platform
create table public.builder_templates (
  id uuid primary key default gen_random_uuid(),
  kind builder_template_kind not null,
  status builder_template_status not null default 'draft',
  target_context builder_template_target not null default 'both',
  title text not null, slug text not null, description text,
  category text not null,                 -- maps to AddGalleryCategoryDef.id
  gallery_tab text not null,              -- sections|elements|connected|page_templates
  tags text[] not null default '{}',
  thumbnail_asset_id uuid references media_assets(id) on delete set null,
  hero_asset_id uuid references media_assets(id) on delete set null,
  required_plan text not null default 'free',     -- free|studio|agency|network
  required_talent_tier text,                       -- null|talent_basic|talent_pro|talent_portfolio
  builder_tree jsonb not null default '[]'::jsonb, -- subtree (element/section) | full tree (page_template)
  theme_tokens jsonb,
  data_binding_requirements jsonb not null default '[]'::jsonb,  -- BuilderDataSourceKey[] (walked from tree on save)
  schema_version integer not null default 1,
  version integer not null default 1,
  published_at timestamptz,
  source_tenant_id uuid references agencies(id) on delete set null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kind, slug)
);
create table public.builder_template_revisions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references builder_templates(id) on delete cascade,
  version integer not null, status builder_template_status not null,
  snapshot jsonb not null, note text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (template_id, version)
);
-- RLS: read published to all authenticated; super_admin full access via is_super_admin().
```
Lifecycle actions (`builder-core/templates/registry-actions.ts`, super_admin-gated): `createTemplateDraft`, `updateTemplateDraft`, `submitTemplateForReview`, `publishTemplate` (bump version + revision), `unpublishTemplate`, `archiveTemplate`, `duplicateTemplate`, `restoreTemplateRevision`, `listPublishedTemplates({targetContext, galleryTab, plan, dataSources})`. Keep `cms_workspace_templates` as-is (personal "save my page"); do not extend it.

### C. Add Gallery → Template Gallery (code + DB merge)
`registry-db-merge.ts`: `listGalleryItems(galleryPolicy)` = code catalog (filtered by allowed tabs) + `listPublishedTemplates(...)` mapped to `AddGalleryItem`. New **"Page Templates"** tab + new **`dbTemplate`** insert method that resolves the row's `builder_tree`, **re-mints every node id** (reuse the living-component id-remint), and routes through `insertBuilderComponent` → `applyBuilderNodeOperation`. Page templates land as an editable freeform container subtree. `assertAddGalleryBuilderTreeOnly` stays (`dbTemplate` is allowed; `legacyCompositionSlot`/`cmsPageSectionSlot` stay forbidden).

### D. Preview contexts (talent + workspace)
Extend `SectionEmbedRenderContext` (`builder-node/section-embed-renderer.tsx:47`) with `previewSubject?: { kind: "talent"|"workspace"; id; locale? }`. Each connected resolver (`featured-talent-freeform`, `location-discovery-freeform`, `talent-discipline-freeform`, `workspace_profile`) gains a 3-line preamble: when `previewSubject` matches its kind, resolve data scoped to `previewSubject.id` instead of `context.tenantId`. Published storefront renders pass `previewSubject: null` → unchanged.

### E. Plan/tier gating
`required_plan` (rank free<studio<agency<network via existing `PLAN_RANK`) + `target_context` + `required_talent_tier` (Max-only). Enforced server-side in `listPublishedTemplates` AND re-checked in the `dbTemplate` insert action.

### F. Safety guards (no legacy writes)
1. Runtime: `assertNoLegacyBuilderWrite(kind, table)` in every non-homepage adapter `save/publish`.
2. CI test: `legacy-write-guard.test.ts` greps non-homepage adapters + `builder-lab/` for `cms_page_sections` / `.from("cms_page_sections")` / `composition[`; fails on any hit.
3. New surfaces persist only to pure-freeform tables.

### G. Migration path (Phase 4, deferred)
`convertCmsPageToFreeform(pageId)` reuses `buildLegacySectionBuilderTree`; homepage converted last, per-tenant flag, slots retained read-only.

### Builder Lab (Platform Admin)
New platform page `builder-lab` registered in 3 spots: `state/types.ts` `PlatformPage` union, `state/fixtures.ts` `PLATFORM_PAGES`+`PLATFORM_PAGE_META`, `platform.tsx` `PlatformRouter` switch (deep-link `?platformPage=builder-lab`). Super_admin-gated.
```
src/components/admin/shell/internal/page-modules/BuilderLabPage.tsx
src/components/builder-lab/{builder-lab-shell,preview-subject-picker,builder-lab-stage,template-manager}.tsx
```
Two areas (Talent Lab / Workspace Lab) + Templates. Pick a real talent/workspace → set the **preview subject** → `BuilderEditorMount` mounts the shared editor with the `platform_lab` adapter (persistence = **ephemeral**; autosave → no-op sink, never `saveHomepageCompositionAction`). Header Save/Publish are replaced with **"Save as page template" / "Save section as gallery item"** → write ONLY to `builder_templates`. Template Manager = full lifecycle + metadata + publish-into-gallery per target/plan.

### Editor UX fixes (shared header, all surfaces)
- **Asset Library** button → `command-dock.tsx` `primaryItems[]`, toggles `openAssets/closeAssets` (AssetsDrawer already mounted).
- **Exit + header variants** → `TopBar` gains `headerVariant ("live"|"lab")`, `onExit`, `exitLabel`, `previewSubjectChip`; storefront default byte-stable.
- **Fix Publish dropdown** → pass existing openers into `TopBar`, map each item: Publish→`openPublish`, Save draft→`saveDraft`, Preview→`setPreviewing(true)`, Revision history→`openRevisions`, Page settings→`openPageSettings`, Duplicate page→`requestPagesPickerOpen`, Unpublish/Archive→PublishDrawer; keep Schedule (drawer exists); remove genuine stubs (named-draft, discard). No new server actions.
- Empty new page = full-width freeform container; canvas highlights **+ Add** → add Section / Page Template.

---

## Workstream breakdown (agent ↔ model ↔ deps)

| WS | Title | Model | Phase | Depends on | Primary files |
|----|-------|-------|-------|-----------|---------------|
| **WS1** | Core Adapter Seam | **opus** | 1 | — | `builder-core/{surface-kind,surface-adapter,config,legacy-write-guard}.ts`, `adapters/homepage-adapter.ts`, `builder-core/mount/BuilderEditorMount.tsx`, `edit-context.tsx`, `edit-chrome-mount.tsx` |
| **WS2** | Template Registry | **sonnet** | 2 | — | `supabase/migrations/<ts>_builder_templates.sql`, `builder-core/templates/{registry-actions,registry-rows}.ts` |
| **WS3** | Editor UX Fixes | **sonnet** | 1 | — | `command-dock.tsx`, `topbar.tsx` |
| **WS4** | Template Gallery + Preview Context | **opus** | 2 | WS1, WS2 | `add-gallery/{registry-db-merge,perform-insert,insert,registry,types}.ts`, `builder-node/section-embed-renderer.tsx`, the 3 freeform resolvers |
| **WS5** | Platform Builder Lab | **opus** | 2 | WS1, WS2, WS4 | `page-modules/BuilderLabPage.tsx`, `components/builder-lab/*`, `adapters/platform-lab-adapter.ts`, `state/types.ts`, `state/fixtures.ts`, `platform.tsx` |
| **WS6** | Consumer Surfaces (workspace + talent) | **sonnet** | 3 | WS1, WS4, WS5 | `adapters/{workspace-page,talent-page}-adapter.ts`, `supabase/migrations/<ts>_talent_pages.sql`, workspace-admin + talent-Max mount points |
| **WS7** | Homepage Legacy-Cut (DEFERRED) | **opus** | 4 | WS1, WS6 proven in prod | `server/homepage.ts`, `convert-cms-page-to-freeform.ts`, per-tenant flag |
| **WS8** | Test & QA Harness | **sonnet** | cross | WS1, WS2, WS6 | `builder-core/*.test.ts`, `add-gallery/*.test.ts`, browser QA notes |

**Execution waves (DAG):**
- **Wave A (parallel):** WS1 (opus) ‖ WS2 (sonnet) ‖ WS3 (sonnet)
- **Wave B:** WS4 (opus) — after WS1, WS2
- **Wave C:** WS5 (opus) — after WS4 (builds the reusable `BuilderEditorMount`)
- **Wave D:** WS6 (sonnet) — after WS5 (reuses the mount pattern)
- **Wave E:** WS8 (sonnet) — after WS6 (comprehensive safety/parity/lifecycle suite + browser QA)
- **WS7 — DO NOT RUN in this build.** Phase 4; only after WS1–WS6 are merged and proven in production behind a per-tenant flag.

Each implementation WS ships its own unit tests + passes the gate before handoff. WS8 adds the cross-cutting safety/parity proofs.

---

## Per-workstream acceptance

- **WS1:** Homepage editing is byte-identical (a parity test compares adapter vs direct-action payloads). `BuilderContextConfig`/`BuilderSurfaceAdapter` exist; `homepage-adapter` pass-through; `BuilderEditorMount` mounts the editor for an arbitrary config; `assertNoLegacyBuilderWrite` + its unit test. tsc/lint green.
- **WS2:** Migration applies (`db:push`); RLS = read-published / super_admin-write; all lifecycle actions + `listPublishedTemplates`; `data_binding_requirements` computed by walking the tree. Lifecycle + RLS unit tests.
- **WS3:** Asset Library button opens the drawer; Publish dropdown opens and every item fires the correct existing opener; header variants render; storefront header byte-stable. `publish-menu.test.tsx`.
- **WS4:** `dbTemplate` insert re-mints ids, yields editable freeform nodes (no locked page), passes `assertAddGalleryBuilderTreeOnly`; "Page Templates" tab; gallery merges code+DB filtered by policy; `previewSubject` hydrates connected nodes from a chosen subject; published renders unchanged. Insert + preview tests.
- **WS5:** Builder Lab page loads (Talent/Workspace/Templates); subject pickers hydrate real data in-canvas; editor mounted with `platform_lab` ephemeral adapter (a spy proves `saveHomepageCompositionAction` is never called); "Save as template" writes only `builder_templates`; Template Manager does full lifecycle + publish-to-gallery.
- **WS6:** Workspace pages → `workspace_pages.blocks`; talent pages → new `talent_pages.blocks`; both mount the shared editor; gallery filtered by target/plan/tier (server-enforced); **zero** `cms_page_sections` writes (proven by the guard + a runtime spy). Migrations applied.
- **WS8:** All of: homepage parity, legacy-write static+runtime guard, ephemeral-persistence spy, dbTemplate-freeform, publish-menu, registry lifecycle/RLS. Browser QA checklist executed with screenshots.

## QA (WS8 + each agent)

Browser QA via `npm run dev` + dev-signin `/api/dev/signin?email=qa-admin@impronta.test&next=/platform/admin?platformPage=builder-lab`:
1. Builder Lab loads (Talent / Workspace / Templates).
2. Add Gallery shows **Page Templates**; inserting one yields editable freeform layers (Navigator + `data-builder-node-id` on every node).
3. Talent preview: real bio/photos/services hydrate; `cms_page_sections` untouched (network + DB).
4. Workspace preview: roster/brand hydrate; active tenant unchanged.
5. Asset Library opens; Exit works (lab vs live); Publish dropdown every action works.
6. Publish a template from the Lab → appears in Workspace and/or Talent Add Gallery per target/plan, inserts as freeform.

Gotchas: middleware host-gate ⇒ raw `*.vercel.app` previews 404 (QA on localhost/seeded host). Worktree `.env.local` = prod secrets, remove after QA.
