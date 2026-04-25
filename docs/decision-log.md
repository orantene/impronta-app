# Decision log

Append-only. Newest entries at the **top**.

---

## 2026-04-12 — CMS page/post revisions (Chunk 2 follow-on)

**What changed**

- **Migration** `20260421120000_cms_page_post_revisions.sql`: `cms_page_revisions` and `cms_post_revisions` (`kind` draft | published, `snapshot` JSONB, `created_by`, `created_at`), staff RLS, cascade delete with parent.
- **On each successful Save**: snapshot of **editable fields only** (no ids/timestamps); `published` vs `draft` kind follows saved `status`.
- **Admin UI**: revision list + **Restore** (loads editor state only). **Slug/locale mismatch** vs live row shows an explicit notice and relies on existing **301 redirect** checkbox when saving as published (posts gained the same redirect path as pages).
- **Pages**: `hero` JSONB is included in save + snapshot + restore (still no dedicated hero UI; DB/restore only).

---

## 2026-04-12 — Chunks 7, 8, 5 + CMS nav parity (AI Console, guardrails, CI, posts/directory)

**What changed**

- **Chunk 7 — AI Console:** `/admin/ai-workspace/console` loads **staff-only** aggregates from `search_queries` (24h / 7d: volume, hybrid rows, fallback rate, top fallback reasons sample), **read-only env snapshot** (RRF weights, cache TTLs, OpenAI model ids), doc path index, and existing flag/tools sections.
- **Chunk 8 — Guardrails:** Stronger `sanitizeInquiryDraftOutput` (bilingual pricing, guarantees, “book now”, refund-ish phrases, coarse medical/legal opener); lower chat **temperature / max_tokens**; shorter raw model cap; API response capped with **`INQUIRY_DRAFT_MAX_CHARS`**.
- **Chunk 5 — Stabilization:** **`npm run test:ai-guardrails`** (Node test) wired into **`npm run ci`**.
- **Chunk 2 — Nav parity:** CMS **footer** on directory **error/paused** branches; **`PublicHeader` + footer** on public **`/posts/[slug]`** and **`/p/…`** CMS pages for parity with home/profile/directory.

---

## 2026-04-12 — Chunk 1 + 3 follow-up (cursor stamp, RRF weights, refine match-context)

**What changed**

- **Hybrid cursor:** `encodeDirectoryCursor` / decode carry optional **`h`** context stamp (`computeHybridContextStamp`); `runAiDirectorySearch` invalidates mismatched continuation cursors and logs `ai_search_cursor_stamp_mismatch`.
- **RRF:** Weighted legs via `getRrfLegWeights()` + env `IMPRONTA_RRF_CLASSIC_WEIGHT` / `IMPRONTA_RRF_VECTOR_WEIGHT` (default vector 1.15).
- **Fallback reasons:** Explicit codes when vector did not run: `ai_search_disabled`, `pagination_skip_vector`, `query_too_short`, `empty_or_whitespace_query` (existing failure codes unchanged).
- **Eval harness:** Jaccard@K, reciprocal rank of first hit, and summary means in `web/scripts/eval-search.ts`.
- **Refine (Chunk 3):** `matchFitSlugs` from visible cards (React context) boosts chips when `ai_refine_v2`; height filter boosts body/build-like taxonomy kinds; API accepts `heightMinCm`/`heightMaxCm`; client **dedupes** identical in-flight refine requests.

**Docs:** [search-modes.md](search-modes.md), [search-performance-budget.md](search-performance-budget.md), [search-eval-set.md](search-eval-set.md), [ai-fallback-ux.md](ai-fallback-ux.md).

---

## 2026-04-12 — Post-AI Chunks 1–8 (baseline pass)

**What changed**

- **Search quality (Chunk 1):** Hybrid path already shipped; this pass aligns **normalization** docs (`canonicalDirectoryQueryForAiSearch` as single entry for search + refine), **RRF merge** when `ai_search_quality_v2`, **semantic continuation cursor** when v2, structured logs + staff **search-debug** API, eval harness + performance budget docs.
- **Efficiency (Chunk 6):** Directory **debounced** AI query fetches; embedding **cache/dedupe**; **draft guardrails** (prompt + `sanitizeInquiryDraftOutput`); [docs/ai-api-efficiency.md](ai-api-efficiency.md).
- **CMS (Chunk 2):** Migration `20260420190000_cms_posts_navigation.sql` — **`cms_posts`**, **`cms_navigation_items`** with RLS; admin **Posts** + **Navigation** under Site Settings → Content; public **`/posts/[slug]`**; sitemap includes published posts.
- **Refine (Chunk 3):** Refine API uses canonical query only; `locationSlug` + `ai_refine_v2` boosts (existing); UI debounce + `locationSlug` from discover section.
- **Explanations (Chunk 4):** `ai_explanations_v2` adds primary-type / query overlap rules, **public confidence** line on directory cards when enabled; admin match preview shows **reason codes**.
- **AI Console (Chunk 7):** `/admin/ai-workspace/console` read-only flag summary + links; v2 toggles on **Admin → Settings**.
- **Guardrails (Chunk 8):** Draft sanitization + stricter system prompts; directory still shows classic results when vector fails (unchanged contract).
- **Ops docs:** [docs/ai-data-retention.md](ai-data-retention.md), [docs/ai-release-playbook.md](ai-release-playbook.md).

**Migration:** Apply `20260420190000_cms_posts_navigation.sql` after the AI v2 flags migration if not already applied.

---

## 2026-04-12 — Phase 9 completion (triggers + normalization + logging), Phase 10 rerank, Phase 11 explanations

**What changed**

- **Embedding refresh:** [`20260416150000_embedding_invalidation_triggers.sql`](supabase/migrations/20260416150000_embedding_invalidation_triggers.sql) — `DELETE` from `talent_embeddings` on relevant `talent_profiles` updates and on `talent_profile_taxonomy` changes; [`docs/ai-refresh-strategy.md`](docs/ai-refresh-strategy.md) updated.
- **Hybrid path:** [`canonicalDirectoryQueryForAiSearch`](web/src/lib/ai/normalize-search-query.ts) so FTS and embedding share the same normalized `q` when `ai_search_enabled`. Stable [`vector_active`](web/src/app/api/ai/search/route.ts) only after successful RPC with ≥1 row; `vector_rpc_error` vs `no_vector_matches`. [`matchTalentEmbeddings`](web/src/lib/ai/vector-retrieval.ts) returns discriminated success vs RPC error.
- **Analytics:** [`logSearchQuery`](web/src/lib/search-queries/log-search-query.ts) fills `ai_path_requested`, `fallback_triggered`, `fallback_reason`; structured `ai_search_fallback` / `ai_search_vector_rpc_error` server logs.
- **Phase 10:** [`applyHybridRerank`](web/src/lib/ai/rerank.ts) when `ai_rerank_enabled` and vector stage ran; `DirectoryCardDTO` gains `featuredPosition`, `profileCompletenessScore`, `manualRankOverride` from directory fetch; vector similarity on [`SearchResult.score`](web/src/lib/ai/search-result.ts).
- **Phase 11:** [`buildExplanationsForAiSearchCards`](web/src/lib/ai/build-ai-search-explanations.ts) + [`formatMatchExplanationsForUi`](web/src/lib/ai/match-explain.ts); admin [`/admin/ai-workspace/match-preview`](web/src/app/(dashboard)/admin/ai-workspace/match-preview/page.tsx) exercises `AIMatchExplanation`.

**Migration:** Apply `20260416150000_embedding_invalidation_triggers.sql` after the Phase 9 ANN migration.

---

## 2026-04-12 — Phase 8.9 (Rule A + B), 8.8 profile/inquiry/workspace, Phase 9 hybrid v1

**What changed**

- **8.9 — Rule A (≥3 surfaces):** **Directory** — `FilterChip` / `FilterChips` on talent-type bar and applied filter chips; `EmptyState` for zero results; `ui/drawer` for mobile filter panel and inquiry side panel (replacing direct `sheet` imports); existing `Skeleton` grid + `TalentCard` using `ui/card`. **Public profile** — `Card` / `CardContent` for basic/details field tiles; `EmptyState` when portfolio has no images; [`loading.tsx`](web/src/app/t/[profileCode]/loading.tsx) uses `Skeleton`. **Admin + CMS** — `EmptyState` on inquiries queue and clients queue; `ListRow` rows in inquiry shortlist ([`saved-talent-cart-list.tsx`](web/src/components/directory/saved-talent-cart-list.tsx)); `SectionHeader` on CMS page metadata block ([`cms-page-form.tsx`](web/src/app/(dashboard)/admin/site-settings/content/pages/cms-page-form.tsx)).

- **8.8 — Wiring:** [`profile-ai-strip.tsx`](web/src/components/directory/profile-ai-strip.tsx) on public profile; [`inquiry-ai-strip.tsx`](web/src/components/directory/inquiry-ai-strip.tsx) in directory inquiry drawer; each AI Workspace card wrapped in [`AIErrorBoundary`](web/src/components/ai/ai-error-boundary.tsx). Copy: `public.profile.aiPanel*`, `public.forms.inquiry.aiAssist*` (+ ES). [`directory-ui-copy.ts`](web/src/lib/directory/directory-ui-copy.ts) extended for inquiry sheet AI strings.

- **Phase 9 (first shippable slice):** Migration [`20260416140000_match_talent_embeddings.sql`](supabase/migrations/20260416140000_match_talent_embeddings.sql) — HNSW cosine index + `match_talent_embeddings` RPC (`SECURITY DEFINER`, execute granted to `service_role`). [`scripts/embed-talents.mjs`](web/scripts/embed-talents.mjs) + `npm run embed-talents` backfills `talent_embeddings` from `ai_search_document` with hash skip. [`/api/ai/search`](web/src/app/api/ai/search/route.ts) when `ai_search_enabled` + keys: embeds query, RPC match, **merges** vector order with classic `fetchDirectoryPage` results, returns `vector_active` when matches run; logs `fallback_reason` in `flag_snapshot` when skipped.

**Why:** Meet execution-plan 8.9 / 8.8 completion gates; enable hybrid semantic ordering behind flags without breaking classic DTO.

**Migration:** Apply `20260416140000_match_talent_embeddings.sql` (after existing chain).

**Env:** `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` for hybrid path and embed worker.

---

## 2026-04-12 — Execution plan standalone (no checklist dependency for 8.6A–13)

**What changed:** [docs/execution-plan.md](execution-plan.md) rewritten so **baseline table, hard rules, and all trackable checkboxes** for **8.6A → 13**, optional **8.7** closure, and **hygiene** are **inlined** — verification of the primary build track does not require the acceptance checklist. [docs/acceptance-checklist.md](acceptance-checklist.md) header updated: execution plan is **canonical** for that track; checklist stays the broader phased audit (1–8).

**Why:** One document owns “what to build next” and “how we know it’s done” for the active sequence.

**Backward compatible:** Yes (docs only).

**Migration:** none

---

## 2026-04-12 — Added `docs/execution-plan.md` (actionable build sequence from checklist)

**What changed:** New [docs/execution-plan.md](execution-plan.md) — execution order (8.6A → 8.9 → 8.8 → 9 → 10–13), workstream objectives, hard rules, primary touchpoints, gaps, optional 8.7 closure, hygiene pointers, definition of done. [docs/acceptance-checklist.md](acceptance-checklist.md) links to it under the title. **No changes** to frozen roadmap under `.cursor/plans/*`.

**Why:** Single repo doc for “what to build next”; checklist remains verification / checkbox source of truth.

**Backward compatible:** Yes (docs only).

**Migration:** none

---

## 2026-04-12 — Checklist: implementation gaps, execution order 8→13, hard rules for 8.6A / 8.8 / 8.9

**What changed:** `docs/acceptance-checklist.md` — added **Implementation gaps (current)** summary; **Execution order (final)** for phases **8.6A → 8.9 → 8.8 → 9 → 10 → 11 → 12 → 13** with “do not change without replan”; **8.6A** hard rule **slug change auto-suggest redirect**; expanded 8.6A/9/10–13 checklists; **8.8** hard rule **AIErrorBoundary on all AI subtrees** + explicit wiring items; **8.9** second hard rule (**card/chips/skeleton/empty/drawer** each replaces ≥1 legacy instance) + concrete adoption targets. `docs/ui-component-system.md`, `docs/ai-component-system.md` updated to reference rules.

**Why:** Encode remaining work and completion gates without implying phases pass on primitives alone.

**Backward compatible:** Yes (docs only).

**Migration:** none

---

## 2026-04-12 — Phase 8.9 completion rule: ≥3 high-traffic surfaces using `ui/*`

**What changed:** `docs/acceptance-checklist.md` — Phase **8.9** now has an explicit **hard completion rule**: at least **three** distinct high-traffic surfaces must meaningfully adopt `web/src/components/ui/*` (examples: directory results, public profile, admin list, CMS after 8.6A); closing the phase requires logging which surfaces in this file. `docs/ui-component-system.md` references the same rule.

**Why:** Prevents marking 8.9 complete when primitives exist but stay unused.

**Backward compatible:** Yes (docs only).

**Migration:** none

---

## 2026-04-12 — Roadmap audit: 8.5 doc-complete, 8.7 docs+shell, Phase 9 foundation-only, implementation order

**What changed:** `docs/acceptance-checklist.md` — snapshot table aligned with audit: **8.5** complete at architecture-doc level; **8.6** partial with **8.6A** first slice (Pages + redirects + metadata + permissions); **8.7** complete at docs+shell layer with strict follow-ups listed separately; **8.8** / **8.9** require library **and** wiring/adoption; **Phase 9** split into foundation (`vector_active: false`) vs real embeddings/ANN; **10–13** marked future; added recommended order (8.6A → 8.9 → 8.8 → Phase 9). Touched `docs/ai-foundations.md`, `ai-component-system.md`, `ui-component-system.md`, `site-settings-model.md`, `content-architecture.md`.

**Why:** Single honest view of what is documentation/shell vs shippable CMS vs real vector search; encode agreed next priorities without editing the frozen plan file.

**Backward compatible:** Yes (docs only).

**Migration:** none

---

## 2026-04-12 — Honest roadmap status: 8.6 / 8.7 / 8.8 / 8.9 marked partial in checklist

**What changed:** `docs/acceptance-checklist.md` — added roadmap snapshot table; Phase **8.6** explicitly **partial** (shells vs CRUD/RLS/redirects/audit); **8.7** split into docs/shell **done** vs Site Settings→AI, customer slots, embedded admin panels **pending**; **8.8** and **8.9** split into library files **done** vs adoption/DoD **pending**. `docs/ai-component-system.md` and `docs/ui-component-system.md` gain an **Implementation status** note pointing at the checklist.

**Why:** Phases must not read as complete when only documentation and placeholder routes/components exist; adoption and CRUD remain the real gate.

**Paths:** `docs/acceptance-checklist.md`, `docs/ai-component-system.md`, `docs/ui-component-system.md`

**Backward compatible:** Yes (documentation only).

**Migration:** none

---

## 2026-04-12 — Phase 8.5–8.9 documentation + Site Settings / AI Workspace shells + UI/AI component libraries

**What changed:** Added CMS/Site Settings docs (`site-settings-model`, `content-architecture`, `page-template-map`, `seo-governance`, `navigation-model`, `theme-settings`, `admin-content-ownership`, `route-ownership-map`, `cms-admin-scope`, `audit-events`); AI foundation docs (`ai-foundations`, `agent-registry`, `ai-settings-model`, `tool-architecture`, `agent-permissions`, `agent-logs`, `ai-session-context`, `entity-registry`, `entity-relationships`, `ai-surface-contracts`, `search-modes`, `ai-fallback-ux`, `ai-refresh-strategy`, `ai-debug-mode`, `ai-component-system`, `ui-component-system`); admin routes `/admin/site-settings/*`, `/admin/ai-workspace`; nav + command palette entries; `web/src/components/ui/*` primitives (8.9) and `web/src/components/ai/*` composites (8.8); `AIErrorBoundary` default fallback uses `AIEmptyState`. Migration `20260415140000_talent_profiles_ai_search_document.sql` documents persisted `ai_search_document`.

**Why:** Close Phase 8.5/8.7 documentation gaps from the frozen roadmap; ship minimal 8.6/8.7 shells and shared component layers before hardening vector search.

**Paths:** `docs/*` (new files above), `web/src/app/(dashboard)/admin/site-settings/**`, `web/src/app/(dashboard)/admin/ai-workspace/**`, `web/src/lib/dashboard/architecture.ts`, `web/src/components/directory/dashboard-nav-links.tsx`, `web/src/components/admin/admin-command-palette.tsx`, `web/src/components/ui/*`, `web/src/components/ai/*`, `supabase/migrations/20260415140000_talent_profiles_ai_search_document.sql`.

**Backward compatible:** Yes (additive docs, routes, components; optional column migration).

**Migration:** `20260415140000_talent_profiles_ai_search_document.sql` (if not already applied in env)

---

## 2026-04-12 — Plan execution: architecture docs + search analytics + AI scaffolding

**What changed:** Added `docs/architecture-truth.md`, `docs/db-audit.md`, `docs/auth-flow.md`, `docs/talent-schema-map.md`, AI/ranking/match/DTO docs; migration `20260415103000_search_queries_ai_embeddings.sql` (`search_queries`, `talent_embeddings`, `vector`, AI settings seeds); `web/src/lib/ai/*`, `web/src/lib/search-queries/*`, `web/src/lib/settings/ai-feature-flags.ts`; `GET /api/directory` search logging; `POST /api/ai/search` classic fallback path; minimal `web/src/components/ai/*` error boundary.

**Why:** Ground the repo in a single architecture narrative, enable Phase C analytics, and stub Phase 9+ without breaking existing directory UX.

**Paths:** `docs/*`, `supabase/migrations/20260415103000_search_queries_ai_embeddings.sql`, `web/src/app/api/directory/route.ts`, `web/src/app/api/ai/search/route.ts`, `web/src/app/(dashboard)/admin/settings/page.tsx` (AI toggles), `web/src/components/ai/*`.

**Backward compatible:** Yes (additive migration; APIs unchanged for existing clients).

**Migration:** `20260415103000_search_queries_ai_embeddings.sql`


---

## 2026-04-25 — D.A: admin shell aesthetic — kill gold/red-orange accents

**What changed:** Neutralised the `--admin-gold-*` token family in light theme, replaced gold-tinted hover/border/halo treatments in `admin-top-bar.tsx`, `admin-page-header.tsx`, `site-card.tsx`, and the luxury button shadow. Tightened inquiries page spacing (`space-y-8` → `space-y-5`, `ADMIN_PAGE_STACK` import dropped). Added optional `description?` to `PrototypeNavItem` and rendered it as a tooltip subtitle for all 12 nav items so opaque labels (Inquiries, Bookings, etc.) get plain-English subtitles.

**Why:** User feedback (`feedback_admin_aesthetics.md`) flagged three live admin-shell bugs — gold/rust accents, list dead space, opaque jargon labels. Storefront `--impronta-gold` is intentionally untouched; only the admin chrome was neutralised.

**Paths:** `web/src/app/globals.css`, `web/src/components/admin/admin-top-bar.tsx`, `web/src/lib/dashboard-shell-classes.ts`, `web/src/components/admin/admin-page-header.tsx`, `web/src/components/admin/site-control-center/site-card.tsx`, `web/src/app/(dashboard)/admin/inquiries/page.tsx`, `web/src/lib/prototype/admin-prototype-nav.ts`, `web/src/components/prototype/admin-prototype-shell.tsx`.

**Backward compatible:** Yes (visual-only; no DB or API changes).

**Migration:** none

---

## 2026-04-25 — D.12: Phase 12 scheduled publish — schema + drawer (cron deferred)

**What changed:** Added `cms_pages.scheduled_publish_at` + `scheduled_by` + `scheduled_revision_id` with a partial sweep index and a 60-second-skew trigger that rejects past fire times. Built the staff-side `ScheduleDrawer` using a native `<input type="datetime-local">` with `min={now+60s}`, server actions (`schedulePublishAction`, `cancelScheduledPublishAction`, `loadScheduledPublishAction`) all gated on `requireStaff` + `requireTenantScope`. Wired the topbar split-button "Schedule…" item, added a command-palette row, registered `schedule: 460` in `DRAWER_WIDTHS`, and extended the Escape priority chain.

**Why:** Operators need to queue a homepage publish for a future date without staying online to hit the button. The schema + UX layer is the heavier lift; the cron sweep is intentionally split off (~30 lines plus a capability bridge so the service-role caller can satisfy `requirePhase5Capability`). Trigger + partial index already in place so the sweep handler ships clean.

**Paths:** `supabase/migrations/20260701120000_cms_p12_m0_scheduled_publish.sql`, `web/src/lib/site-admin/edit-mode/schedule-actions.ts`, `web/src/components/edit-chrome/schedule-drawer.tsx`, `web/src/components/edit-chrome/edit-context.tsx`, `web/src/components/edit-chrome/edit-shell.tsx`, `web/src/components/edit-chrome/topbar.tsx`, `web/src/components/edit-chrome/command-palette.tsx`, `web/src/components/edit-chrome/kit/tokens.ts`.

**Backward compatible:** Yes (additive columns + idempotent actions).

**Migration:** `20260701120000_cms_p12_m0_scheduled_publish.sql`

**Deferred follow-up:** `/api/cron/publish-scheduled` route — see `docs/qa/phase-12/README.md` § "Cron sweep — intentionally deferred" for the capability-bridge options.

---

## 2026-04-25 — D.11: Phase 11 Comments — charter only, deferred from autonomous run

**What changed:** Wrote a charter at `docs/charters/phase-11-comments.md` describing the schema, RLS, server actions, UI, JWT extension, and acceptance criteria. No code or migration shipped this fire.

**Why:** Phase 11 has three intertwined surfaces (schema/RLS for staff + share-link reviewer authors, Realtime channel, JWT `comment` claim) and deserves a focused session rather than a tail-end of a multi-path run. Freezing the design as a charter unblocks the next session to land it cleanly.

**Paths:** `docs/charters/phase-11-comments.md`.

**Backward compatible:** Yes (no code).

**Migration:** none (deferred)

---

## 2026-04-25 — D.11.M0: Phase 11 Comments — staff-side end-to-end (post-charter resume)

**What changed:** Resumed after the same-day charter and shipped the staff-facing comment loop end to end:

- Migration `20260702120000_cms_p11_m0_section_comments.sql` — `cms_section_comments` (tenant + page + section scoped, threading via `parent_comment_id`, soft-delete, resolve markers, `mentions` reserved column), composite indexes, `updated_at` trigger, RLS policy `cms_section_comments_staff_all` via `is_agency_staff()`, and `supabase_realtime` publication (idempotent guard).
- Server actions `web/src/lib/site-admin/edit-mode/comment-actions.ts` — `listCommentsAction`, `addCommentAction` (parent-cross-tenant guard + one-level-deep enforcement), `editCommentAction` (author-only), `resolveCommentAction` (staff, top-level only), `deleteCommentAction` (soft).
- Share-link JWT extended with `cmt: "none" | "r" | "rw"` claim (`web/src/lib/site-admin/share-link/jwt.ts` + `share-actions.ts`); legacy tokens default to `"none"` so a JWT-only schema migration doesn't accidentally grant comment access.
- `EditContext` mutex + open API (`commentsOpen`, `commentsFocusSectionId`, `openComments`, `openCommentsForSection`, `closeComments`); `CommentsDrawer` component with list / reply / resolve / delete / inline edit + Realtime channel filtered on `(tenant_id, page_id)`.
- Wired into the topbar (comment-bubble icon, badge slot reserved), Escape key chain in `EditShell`, and `⌘K` palette ("Open Comments").

**Why:** The user pushed back on the "charter only" status the same day. Shipping the staff loop end-to-end gets feedback in operator hands now; reviewer-side authoring is a smaller follow-up because the JWT claim and table schema already model it.

**Paths:** see "What changed".

**Backward compatible:** Yes — table is new; share-link JWT verify defaults absent `cmt` to `"none"` so existing tokens read but cannot author.

**Migration:** `20260702120000_cms_p11_m0_section_comments.sql`.

**Deferred follow-up:** Reviewer-side authoring module (gated on share-link JWT, service-role client) + canvas pin overlay + profile-resolver staff labels — see `docs/qa/phase-11/README.md` § "Deferred (M1 candidates)".
