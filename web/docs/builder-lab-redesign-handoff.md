# Builder Lab Redesign + Impronta Home — Agent Handoff

_Last updated: 2026-06-14. Hand this to a fresh chat/agent to continue._

Two workstreams:
- **(A) Builder Lab redesign** — the ACTIVE work. Continue here.
- **(B) Impronta home (Casting-Issue)** — built + sitting in the DRAFT, **not published** (go-live is gated on the user's explicit OK).

---

## 0. Environment & access — READ FIRST

- **Dev server:** `cd web && PORT=3000 npm run dev` → http://localhost:3000. **Use `localhost:3000` for EVERYTHING** (platform admin + editor).
  - `.env.local` sets `NEXT_PUBLIC_APP_URL="https://app.tulala.digital"` (PROD). So `/platform/admin` and `/login` only resolve on **localhost** locally — NOT on `app.lvh.me` (that 404s). **Lesson (big time-sink avoided):** a "Page not found" on the platform admin almost always means **the dev server crashed** (restart it) or **stale HMR after branch switches** (restart clears it) — not a host-routing problem.
- **Dev auth (passwordless, dev-only):** `http://localhost:3000/api/dev/signin?email=qa-admin@impronta.test&next=<path>`. `qa-admin@impronta.test` is a verified **super_admin** → full platform access. (Auth/preview JWTs expire fast; re-hit signin if the editor drops to public.)
- **Builder Lab:** http://localhost:3000/platform/admin/builder-lab
- **Impronta home editor:** http://localhost:3000/impronta?edit=1 (after signin). If scope is missing, set cookie `impronta.active_tenant_id=00000000-0000-0000-0000-000000000001` via JS, then reload.
- **Prod Supabase ref:** `pluhdapdnuiulvxmyspd` — **this is PRODUCTION** (`.env.local` points here). Read-only introspection via Supabase MCP `execute_sql` with `project_id=pluhdapdnuiulvxmyspd`.
- **Gate before every commit:** `cd web && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` (default heap OOMs → FALSE green; always use the big heap) **+** lint: `node -r ./scripts/eslint-node-polyfill.cjs ./node_modules/eslint/bin/eslint.js <files> --quiet --suppressions-location eslint-suppressions.json`.
- **DB writes are classifier-gated.** Prod `UPDATE`s and the home **Publish** get blocked unless the user explicitly authorizes — never circumvent (don't route a blocked publish through a raw script).
- **Branch workflow:** branch off latest `main`; `main` auto-deploys to Vercel. `main` is also checked out in a sibling worktree (`/Users/oranpersonal/Desktop/impronta-app-email`), so `gh pr merge --delete-branch` fails the *local* cleanup step — merge **without** `--delete-branch` (the remote merge still succeeds).

---

## A. Builder Lab redesign (CONTINUE HERE)

### Vision (user-confirmed)
Reorganize the Builder Lab into **one umbrella: Catalog (the default landing)** with **7 inner tabs**:

**Layout · Elements · Sections · Connected · Site Starter Kit · Site Defaults · Playground**

- **Layout / Elements / Sections / Connected** = the component inventory (per-surface visibility toggles, rename/category/plan overrides → `builder_catalog_overlay`).
- **Site Starter Kit** = the full-page starter designs (placeholder now; intended to surface `PAGE_DESIGN_SUMMARIES`, e.g. "Impronta agency").
- **Site Defaults** = the platform default-theme editor (moved here from the old top row).
- **Playground** = the **workbench**: a list of all your draft pages (Catalog-style list + `All / Draft / In Review / Published / Archived` pills); a single **"+ New"** button → pick **Target: Talent / Workspace / Both** → opens the editor (subject-less); you pick/switch the preview subject INSIDE the editor; **publishing happens here** (the "Published" state replaces a separate Templates tab).

**Removed:** Talent Lab, Workspace Lab, Templates top-level tabs (absorbed into Playground "+ New" + the in-editor subject picker + the lifecycle).

Two concepts to keep distinct:
- **Target** = who a draft is *for* → `builder_templates.target_context = talent | workspace | both`.
- **Preview subject** = the specific talent/workspace you author *against* (real data hydration) — chosen/switched inside the editor.

### DONE — Phase 0 + Phase 1 (branch `feat/builder-lab-catalog-tabs`, PR #419 — MERGED to `main` at handoff)
1. **Catalog default + 7-tab inner nav.** `component-catalog.tsx`: Layout/Elements/Sections/Connected (inventory tables) + Site Starter Kit (placeholder) + Site Defaults (renders the moved `SiteDefaultsEditor`) + Playground (placeholder). Stats/search show only on the component tabs. `builder-lab-shell.tsx`: Catalog is the default tab; Site Defaults removed from the top row.
2. **In-editor subject switcher (Phase 1 keystone).** The editor header's static "Talent: X" chip is now a live **"Pick a talent / Pick a workspace" dropdown** (same search + photo list as the Lab pickers). Selecting rebuilds connected render-data for `{subject, live tree}` via the new server action `buildLabCanvasRenderData` → fed back as the **reactive `canvasRenderData` prop** → connected nodes re-hydrate **without remounting** (the design survives the switch). Verified live (Adriana Vega → Alba Reyes).
   - Files: `web/src/components/builder-lab/builder-lab-stage.tsx`, `web/src/lib/site-admin/builder-core/lab/lab-canvas-render-data.ts`.

### TO DO — Phase 2 (entry-point swap)
- In **Playground** (`component-catalog.tsx`, the `site_*`/`playground` view branch): add a **"+ New"** button → pick **Target: Talent / Workspace / Both** → launch the editor (`BuilderLabStage`) subject-less.
  - Editor launch currently lives in `builder-lab-shell.tsx` (`SubjectArea` → `setEditing(true)` → renders `BuilderLabStage`). Refactor so Playground's "+ New" triggers the same mount. `BuilderLabStage` already opens subject-less (`subject={null}`).
  - **Both target** → the editor should expose BOTH a talent and a workspace picker (extend `BuilderLabStage`'s single-`area` picker into a kind-toggle / dual picker).
- **Remove** the **Talent Lab**, **Workspace Lab**, **Templates** top-level tabs from `builder-lab-shell.tsx`. (`TemplateManager`'s publish lifecycle conceptually moves into Playground.)

### TO DO — Phase 3 (persistent Playground draft list) — **NEEDS A DECISION (ask the user)**
The Lab canvas is currently **EPHEMERAL** (the `platform_lab` adapter's save/autosave/publish are no-op sinks). Playground's "list of drafts" needs persistence:
- **(A, recommended)** Reuse **`builder_templates`** + its status lifecycle: a Playground draft = a draft template bound to a preview subject; publishing promotes it. No new table; already has the exact `draft/in_review/published/archived` pills + `target_context`. Actions: `web/src/lib/site-admin/builder-core/templates/registry-actions.ts` (`createTemplateDraft`, `publishTemplate`, …). Model the Playground list UI after `web/src/components/builder-lab/template-manager.tsx`.
- **(B)** A new `playground_drafts` table (pure scratch). More infra.

### Key Builder Lab files
- Shell / tabs: `web/src/components/builder-lab/builder-lab-shell.tsx`
- Catalog (7-tab inner nav, Site Defaults + Playground views): `web/src/components/builder-lab/component-catalog.tsx` _(has a justified `/* eslint-disable max-lines */`)_
- Editor stage + in-editor subject switcher: `web/src/components/builder-lab/builder-lab-stage.tsx`
- Subject picker (reusable search+photo list): `web/src/components/builder-lab/preview-subject-picker.tsx`
- Subject search actions: `web/src/lib/site-admin/builder-core/lab/preview-subject-search.ts`
- **NEW** render-data action: `web/src/lib/site-admin/builder-core/lab/lab-canvas-render-data.ts`
- Canvas render-data builder: `web/src/lib/site-admin/builder-core/in-editor-canvas-render-data.ts` (needs `{tree, tenantId, locale, previewSubject:{kind,id}}`)
- Live tree hook: `useBuilderTree()` — `web/src/components/edit-chrome/builder-tree-bridge.ts`
- Reactive canvasRenderData consumer: `web/src/components/edit-chrome/in-editor-canvas-region.tsx`
- Template lifecycle UI/actions: `web/src/components/builder-lab/template-manager.tsx`, `web/src/lib/site-admin/builder-core/templates/registry-actions.ts`
- Site Defaults editor: `web/src/components/builder-lab/site-defaults-editor.tsx`
- Route: `web/src/app/(workspace)/platform/admin/builder-lab/page.tsx`
- Gating model: `builder_templates.target_context` (talent/workspace/both), `builder_catalog_overlay` (per-surface enable/label/category/plan).

---

## B. Impronta home (Casting-Issue) — DONE in draft, NOT live

- The Impronta home is rebuilt as the **13-section "Casting-Issue" design** in **freeform primitives** (composable, NOT closed components — that was an explicit user correction), token-bound (editorial-noir black/gold). The complex sections (`featured_talent`, `talent_type_grid`, `marquee`) stay as components. Source: `web/src/lib/site-admin/builder-node/page-designs/impronta.ts`.
- **Seeded to the DRAFT** in prod Supabase: cms_pages `90552cf6-2230-4a40-8320-c2e303e3ee56`, tenant `00000000-0000-0000-0000-000000000001` (Impronta hub), draft revision **rev 1419**. **The LIVE published home is UNCHANGED.**
- Merged PRs: **#385** (token-binding), **#388** (recovery-bug fix), **#401** (casting-issue build), **#414** (freeform rebuild).
- Spec: `web/docs/impronta-home-2026-design-kit.md` (authoritative 13-section brief). The original HTML mockup `impronta-home-2026.html` is **lost** (never committed).
- **Go-live (PENDING + GATED):** publish via the editor at `localhost:3000/impronta?edit=1` → **Publish** button (page-only — do **NOT** publish the Theme drawer's draft; that draft is a stale LIGHT theme, while live `theme_json` is already noir+gold). Publish is **classifier-gated and needs the user's explicit OK**. After publishing: re-alias domains + `cd web && npm run deploy:smoke`.
- Re-seed the draft if needed (DRAFT-ONLY): `cd web; git checkout <commit-with-impronta.ts> -- web/src/lib/site-admin/builder-node/page-designs/impronta.ts` (it's on `main` now) `; npx tsx scripts/bake-impronta-tree.mts > /tmp/impronta-tree.json; npx tsx --env-file=.env.local scripts/seed-impronta-revision.mts`. **NEVER run `scripts/seed-impronta-homepage.mts`** (writes the LIVE published snapshot).

### Publish attempt — 2026-06-15 findings (READ before the next publish try)

A real publish was attempted via the localhost editor (`/impronta?edit=1` → Publish) on the **real production Impronta tenant** (`00000000-…-0001` = "Impronta Models", serving improntamodels.com + impronta.tulala.digital — the seed-looking UUID is genuinely production). **Nothing was published** (the gate blocked it) and **no data was deleted**. The draft is now **rev 1420** (14 well-formed roots — 13 containers + 1 marquee `section_embed`; renders correctly in noir/gold with live connected talent, no console errors).

The publish preflight surfaced **4 blockers** that disable "Publish now", from two unrelated causes:

1. **2 LAYOUT blockers — a REAL home bug.** Container `builder-container-657d86…3635c0cbdd9f` is `layout:"grid"`, `columns:4` (4 children) with a tablet override (`responsive.tablet.gridTemplateColumns: repeat(2,…)`) but **no mobile override** → stays multi-column on phones and clips. **Fix:** add `style.responsive.mobile.gridTemplateColumns: "repeat(1,minmax(0,1fr))"` — in the editor (select block → Style → responsive → mobile → 1 col) or in `impronta.ts` then re-bake/re-seed.

2. **2 ALT-TEXT blockers — production QA pollution, NOT the home.** "Phase E QA — Scroll carousel" + "Phase E QA — Masonry" come from a **separate QA test page `audit-batch3`** (`cms_pages.id=b4e8f2a1-0000-0000-0000-000000000001`, `status=published` → live broken page at improntamodels.com/audit-batch3) with 14 synthetic fixture sections. **Why it blocks the home:** `runPublishPreflight` (`src/lib/site-admin/edit-mode/publish-preflight-action.ts`) calls `listSectionsForStaff(tenantId)`, which scans **every `cms_sections` row for the tenant** (no page/status filter) — so unrelated pages' bad sections block ANY page's publish. Archiving the page does NOT help (preflight reads section rows directly). **To unblock, one of:** (a) delete the `audit-batch3` page + its fixture `cms_sections` rows (back up first — it's QA junk + a live broken page, so removal doubles as cleanup), or (b) scope the preflight's section audit to the page being published (broader change; affects all tenants — needs care + tests). **User decision 2026-06-15: declined to delete the QA page; publish stopped — home stays draft.**

**Publish mechanism that works** (once the above are resolved): publishing via the localhost editor writes `published_homepage_snapshot` to prod Supabase; prod self-heals within **5 min** via the `revalidate: 300` TTL on `loadPublicHomepage` (`homepage-reads.ts`) — no prod redeploy needed. Flow = `publishHomepage` (`server/homepage.ts:1087`) via the editor's Publish button (needs editor auth + CAS version + localStorage style-class registry — NOT a raw script).

---

## C. Outstanding / follow-ups
- **Fidelity goldens** are red on `main` (token-binding changed the impronta render). Re-seed via the `.github/workflows/builder-fidelity.yml` `workflow_dispatch` (`update_snapshots=true`, macos-14 runner) → download the artifact → commit PNGs into `web/e2e/fidelity/fidelity.spec.ts-snapshots/`. Needs the GitHub Actions UI or a `gh` token with `workflow` scope (local token lacks it).
- **Site Starter Kit** content (Catalog) — placeholder; wire `PAGE_DESIGN_SUMMARIES` (`web/src/lib/site-admin/builder-node/page-designs/summaries.ts`).
- **Playground draft list** — Phase 3 above.

---

## D. Branches & PRs
- Repo: `github.com/orantene/impronta-app`. Deploy: Vercel (auto-deploys `main`). Supabase project `pluhdapdnuiulvxmyspd`.
- `main` — all merged work (#385/#388/#401/#414 home; #419 Builder Lab redesign Phase 0+1).
- Branch off latest `main` for Phase 2.

---

## E. Gotchas / lessons
- **localhost:3000** for platform admin + editor. A platform 404 ≈ crashed dev server (restart) or stale HMR (restart).
- Builder Lab canvas is **ephemeral**; durable output = `builder_templates`.
- **Recovery bug (fixed in #388):** `recoverBuilderTreeIfEmpty` measured emptiness by top-level array length, so a full single-root tree got "recovered" to a stale (garbage) revision. Now counts recursively (`web/src/lib/site-admin/server/recover-builder-tree.ts`).
- Two seams resolve the homepage draft: version-matched (canvas/publish, recovers) vs newest-by-created_at (`loadDraftRevisionExtras`, editor React state, no recovery). They can disagree — keep that in mind for any draft-load work.
- `tsc` default heap OOMs and reports a false green — always `NODE_OPTIONS=--max-old-space-size=8192`.

---

## F. New-chat prompt (paste this to start the next agent)

> Continue the **Builder Lab redesign** for the Tulala/Impronta page-builder (Next.js + Supabase, repo `orantene/impronta-app`). **First read `web/docs/builder-lab-redesign-handoff.md`** — it has the full state, plan, file references, env, and gotchas.
>
> We're on **Phase 2**: in the Builder Lab → Catalog → **Playground** tab, add a **"+ New"** button (pick Target: Talent/Workspace/Both) that opens the editor subject-less; for "Both" the editor exposes both talent + workspace pickers; then **remove the Talent Lab, Workspace Lab, and Templates top-level tabs**. Then **Phase 3** (persistent Playground draft list) — **confirm persistence option A (reuse `builder_templates`) vs B (new `playground_drafts`) with me before building it**.
>
> Dev: `cd web && PORT=3000 npm run dev`; sign in at `http://localhost:3000/api/dev/signin?email=qa-admin@impronta.test&next=/platform/admin/builder-lab` (qa-admin is super_admin); verify every change in Chrome on `localhost:3000`. Gate with big-heap `tsc` + eslint before each commit. Branch off latest `main`.
>
> Phase 1 (in-editor subject switcher) is **done + merged**. **Do NOT publish the Impronta home** (it's a gated, live-customer action) — it's built and sitting in the draft only.
