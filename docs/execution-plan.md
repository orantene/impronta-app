# Execution plan (repo)

## Purpose

This document is the **single source** for:

- **Execution order** (what to build next)
- **Workstream objectives** and **primary touchpoints**
- **Completion criteria** (checkboxes for the **original** phased track)

The **original** track **8.6A → Phase 13** is **closed** at first-pass baseline. **What to build next** = [Next execution track — post-AI quality + CMS remainder](#next-execution-track--post-ai-quality--cms-remainder) + [docs/post-ai-quality-cms-backlog.md](post-ai-quality-cms-backlog.md).

You do **not** need the acceptance checklist to verify **8.6A → 13**; criteria are inlined below (archival). Broader phased history (1–8, smoke tests) remains in [docs/acceptance-checklist.md](acceptance-checklist.md) for reference only.

## Relationship to frozen roadmap

Macro phases live in the frozen roadmap under `.cursor/plans/*`. This file is the **repo execution slice** and **does not modify** the frozen roadmap. Detail contracts live in **`docs/architecture-truth.md`** and linked design docs.

## Current baseline (honest snapshot)

Phases are **not** complete when only **documentation** or **placeholder shells** exist — except where explicitly an **architecture / contract / foundation** deliverable (e.g. 8.5 at doc level, 8.7 at docs+shell level).

| Phase | Status | Notes |
|-------|--------|--------|
| **1–4, 4.5** | Foundation ready | Architecture truth, DB audit, auth, talent model, AI search document — per repo audit. |
| **A / B / C / D** | Foundation ready | Ranking/match/DTO docs, `search_queries`, AI flags — where shipped in migrations + code. |
| **8.5** | **Complete (architecture-doc level)** | Site Settings IA, governance docs — **not** full CMS implementation; schema lands with 8.6. |
| **8.6** | **Partial** | Shell routes exist; **8.6A** below is the implementable slice. |
| **8.7** | **Complete at docs + shell layer** | Strict closure items are **optional** before real Phase 9 (see optional section below). |
| **8.8** | **First-pass complete** | AI strips + `AIErrorBoundary` on shipped surfaces; optional 8.7 strict items remain open. |
| **8.9** | **First-pass complete** | Rules A + B satisfied on directory/profile/admin/CMS touchpoints per decision-log. |
| **9** | **First-pass complete** | Hybrid vector path, public directory wiring, normalization, logging, invalidation triggers — see decision-log. |
| **10–13** | **First-pass complete** | Rerank, explanations API, refine chips, inquiry drafting — baseline frozen; quality follow-up is a **separate track** (below). |

## Execution order (final)

**Do not change** without re-plan.

1. **Phase 8.6A** — CMS core (Pages + redirects + metadata)
2. **Phase 8.9** — Shared UI primitive adoption
3. **Phase 8.8** — AI component wiring
4. **Phase 9** — Real vector search
5. **Phase 10** — Re-rank
6. **Phase 11** — Match explanations
7. **Phase 12** — Refine suggestions
8. **Phase 13** — Inquiry drafting

This order stabilizes **CMS + UI** before **AI**.

---

## Workstream 1 — Phase 8.6A (CMS core)

### Objective

Minimal Site Settings CMS: admin manages **pages**, **metadata**, and **redirects**. Unlocks real CMS control, SEO, and later AI content surfaces.

### Hard rules

- **Slug change** must: show warning; **auto-suggest / prefill** redirect from old public path → new path (staff may edit or cancel); no silent SEO breaks.
- **Permissions:** `super_admin` / `agency_staff` (and future roles as designed); **no** public write access.

### Completion checklist (8.6A)

- [ ] **`pages` table** — forward migration (`cms_pages` or `pages` per naming decision) matching 8.5 fields
- [ ] **Staff CRUD** — list, create/edit, title, locale, status, `template_key`, body/hero (or structured sections) per template
- [ ] **Slug editing** — validation, uniqueness per locale (or documented rule)
- [ ] **Metadata persistence** — meta title/description, OG fields, `noindex`, `include_in_sitemap`, canonical override — saved in admin and loaded for edit
- [ ] **Publish / unpublish** — status flow; **warnings** when changing slug on **published** content
- [ ] **Redirect manager** — migration + UI: old_path, new_path, 301/302, active, created_by; loop/conflict validation
- [ ] **Auto-suggest redirect on slug change** — satisfies hard rule above
- [ ] **Permission enforcement** — super_admin vs agency_staff (and future editor) on routes + server actions / API
- [ ] **Metadata integration** — `generateMetadata` (and related) on CMS-driven routes consumes persisted page meta where mapped
- [ ] **Sitemap integration** — public sitemap include/exclude CMS pages per `include_in_sitemap` / status

### Later 8.6 remainder (after 8.6A or in parallel where safe)

- [ ] Forward migrations for **posts**, `navigation_items`, featured/homepage/globals as designed in 8.5
- [ ] Staff RLS + public read for published CMS rows
- [ ] **8.6B:** Feature flags / theme tokens / globals in Site Settings **System** (or bridge to **Admin → Settings**), audit visibility for mutations

### Primary touchpoints

- `supabase/migrations/*`
- `web/src/app/(dashboard)/admin/site-settings/*`
- `web/src/lib/cms/*` (new or extended)
- `generateMetadata()` on relevant routes
- Sitemap generator

---

## Workstream 2 — Phase 8.9 (Shared UI adoption)

### Objective

Adopt shared `web/src/components/ui/*` on **real high-traffic surfaces**; remove duplicate ad-hoc patterns or decision-log them. **Layout unchanged** (internals only).

### Hard rules

**Rule A — ≥3 high-traffic surfaces:** At least **three** distinct surfaces must meaningfully use `web/src/components/ui/*` (not only re-exports in one file). Examples: directory results, public profile, admin list, Site Settings / CMS (after 8.6A). **Document which three+ in `docs/decision-log.md` when closing the phase.**

**Rule B — legacy pattern coverage:** Replace at least **one real instance** of **each** category with the matching primitive (same surface or across surfaces — cover each once):

| Primitive / pattern | Example target |
|---------------------|----------------|
| **Card** | Directory talent cards and/or profile panels → `ui/card` |
| **Chips** | Directory filters → `FilterChips` / `FilterChip` |
| **Skeleton** | Unified loading → `Skeleton` / `SkeletonCard` / `SkeletonList` |
| **Empty** | Consolidated empty states → `EmptyState` |
| **Drawer** | Sheet/drawer chrome → `ui/drawer` |

Optional where applicable: **`SectionHeader`**, **`ListRow`**, **`badge` / `action-bar` / `inline-toolbar`**.

**Primitive modules** (verify in repo): `card`, `filter-chips`, `section-header`, `empty-state`, `skeleton`, `drawer`, `badge`, `inline-toolbar`, `action-bar`, `list-row` under `web/src/components/ui/`.

### Completion checklist (8.9)

- [ ] **Rule A** — ≥3 high-traffic surfaces verified
- [ ] **Rule B** — card, chips, skeleton, empty, drawer each replaced at least once
- [ ] **Directory** — high-traffic internals use `ui/*` (layout frozen)
- [ ] **Public profile** — empty/loading/chrome uses `ui/*` where applicable (layout frozen)
- [ ] **Admin** — talent, inquiries, operational lists/tables migrate off duplicated patterns
- [ ] **Site Settings / CMS** — tables, empty states, section headers use `ui/*` when 8.6A editors exist
- [ ] **Remove or decision-log** remaining duplicate ad-hoc card/chip/empty/skeleton/drawer patterns

### Primary touchpoints

- `web/src/components/ui/*`
- Directory, profile, admin tables/lists, Site Settings / CMS pages

---

## Workstream 3 — Phase 8.8 (AI component wiring)

### Objective

Wire `web/src/components/ai/*` onto **real surfaces** (not spec-only).

### Hard rule

**Every AI-visible subtree** (directory AI region, profile AI region, inquiry AI region, AI Workspace sections, refine strip, AI drawer content, etc.) must be wrapped in **`AIErrorBoundary`**. Decision-log only for non-React boundaries (rare).

**Library** (verify in repo): `ai-panel`, `ai-suggestion-chips`, `ai-match-explanation`, `ai-action-button`, `ai-inline-assistant`, `ai-workspace-card`, `ai-loading`, `ai-empty-state`, `ai-compare-table`, `ai-drawer`, `ai-error-boundary`; `AIErrorBoundary` default fallback uses `AIEmptyState`.

### Completion checklist (8.8)

- [ ] **Composition:** `ai/*` uses matching `ui/*` where applicable — decision-log exceptions only
- [ ] **`AIErrorBoundary`** on **all** AI surfaces
- [ ] **Directory** — placeholder panel (`AIPanel` / empty state) at search/results attach point
- [ ] **Profile** — AI placeholder (e.g. find similar / assistive region)
- [ ] **Inquiry** — AI placeholder near message field (`AIInlineAssistant` shell acceptable when flags off)
- [ ] **Refine strip** — `AISuggestionChips` wired to placeholder or API stub (flag-gated)
- [ ] **`AIDrawer`** (or composed `ui/drawer`) wired where plan specifies shortlist/refine/workspace panels
- [ ] **AI Workspace** built from `ai/*` primitives (e.g. `AIWorkspaceCard`), not one-off section cards
- [ ] **No duplicate** ad-hoc AI chip/panel patterns outside `web/src/components/ai/`

### Primary touchpoints

- `web/src/components/ai/*`
- Directory, profile, inquiry UI; `web/src/app/(dashboard)/admin/ai-workspace/*`

---

## Workstream 4 — Phase 9 (Vector search)

### Objective

**Real** embedding generation + **vector retrieval** (not classic-only with `vector_active: false`).

### Rule — search debounce

Search requests that hit the AI / vector (or expensive hybrid) path must **debounce** in the **250–400ms** band (pick a value or narrow range in code; stay inside the band). Prevents **embedding spam**, redundant server work, and **UI jitter**.

### Already in place (foundation — not “real Phase 9”)

- `talent_embeddings` + pgvector migration; `POST /api/ai/search` returns `SearchResult[]` with classic path and `vector_active: false`; query normalization + logging aligned with Phase C / DTO doc.

### Completion checklist (real Phase 9)

- [ ] **Embedding worker/job** — populate from canonical `ai_search_document` only; `document_hash` / skip unchanged
- [ ] **Embedding refresh triggers** — align with `docs/ai-refresh-strategy.md`
- [ ] **ANN index** — `talent_embeddings` used for retrieval (index maintenance documented)
- [ ] **Vector retrieval** — top-k from embeddings on the server path
- [ ] **Hybrid merge** — vector ordering with classic/FTS filters and hard filters (per ranking doc)
- [ ] **Query normalization** — same pipeline end-to-end on the vector request path
- [ ] **`vector_active: true`** (or equivalent) when flags + data allow
- [ ] **Fallback logs** — timeout / error / flag-off paths log `fallback_triggered`, `fallback_reason` (or agreed schema) per `docs/agent-logs.md` / Phase C
- [ ] **Classic fallback** — still returns same `SearchResult` DTO when vector stage fails or times out
- [ ] **Refresh strategy** — deploy + decision-log for trigger list and job ownership
- [ ] **Debounce** — search UI (or agreed layer) debounces **250–400ms** before issuing requests on AI/vector search surfaces

### Primary touchpoints

- `supabase/migrations/*` / `talent_embeddings`
- Embedding worker (script, job, or edge function — TBD)
- `web/src/app/api/ai/search/route.ts`
- `web/src/lib/ai/build-ai-search-document.ts`
- `web/src/lib/ai/rerank.ts` (Phase 10 expands)

---

## Workstreams 5–8 (Phases 10–13)

Execute **only after** real Phase 9, in order. See frozen plan for failure-behavior / degradation rules.

### Phase 10 — deterministic tie-break

After re-rank scores, **tie-break must be deterministic** using this precedence (first wins): **manual rank** → **featured** → **completeness** → **id**. Field-level ordering should match [docs/ranking_signals.md](ranking_signals.md) §4; if the doc and this rule diverge, reconcile in a decision-log entry when implementing.

- [ ] **Phase 10** — Re-rank on real vector (or hybrid) output per `docs/ranking_signals.md`, including **deterministic tie-break** as above
- [ ] **Phase 11** — Rule-based explanations in API + `AIMatchExplanation` in UI per `docs/match_explanations.md`
- [ ] **Phase 12** — Refine suggestions + `AISuggestionChips` mapped to real filter params
- [ ] **Phase 13** — Inquiry draft + `AIInlineAssistant`; Phase 5 storage unchanged

### Status (roadmap closure)

**Phases 9–13** are treated as **complete baseline implementations** in production (first pass): hybrid search + rerank + explanations + refine + inquiry draft, flag-gated with classic fallback. **Do not reopen** these sections for scope creep — extend behavior only via the **post-AI track** below.

---

## Next execution track — post-AI quality + CMS remainder

This is a **new** backlog; it **does not** replace or rewrite the phased roadmap above.

| Order | Track | Objective (summary) |
|-------|--------|------------------------|
| **1** | **A — Search quality** | Stronger hybrid merge, semantic cursors, richer fallback metrics, RRF / weighted blending. |
| **2** | **D — CMS / Site Settings** | Posts, navigation, 8.6B system settings, audit visibility, CMS RLS polish. |
| **3** | **B — Refine quality** | Location-, availability-, range-, and explanation-informed refine. |
| **4** | **C — Explanation quality** | Primary-type overlap, multi-signal taxonomy, public confidence UI. |

**Constraints:** Reuse existing **AI flags** and **`web/src/components/ai/*`**; preserve **classic fallback**; **Tracks A–C** target quality without *new* schema unless decision-logged. **Track D** follows **8.5 / 8.6** designs (posts, navigation, etc.) and may use migrations **as already specified** there.

**Detail:** [docs/post-ai-quality-cms-backlog.md](post-ai-quality-cms-backlog.md) (audit + checklists).

---

## Optional — Phase 8.7 strict closure

Recommended polish; **not** blocking the closed **8.6A → 13** sequence.

- [ ] **Site Settings → AI** route aligned with `docs/ai-settings-model.md` and Phase D keys
- [ ] **Directory** AI attach slots (`attach_point_key`s in `ai-surface-contracts.md`)
- [ ] **Profile** AI attach slots
- [ ] **Inquiry** AI attach slots
- [ ] **Embedded admin AI panels** — talent edit, inquiry detail, directory settings, taxonomy admin, page/post editors
- [ ] **Agent logs / fallback events** schema (optional DB) if required for ops

---

## Ongoing hygiene (from earlier phases)

- [ ] DB `EXPLAIN` pass on slow admin queries (Phase 2)
- [ ] Auth redirect verification after login (Phase 3)
- [ ] Directory URL state + filters + sort parity with backend (Phase 6)
- [ ] Profile loading / error / gallery behaviors reviewed (Phase 7)
- [ ] Inquiry list + talent edit smoke test (Phase 8)

---

## Definition of done (primary execution track)

The **original** build track through **AI-ready product (Phases 9–13)** is **closed** at first-pass production quality (see baseline table and decision-log). Historical checklists in Workstreams 1–4 and Phases 10–13 above remain for **audit reference**; new work ships under **Next execution track — post-AI quality + CMS remainder**.

For archival completeness, the original gates were:

1. **Workstream 1** — Phase **8.6A** (CMS pages, metadata, redirects, permissions, SEO hooks)
2. **Workstream 2** — Phase **8.9** (Rules A + B)
3. **Workstream 3** — Phase **8.8** (`ai/*` + `AIErrorBoundary` on AI surfaces)
4. **Workstream 4** — Phase **9** (vector + hybrid + logging baseline)
5. **Phases 10–13** — rerank, explanations, refine, inquiry draft

## Cross-links

- **Broader phased audit (1–8):** [docs/acceptance-checklist.md](acceptance-checklist.md)
- **Decision log:** [docs/decision-log.md](decision-log.md)
- **Architecture truth:** [docs/architecture-truth.md](architecture-truth.md)
- **Follow-up track (post–AI quality + CMS remainder):** [docs/post-ai-quality-cms-backlog.md](post-ai-quality-cms-backlog.md) — audit + **Tracks A→D** checklists (**order: A, D, B, C**); does not replace the phased roadmap above
- **After CMS revisions (quality + ship gate):** [docs/post-revisions-roadmap.md](post-revisions-roadmap.md) — search / refine / explanation tuning and stabilization closeout; Cursor plan `.cursor/plans/post-revisions_roadmap_408262a2.plan.md` is the planning source for edits there
