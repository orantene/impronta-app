# Post–AI quality + CMS completion (follow-up track)

This document is the **detail companion** for the **Next execution track** in [docs/execution-plan.md](execution-plan.md). It sits **after** the closed baseline (**Phases 9–13** + first-pass 8.8 / 8.9): **do not reopen** those phases here — only **extend** quality and CMS remainder.

It includes an **implementation audit** (honest gaps vs docs) and **checklisted workstreams** in the **mandatory execution order: A → D → B → C**.

**Note:** [docs/execution-plan.md](execution-plan.md) **baseline table** and **Definition of done** reflect roadmap closure; individual phase checklists inside older workstream sections may still show unchecked boxes for **archival** reasons — treat shipped code + decision-log as source of truth for 9–13.

---

## Part 1 — Implementation audit (honest)

### Effectively implemented (first-pass complete or foundation satisfied)

| Area | Evidence / scope |
|------|------------------|
| **Architecture & foundation (phases 1–4, 4.5, A–D)** | `architecture-truth`, talent model, `buildAiSearchDocument`, ranking/match/DTO docs, `search_queries` + AI settings keys, inquiry directory flow per checklist |
| **Phase 8.6A — CMS core (substantial)** | `cms_pages` / `cms_redirects` migration, staff admin under Site Settings, public `p/[[...slug]]`, middleware redirects, sitemap hooks, slug-change → redirect ordering in actions (verify in env) |
| **Phase 8.9 — UI adoption (Rules A + B, first pass)** | Directory: `FilterChip` / drawer / `EmptyState` / list row / card / skeletons; profile + admin touchpoints per decision-log |
| **Phase 8.8 — AI wiring (first pass)** | `AIPanel` strips on directory, profile, inquiry sheet; `AIErrorBoundary` on those strips, refine strip, inquiry draft assistant, AI workspace cards |
| **Phase 9 — real vector path (substantial)** | `embed-talents` worker, `match_talent_embeddings` RPC + HNSW, `runAiDirectorySearch`, canonical query alignment, `vector_active` semantics, invalidation triggers, `search_queries` fallback columns + structured logs, **public directory** uses `POST /api/ai/search` when `ai_search_enabled` |
| **Phase 10 — rerank (first pass)** | Vector similarity on `SearchResult`, `applyHybridRerank`, `DirectoryCardDTO` ranking fields, manual override + soft boosts + deterministic tie-break |
| **Phase 11 — explanations (first pass)** | Rule-based `explainMatch` + API attachment + `formatMatchExplanationsForUi`; **admin** match preview uses `AIMatchExplanation` |
| **Phase 12 — refine (first pass)** | `POST /api/ai/refine-suggestions`, taxonomy-driven `AISuggestionChips`, flag-gated, URL `tax` updates |
| **Phase 13 — inquiry draft (first pass)** | `POST /api/ai/inquiry-draft`, OpenAI chat, `AIInlineAssistant` + draft/polish on inquiry brief; payload flag; Phase 5 storage unchanged |

### Partially implemented (works but incomplete vs plan / doc depth)

| Area | Gap |
|------|-----|
| **8.6A vs execution-plan checklists** | Docs may still show boxes unchecked; **posts**, **navigation**, **8.6B**, **full RLS story**, and **audit visibility** for CMS are not the same as “pages + redirects shipped” |
| **8.8 strict closure** | **`AIDrawer`** exists but is **not** wired per plan language for shortlist/refine/workspace; directory/profile AI regions are **placeholder copy**, not functional assistants beyond refine/draft paths |
| **8.9 remainder** | Broad “admin lists migrated to `ListRow` / CMS editors all on `SectionHeader` / duplicates removed” is **not** exhaustively done |
| **8.7 optional** | Site Settings → AI route, formal attach slots, embedded admin AI panels, optional agent-logs **DB** — largely **open** |
| **Phase 9 debounce** | Band **250–400ms** is documented for AI search; **refine** debounces; **main directory `q`** may still navigate on URL commits per product behavior — verify and align if embedding cost matters |
| **Hybrid merge & pagination** | First-page vector reorder then **`next_cursor: null`** avoids classic/vector cursor mismatch; **no** semantic continuation; merge is **reorder-within-window**, not full candidate fusion |
| **Fallback logging** | DB columns + `ai_search_fallback` / RPC error logs exist; **timeouts**, **degradation tiers**, and **richer operator fields** are not fully spelled out |
| **Phase 10 vs `ranking_signals.md`** | Not every documented soft signal (e.g. media richness, sparse-document penalty) is implemented; **doc vs code** may need explicit reconciliation |
| **Phase 11 vs `match_explanations.md`** | **Language** / **availability** rules in doc are **not** fully wired; **primary type overlap** missing; **`AIMatchExplanation` not on public directory cards** (only admin preview + API payload) |
| **Phase 12** | Refine is **taxonomy-centric**; no location/availability/attribute-range/explanation-informed refinement |
| **Ongoing hygiene (checklist)** | `EXPLAIN` pass, auth redirect verification, directory URL parity review, profile/inquiry smoke tests — **partial or open** |

### Not yet implemented (vs execution-plan / checklist intent)

| Area | Notes |
|------|--------|
| **8.6 remainder** | **Posts** CRUD + migrations as in 8.5; **`navigation_items`** (or equivalent) admin + public header/footer; **featured/homepage/globals** as designed |
| **8.6B** | Feature flags / theme tokens / globals in Site Settings **System** (or bridge to Admin → Settings) per model docs |
| **Full CMS RLS + audit visibility** | “Staff RLS + public read for published CMS rows” and **mutation audit** surfaces may need hardening beyond first migration |
| **8.7 strict items** | As above: dedicated AI settings route, contract-level attach points, embedded editors, optional structured agent logs |
| **Semantic cursor model** | No opaque / vector-aware pagination token; **RRF** or **multi-list fusion** not implemented |
| **Public UI for match explanations** | Directory grid/list does not surface explanation DTOs to visitors when flags on |
| **Checklist doc maintenance** | Execution plan **baseline table** (lines 21–31) and acceptance **roadmap status** / Phase 9–13 sections are **stale** relative to code — should be updated in a separate doc-hygiene pass if you want single-source accuracy |

---

## Part 2 — Execution backlog (mandatory order)

### Global constraints (all tracks)

- **Phases 9–13** are **frozen baseline**; changes extend **merge / refine / explain / CMS** layers, not “re-phase” the roadmap.
- Reuse existing **AI settings keys** (`ai_search_enabled`, `ai_rerank_enabled`, `ai_explanations_enabled`, `ai_refine_enabled`, `ai_draft_enabled`) unless a **new** flag is decision-logged.
- Reuse **`web/src/components/ai/*`** and existing **rate limits / logging** patterns.
- Preserve **classic fallback** on every hybrid path.
- **Tracks A–C (search, refine, explanations):** aim for **no new database schema** — implement via larger pools, fusion math, RPC params, DTO fields, and UI only; any exception needs a **decision-log** entry.
- **Track D (CMS remainder):** follows **8.5 / 8.6** designs; **posts**, **navigation**, and **audit** may use **migrations already called for** in those docs — not in scope for “zero schema,” but avoid **ad-hoc** tables outside the model.

### Track A — Search quality improvements *(execute first)*

**Objective:** Improve **relevance and stability** of hybrid search.

- [ ] **Stronger hybrid merge** — Larger / smarter candidate pool before reorder; dedupe and normalize scores across vector + classic legs.
- [ ] **Semantic cursor model** — Opaque or vector-aware cursor for the hybrid first page (or an explicit product contract when `next_cursor` is null) so infinite scroll does not silently diverge from semantic order.
- [ ] **Richer fallback logging** — Reason codes + **metrics** (latency, stage timings, optional correlation id, degradation tier); align with `docs/agent-logs.md` and `search_queries` as needed **without** breaking existing columns.
- [ ] **Better candidate blending** — **RRF** or **weighted merge** over vector + FTS (+ filter-eligible IDs); document weights; bump [docs/ranking_signals.md](ranking_signals.md) version when weights/tiers change.

### Track D — CMS / Site Settings remainder *(execute second)*

**Objective:** Complete **content / admin platform** beyond **8.6A** (pages + redirects baseline).

- [ ] **Posts CMS** — Staff CRUD, publish flow, metadata/slug rules **consistent with pages** (per 8.5 / execution-plan 8.6 remainder).
- [ ] **Navigation manager** — Admin for header/footer (or equivalent) per [docs/navigation-model.md](navigation-model.md); public rendering wired.
- [ ] **8.6B system settings** — Globals / theme tokens / feature flags in **Site Settings → System** (or documented bridge to Admin → Settings) per settings model docs.
- [ ] **Audit visibility** — Staff-visible history for **content + settings** mutations per [docs/audit-events.md](audit-events.md) (scope: CMS + critical settings).
- [ ] **Full RLS polish for CMS entities** — Published vs draft reads, staff write scopes, service-role boundaries; regression mindset for anon / authenticated / staff.

### Track B — Refine quality improvements *(execute third)*

**Objective:** **Smarter, contextual** refine suggestions (still **real filter params** + `AISuggestionChips`).

- [ ] **Location-aware refine** — Suggest cities/regions from directory context + `locations`; chips map to **`location`** (or canonical slug param).
- [ ] **Availability-aware refine** — Use `field_values` / definitions where availability exists; safe fallbacks when sparse.
- [ ] **Attribute-range refine** — Height (and other **catalog-driven** ranges) as chips when the directory catalog exposes them.
- [ ] **Explanation-informed refine** — When explanations are on, bias chips toward filters that reinforce **visible** match reasons (taxonomy / location / height).

### Track C — Explanation quality improvements *(execute fourth)*

**Objective:** **Clarity and trust** for AI explanations on the public surface.

- [ ] **Primary type taxonomy overlap** — Card DTO or RPC exposes primary type **slug/id**; rule codes cover filter ∩ primary type (extend [docs/match_explanations.md](match_explanations.md) if needed).
- [ ] **Richer taxonomy reasoning** — Multi-signal overlap (skills, types, etc.) within **precedence** and **max-rules** cap in the doc.
- [ ] **Cleaner confidence in public UI** — `AIMatchExplanation` (or compact variant) on **directory** list/grid when `ai_explanations_enabled`, with EN/ES copy and density pass.

---

## Cross-links

- Completed roadmap order: [docs/execution-plan.md](execution-plan.md)  
- Phased audit (1–8): [docs/acceptance-checklist.md](acceptance-checklist.md)  
- Decisions: [docs/decision-log.md](decision-log.md)
