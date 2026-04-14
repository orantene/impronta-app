# Acceptance checklist (phased)

**Canonical build track (order + 8.6A–13 criteria):** [docs/execution-plan.md](execution-plan.md) — checkboxes for CMS, UI adoption, AI wiring, vector search, and phases 10–13 live there.

**Follow-up after the core track:** [docs/post-ai-quality-cms-backlog.md](post-ai-quality-cms-backlog.md) — **Tracks A→D** in order **A, D, B, C** (search quality, CMS remainder, refine quality, explanation quality). Does not rewrite this file.

**After CMS revisions (iteration + ship gate):** [docs/post-revisions-roadmap.md](post-revisions-roadmap.md) — ordered work for search tuning, refine, explanations, and stabilization; exit criteria and gate checklist live there.

### Post-revisions QA matrix (smoke)

Use before calling the program stable ([post-revisions-roadmap.md](post-revisions-roadmap.md) §4). Check when exercised in staging or production.

- [ ] **Auth** — talent / client / staff login redirects match [auth-flow.md](auth-flow.md).
- [ ] **Directory AI search** — hybrid listing loads; classic fallback still returns results when AI flags off.
- [ ] **Refine chips** — suggestions apply real `tax:<uuid>` params; no duplicate inflight churn on rapid typing.
- [ ] **Explanations** — grid + **list** view show the same AI match overlay when explanations are enabled.
- [ ] **Inquiry draft** — directory shortlist → inquiry flow still sends expected payload (smoke).
- [ ] **CMS publish** — page/post publish and public URL resolve (smoke).
- [ ] **Redirects** — slug change still offers or honors redirect row where product requires it (see Phase 8.6A rule in this file).

**Phases 9–13** are **closed** at first-pass baseline per [docs/execution-plan.md](execution-plan.md); the **table below** may lag — treat the execution plan **baseline snapshot** + **decision-log** as authoritative for AI phases.

This file remains the **phased audit** for foundation work (phases 1–8 and below). Mark items here when verified in staging/production. Details live in **`docs/architecture-truth.md`** and phase sections of the frozen roadmap plan.

## Roadmap status (honest snapshot)

Phases are **not** complete when only **documentation** or **placeholder shells** exist — except where the phase is explicitly an **architecture / contract / foundation** deliverable (e.g. 8.5 at doc level, 8.7 at docs+shell level).

| Phase | Status | Notes |
|-------|--------|--------|
| **1–4, 4.5** | Foundation ready | Architecture truth, DB audit, auth, talent model, AI search document — per repo audit. |
| **A / B / C / D** | Foundation ready | Ranking/match/DTO docs, `search_queries`, AI flags — where shipped in migrations + code. |
| **8.5** | **Complete (architecture-doc level)** | Site Settings IA, governance docs, entity design — **not** implementation; schema lands with 8.6. |
| **8.6** | **Expanded** | **8.6A** pages + redirects + metadata; **posts** + **navigation** tables + admin CRUD + public `/posts/…` + sitemap (migration `20260420190000_cms_posts_navigation.sql`). Remaining **8.6B** theme/globals and layout wiring for nav can still be tracked in [post-ai-quality-cms-backlog.md](post-ai-quality-cms-backlog.md). |
| **8.7** | **Complete at docs + shell layer** | Contracts + `/admin/ai-workspace` scaffold align with plan for this layer. Customer slots, Site Settings→AI, embedded admin panels remain **follow-up** if you treat full 8.7 literally. |
| **8.8** | **First-pass complete** | AI strips + `AIErrorBoundary` on shipped surfaces; optional strict 8.7 items remain. |
| **8.9** | **First-pass complete** | Rules A + B satisfied per decision-log; broad admin/CMS adoption may continue opportunistically. |
| **9** | **First-pass complete** | Hybrid directory search, embeddings worker, RPC, merge, logging, triggers — see decision-log. |
| **10–13** | **First-pass complete** | Rerank, explanations, refine, inquiry draft — **quality follow-up** = Tracks A, B, C in post-AI doc (**not** reopening phases). |

## Implementation gaps (current)

Primary **next** work is **not** re-listed here as new “Phase 9 tasks” — use [docs/post-ai-quality-cms-backlog.md](post-ai-quality-cms-backlog.md) (**Tracks A → D → B → C**). Residual items below are **optional polish** or **1–8 hygiene**.

1. **CMS remainder (Track D)** — Posts, navigation, 8.6B, audit visibility, CMS RLS polish (see post-AI doc).

2. **8.9 / 8.8 remainder (opportunistic)** — Broader admin list migration, `AIDrawer` wiring per original 8.8 language, duplicate pattern cleanup — not blocking the closed AI baseline.

3. **Phase 8.7 strict closure (optional)** — Site Settings → AI route; formal attach slots; embedded admin AI panels; optional structured agent logs.

4. **Ongoing hygiene** — `EXPLAIN` pass (Phase 2), auth redirect verification, directory URL parity, profile/inquiry smoke tests.

### Execution order (original track — closed)

The sequence **8.6A → 8.9 → 8.8 → 9 → 10 → 11 → 12 → 13** is **complete** at first-pass baseline. **Next order:** [docs/execution-plan.md](execution-plan.md) § *Next execution track* and [docs/post-ai-quality-cms-backlog.md](post-ai-quality-cms-backlog.md) — **A, D, B, C**.

## Phase 1 — Architecture truth

- [x] `docs/architecture-truth.md` exists with directory, profile, admin, inquiry mapping
- [x] Enums match DB (`profile_workflow_status`, `visibility`, `inquiry_status`, …)
- [x] Directory → API → RPC chain documented
- [x] Operational vs CMS boundary noted

## Phase 2 — DB audit

- [x] `docs/db-audit.md` with migration policy + index/RLS summary
- [ ] `EXPLAIN` pass on slow admin queries (staging task)

## Phase 3 — Auth / roles

- [x] `docs/auth-flow.md` with role → route mapping
- [ ] Manual verify: talent / client / staff redirects after login
- [ ] Middleware denies cross-role dashboard access

## Phase 4 — Talent model / field_values

- [x] `docs/talent-schema-map.md` describes flags and columns
- [ ] Forms read/write only defined keys (ongoing)

## Phase 4.5 — AI search document

- [x] `docs/ai-search-document.md` + `buildAiSearchDocument` implementation

## Phase A / B / C / D

- [x] `docs/ranking_signals.md`, `docs/match_explanations.md`, `docs/search-result-dto.md`
- [x] `search_queries` migration + server logging hook
- [x] AI feature flags seeded (defaults **false**)

## Phase 5 — Inquiry

- [x] `inquiry_talent` used from directory/cart flow (existing RPC)
- [x] Status labels include extended enum in `web/src/lib/inquiries.ts`

## Phase 6 — Directory UX

- [ ] URL state + filters + sort parity with backend (verify manually)
- [x] API logging on directory GET (when service role configured)

## Phase 7 — Profile UX

- [ ] Loading / error / gallery behaviors reviewed
- [x] Profile selects aligned with schema (audit: no phantom columns)

## Phase 8 — Admin UX

- [ ] Inquiry list + talent edit smoke test

## Phase 8.5 — CMS / Site Settings architecture

**Status: complete at architecture-doc level** (implementation is 8.6).

- [x] `docs/site-settings-model.md` — Site Settings IA + permission matrix
- [x] `docs/content-architecture.md`, `page-template-map.md`, `seo-governance.md`, `navigation-model.md`, `theme-settings.md`, `admin-content-ownership.md`, `route-ownership-map.md`
- [x] `docs/cms-admin-scope.md`, `docs/audit-events.md` (pointers / audit schema note)

## Phase 8.6 — Minimal Site Settings admin (**partial**)

**Done (scaffold only):**

- [x] Shell routes under `/admin/site-settings` (content, seo, structure, system, audit) with subnav

**8.6A — next priority slice (implement first):**

### Phase 8.6A completion rule (hard)

**Slug change must auto-suggest a redirect** (prefill `redirects` from old public path → new path) so published slug edits do not silently break SEO or inbound links. Staff can still edit or cancel the redirect; the product must not rely on memory alone.

**8.6A checklist:**

- [ ] **`pages` table** — forward migration (`cms_pages` or `pages` per naming decision) matching 8.5 fields
- [ ] **Staff CRUD** — list, create/edit, title, locale, status, `template_key`, body/hero (or structured sections) per template
- [ ] **Slug editing** — validation, uniqueness per locale (or documented rule)
- [ ] **Metadata persistence** — meta title/description, OG fields, `noindex`, `include_in_sitemap`, canonical override — saved in admin and loaded for edit
- [ ] **Publish / unpublish** — status flow; **warnings** when changing slug on **published** content
- [ ] **Redirect manager** — migration + UI: old_path, new_path, 301/302, active, created_by; loop/conflict validation
- [ ] **Auto-suggest redirect on slug change** — satisfies hard rule above
- [ ] **Permission enforcement** — super_admin vs agency_staff (and future editor) on routes + server actions / API
- [ ] **Metadata integration** — `generateMetadata` (and related) on CMS-driven routes consumes persisted page meta where mapped
- [ ] **Sitemap integration** — public sitemap rules include/exclude CMS pages per `include_in_sitemap` / status

**8.6A/B — remainder (after first slice or in parallel where safe):**

- [ ] Forward migrations for **posts**, `navigation_items`, featured/homepage/globals as designed in 8.5
- [ ] Staff RLS + public read for published CMS rows
- [ ] **8.6B:** Feature flags / theme tokens / globals in Site Settings **System** (or bridge to **Admin → Settings**), audit visibility for mutations

## Phase 8.7 — AI foundations

**Docs + shell layer (treat as complete for this slice):**

- [x] `docs/ai-foundations.md`, `agent-registry.md`, `ai-settings-model.md`, `tool-architecture.md`, `agent-permissions.md`, `agent-logs.md`, `ai-session-context.md`
- [x] `docs/entity-registry.md`, `entity-relationships.md`, `ai-surface-contracts.md` (canonical surfaces)
- [x] `docs/search-modes.md`, `ai-fallback-ux.md`, `ai-refresh-strategy.md`, `ai-debug-mode.md`
- [x] Admin route `/admin/ai-workspace` with section scaffolding (placeholder cards)

**Strict / extended closure (optional — recommended before real Phase 9):**

- [ ] **Site Settings → AI** route aligned with `docs/ai-settings-model.md` and Phase D keys
- [ ] **Directory** AI attach slots (`attach_point_key`s in `ai-surface-contracts.md`)
- [ ] **Profile** AI attach slots
- [ ] **Inquiry** AI attach slots
- [ ] **Embedded admin AI panels** — talent edit, inquiry detail, directory settings, taxonomy admin, page/post editors
- [ ] **Agent logs / fallback events** schema (optional DB) if required for ops

## Phase 8.8 — AI component system (**partial**)

Per plan, **8.8 is complete only when** the full library exists **and** it is **wired** on real surfaces (not spec/docs alone).

### Phase 8.8 completion rule (hard)

**Every AI-visible subtree** (directory AI region, profile AI region, inquiry AI region, AI Workspace sections, refine strip, AI drawer content, etc.) must be wrapped in **`AIErrorBoundary`** so failures do not white-screen the host page. Decision-log only for non-React boundaries (should be rare).

**Library modules** (all eleven required files — verify in repo):

- [x] `ai-panel`, `ai-suggestion-chips`, `ai-match-explanation`, `ai-action-button`, `ai-inline-assistant`, `ai-workspace-card`, `ai-loading`, `ai-empty-state`, `ai-compare-table`, `ai-drawer`, `ai-error-boundary` under `web/src/components/ai/`
- [x] `AIErrorBoundary` default fallback uses `AIEmptyState`

**Wiring / proof (required for phase completion):**

- [ ] **Composition:** `ai/*` uses matching `ui/*` where applicable — decision-log exceptions only
- [ ] **`AIErrorBoundary`** on **all** AI surfaces (required — see hard rule above)
- [ ] **Directory** — placeholder panel (e.g. `AIPanel` / empty state) at search/results attach point
- [ ] **Profile** — AI placeholder (e.g. find similar / assistive region)
- [ ] **Inquiry** — AI placeholder near message field (`AIInlineAssistant` shell acceptable when flags off)
- [ ] **Refine strip** — `AISuggestionChips` wired to placeholder or API stub (flag-gated)
- [ ] **`AIDrawer`** (or composed `ui/drawer`) wired where plan specifies shortlist/refine/workspace panels
- [ ] **AI Workspace** page built from shared `ai/*` primitives (e.g. `AIWorkspaceCard`), not one-off section cards
- [ ] **No duplicate** ad-hoc AI chip/panel patterns outside `web/src/components/ai/`

## Phase 8.9 — Shared UI primitives (**partial**)

Per plan, **8.9 is complete only when** primitives are **implemented and adopted** on real surfaces.

### Phase 8.9 completion rules (hard)

**Rule A — ≥3 high-traffic surfaces:** At least **three** distinct high-traffic surfaces must meaningfully use shared `web/src/components/ui/*` (not only re-exports in one file). Examples: **directory results**, **public profile**, **admin list**, **Site Settings / CMS** (after 8.6A). Document which three+ in `docs/decision-log.md` when closing the phase.

**Rule B — legacy pattern coverage:** Adoption must **replace at least one real instance** of each of these legacy patterns with the matching primitive (same surface or across surfaces — cover each category once):

| Primitive / pattern | Example target |
|---------------------|----------------|
| **Card** | Directory talent cards and/or profile panels → `ui/card` |
| **Chips** | Directory filters → `FilterChips` / `FilterChip` |
| **Skeleton** | Unified loading placeholders → `Skeleton` / `SkeletonCard` / `SkeletonList` |
| **Empty** | Consolidated empty states → `EmptyState` (remove duplicate one-offs) |
| **Drawer** | A panel that should use sheet/drawer chrome → `ui/drawer` |

Optional but expected where applicable: **`SectionHeader`** on CMS editors; **`ListRow`** on admin lists; **`badge` / `action-bar` / `inline-toolbar`** where they replace duplication.

**Concrete adoption targets (verify when closing):**

- [ ] **Directory cards** — use `ui/card` (and `filter-chips` for filters)
- [ ] **Admin lists** — use `ui/list-row` (or consistent row primitive) where tables/lists are migrated
- [ ] **Profile panels** — use `ui/card` where panel chrome is consolidated
- [ ] **CMS editors** — use `ui/section-header` (and related primitives) once 8.6A ships
- [ ] **Skeletons** — unified usage; no competing skeleton dialects without decision-log
- [ ] **Empty states** — duplicates removed or decision-logged

**Primitive modules** (ten files — verify in repo):

- [x] `card`, `filter-chips`, `section-header`, `empty-state`, `skeleton`, `drawer`, `badge`, `inline-toolbar`, `action-bar`, `list-row` under `web/src/components/ui/`

**Adoption (required for phase completion):**

- [ ] **Rule A** — ≥3 high-traffic surfaces verified
- [ ] **Rule B** — card, chips, skeleton, empty, drawer each replaced at least once (see table)
- [ ] **Directory** — high-traffic internals use `ui/*` (layout frozen)
- [ ] **Public profile** — empty/loading/chrome uses `ui/*` where applicable (layout frozen)
- [ ] **Admin** — talent, inquiries, operational lists/tables migrate off duplicated patterns
- [ ] **Site Settings / CMS** — tables, empty states, section headers use `ui/*` when 8.6A editors exist
- [ ] **Remove or decision-log** remaining duplicate ad-hoc card/chip/empty/skeleton/drawer patterns

## Phase 9 — Vector search

**Foundation only (current — label honestly):**

- [x] `talent_embeddings` table + pgvector extension migration (schema ready)
- [x] `POST /api/ai/search` returns `SearchResult[]` with **classic** directory path; response includes `vector_active: false` until retrieval is wired
- [x] Query normalization + logging hooks aligned with Phase C / DTO doc

**Real Phase 9 (not done until all checked):**

- [ ] **Embedding worker/job** — populate from canonical `ai_search_document` only; `document_hash` / skip unchanged
- [ ] **Embedding refresh triggers** — align with `docs/ai-refresh-strategy.md` (profile/taxonomy/visibility/etc.)
- [ ] **ANN index** — `talent_embeddings` used for retrieval (index maintenance documented)
- [ ] **Vector retrieval** — top-k from embeddings on the server path
- [ ] **Hybrid merge** — combine vector ordering with classic/FTS filters and hard filters (per ranking doc)
- [ ] **Query normalization** — same pipeline used end-to-end on the vector request path (not only logged)
- [ ] **`vector_active: true`** (or equivalent) when flags + data allow
- [ ] **Fallback logs** — timeout / error / flag-off paths log `fallback_triggered`, `fallback_reason` (or agreed schema) per `docs/agent-logs.md` / Phase C
- [ ] **Classic fallback** — still returns same `SearchResult` DTO when vector stage fails or times out
- [ ] **Refresh strategy** — deploy + decision-log for trigger list and job ownership

## Phases 10–13

Execute **only after** real Phase 9, in order (see **Execution order (final)** above):

- [ ] **Phase 10** — Re-rank on real vector (or hybrid) output per `docs/ranking_signals.md`
- [ ] **Phase 11** — Rule-based explanations in API + `AIMatchExplanation` in UI per `docs/match_explanations.md`
- [ ] **Phase 12** — Refine suggestions + `AISuggestionChips` mapped to real filter params
- [ ] **Phase 13** — Inquiry draft + `AIInlineAssistant`; Phase 5 storage unchanged

See frozen plan failure-behavior table for degradation rules.
