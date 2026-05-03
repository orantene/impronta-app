# Independent senior technical investigation — admin-shell / SaaS dashboard

**Author:** staff engineer review (Cursor agent)  
**Date:** 2026-05-02  
**Scope:** Validate internal 5-phase plan against repo + locked docs; recommend execution path.  
**Not a duplicate** of [`docs/handoffs/wave-1-prep-audit.md`](./wave-1-prep-audit.md) or [`~/.claude/plans/ancient-gathering-sparkle.md`](../../.claude/plans/ancient-gathering-sparkle.md) — this document **challenges** assumptions where evidence differs.

---

## Section 1 — Executive technical diagnosis

### What exists today

- **Prototype** ([`web/src/app/prototypes/admin-shell/`](../../web/src/app/prototypes/admin-shell/)): ~99k lines across `_state`, `_drawers`, `_pages`, `_talent`, `_primitives`, `_messages`, etc. Parametric UX (surface / plan / role / page) with URL-synced control bar. **Workspace** surface is the most complete; talent / client / platform are progressively less complete but substantial.
- **Phase 1 bridge is largely implemented in-repo:** [`page.tsx`](../../web/src/app/prototypes/admin-shell/page.tsx) is an async Server Component; [`_data-bridge.ts`](../../web/src/app/prototypes/admin-shell/_data-bridge.ts) calls `getTenantScope()`, SSR Supabase, reads `agency_talent_roster` with nested `talent_profiles`, `talent_profile_taxonomy` (**`relationship_type = 'primary_role'`**), and **`talent_service_areas`** (`service_kind = 'home_base'`) for city; [`_state.tsx`](../../web/src/app/prototypes/admin-shell/_state.tsx) exposes `bridgeRoster` / `effectiveRoster`; roster surfaces in [`_pages.tsx`](../../web/src/app/prototypes/admin-shell/_pages.tsx) consume `effectiveRoster` (grep confirms).
- **Legacy workspace admin** ([`web/src/app/(dashboard)/admin/*`](../../web/src/app/(dashboard)/admin/)): 90+ `page.tsx` files — real Supabase, staff guards, site-settings, talent roster, inquiries, bookings, analytics, taxonomy, fields, AI workspace, docs. This is **working backend + old UX shell**.
- **Talent dashboard** ([`web/src/app/(dashboard)/talent/*`](../../web/src/app/(dashboard)/talent/)): real flows — profile, inquiries with messaging actions, portfolio, representations, field values, taxonomy editor, etc.
- **Client dashboard** ([`web/src/app/(dashboard)/client/*`](../../web/src/app/(dashboard)/client/)): **not “all stubs”** — e.g. [`overview/page.tsx`](../../web/src/app/(dashboard)/client/overview/page.tsx) loads `loadClientDashboardData`, bookings, inquiries. Trust-ladder **evaluator** and some reserved tables are still product-doc–ahead of code in places; see locked [`docs/client-trust-and-contact-controls.md`](../client-trust-and-contact-controls.md).
- **Public talent** ([`web/src/app/t/[profileCode]/page.tsx`](../../web/src/app/t/[profileCode]/page.tsx)): **canonical platform URL** per [`docs/talent-monetization.md`](../talent-monetization.md). Large server page: visibility, overlays, directory integration, taxonomy rows (types still reference `is_primary` in local TS shapes in places — coexistence with v2 `relationship_type` in other queries is a **consistency** topic, not a blocker for Phase 1).
- **Page builder** ([`web/src/components/edit-chrome/*`](../../web/src/components/edit-chrome/)): active subsystem; CAS, token registry, cache tags per [`docs/page-builder-invariants.md`](../page-builder-invariants.md).
- **Tenant resolution**: [`web/src/middleware.ts`](../../web/src/middleware.ts) → `resolveTenantContext` / `agency_domains`; headers consumed by [`web/src/lib/saas/scope.ts`](../../web/src/lib/saas/scope.ts) (`x-impronta-tenant-id`, cookie). Unregistered host → **404** (operational constraint for preview URLs).
- **Capabilities**: [`web/src/lib/access/`](../../web/src/lib/access/) holds the **intended** canonical registry (88 keys). **`userHasCapability` has zero application call sites** outside the module — production still uses `hasPhase5Capability` / `requirePhase5Capability` ([`web/src/lib/site-admin/capabilities.ts`](../../web/src/lib/site-admin/capabilities.ts)) and `hasCapability` from [`web/src/lib/saas/capabilities.ts`](../../web/src/lib/saas/capabilities.ts) and [`web/src/lib/saas/index.ts`](../../web/src/lib/saas/index.ts) barrel. Additional callers beyond the printed “12 sites” include e.g. [`web/src/lib/site-admin/server/sections.ts`](../../web/src/lib/site-admin/server/sections.ts) and [`web/src/lib/saas/representation-requests.ts`](../../web/src/lib/saas/representation-requests.ts).

### What is fake vs real

| Layer | Fake (prototype-only) | Real (production paths) |
|-------|----------------------|-------------------------|
| Prototype roster (no `?dataSource=live`) | Mock arrays in `_state.tsx` | N/A |
| Prototype roster (`dataSource=live`) | N/A | DB via bridge |
| Prototype inquiries, bookings, talent/client/platform deep flows | Mostly mocks | Partially backed in legacy routes |
| Legacy admin pages | N/A | Real data + old layout |
| `lib/access` enforcement | Parity tests only | Legacy modules enforce gates today |

### What to reuse vs discard

- **Reuse:** `getTenantScope`, SSR Supabase clients, RLS policies, `lib/site-admin/server/*` mutations, edit-chrome, CMS tables, inquiry / `inquiry_messages` patterns, public `/t/` loaders, existing admin data modules (e.g. [`web/src/lib/dashboard/admin-dashboard-data.ts`](../../web/src/lib/dashboard/admin-dashboard-data.ts)).
- **Discard (eventually):** Legacy admin **layout**, **IA**, **card/wrapper components** under `(dashboard)/admin` that duplicate the prototype’s product story — **after** replacement routes exist.
- **Do not touch without cause:** Middleware host contract, edit-chrome internals, public profile route behavior, destructive migrations.

### Biggest risks

1. **Tenant isolation** — any new loader must use the same scope + RLS patterns; no service-role shortcuts for app-facing reads.
2. **Mock/live confusion** — any code path that shows mocks when `dataSource=live` and scope is null is a product bug; bridge correctly returns `[]` and must not substitute mocks.
3. **Drawer drift in live mode** — [`_drawers.tsx`](../../web/src/app/prototypes/admin-shell/_drawers.tsx) still calls `getRoster(state.plan)` in at least three places (~984, ~10492, ~12585) while pages use `effectiveRoster` → **counts / profile lookups can disagree** in live mode.
4. **Plan document vs repo** — older task-package SQL used `is_primary` + `kind`; **actual bridge uses `relationship_type='primary_role'`** and `term_type` — align documentation to code to avoid wrong “fixes.”
5. **Governance conflict** — [`OPERATING.md`](../OPERATING.md) §9 (*delete on replacement, same PR or immediate follow-up*) vs canonical plan Phase 4 (*promote then soak then delete*). For **pre-launch**, the stricter removal policy in OPERATING should win unless explicitly overridden.
6. **Monolith promotion** — copying 25k-line `_drawers.tsx` into “production” verbatim is unmaintainable; **promote by extracting only the surface you ship**.

### Fastest safe path

1. **Close Phase 1** — verify acceptance (29 rows, mock unchanged, legacy + `/t` + builder untouched); fix drawer `effectiveRoster` inconsistency; ship.
2. **Phase 2 in 1–2 focused days** — migrate **all** legacy capability callers to `userHasCapability` / `requireCapability` (**signature is `(capability, tenantId)`**, not an options object) + thin re-exports; include `sections.ts` and `representation-requests.ts`.
3. **Phase 3** — introduce `(workspace)/[tenantSlug]/admin/*` with **minimal layout** + **Overview** first, reusing `loadAdminOverviewData`-style loaders moved behind `lib/data/workspace-overview.ts`; **308** old `/admin` paths; **delete legacy entry** in same or next commit per OPERATING.
4. **Split large prototype files incrementally** as each surface is promoted — not a pre-requisite month-long refactor.

---

## Section 2 — Current system map

| Area | Current route/files | Real or mock | Useful backend? | UX keep/discard | Notes |
|------|---------------------|--------------|-----------------|-----------------|-------|
| Prototype shell | [`web/src/app/prototypes/admin-shell/*`](../../web/src/app/prototypes/admin-shell/) | Mock default; roster can be live | N/A (UI only) | **Keep** as UX SoT | ~99k LOC; drawers still partly mock-roster |
| Workspace (legacy) | [`web/src/app/(dashboard)/admin/*`](../../web/src/app/(dashboard)/admin/) | Real | **Yes** | Discard layout/IA; keep actions/loaders | 90+ pages; donor for data |
| Talent (legacy) | [`web/src/app/(dashboard)/talent/*`](../../web/src/app/(dashboard)/talent/) | Real | **Yes** | Discard shell when replaced | Inquiries, profile, media, taxonomy |
| Client (legacy) | [`web/src/app/(dashboard)/client/*`](../../web/src/app/(dashboard)/client/) | Real (overview, inquiries, bookings, etc.) | **Yes** | Discard shell when replaced | Audit overstated “stubs” |
| Platform | Prototype `_platform.tsx` | Mock | N/A | Prototype only until built | No `(dashboard)/platform` analog found |
| Page builder | [`web/src/components/edit-chrome/*`](../../web/src/components/edit-chrome/) + [`web/src/lib/site-admin/*`](../../web/src/lib/site-admin/) | Real | **Yes** | **Preserve** subsystem | Wrap in new Site surface |
| Public talent | [`web/src/app/t/[profileCode]/page.tsx`](../../web/src/app/t/[profileCode]/page.tsx) | Real | **Yes** | **Preserve** | Canonical `/t/<slug>` |
| Messaging / inquiries | Legacy inquiry UIs; DB `inquiry_messages` (migrations under `supabase/migrations/*inquiry*`) | Real threads | **Yes** | Rebuild **UX** in prototype style; reuse **tables/RLS** | Not the prototype’s generic “messages” v2 yet |
| Capabilities | [`web/src/lib/access/*`](../../web/src/lib/access/) (dormant); legacy saas + site-admin | Real enforcement in legacy | Registry yes; wiring incomplete | N/A | Phase 2 makes access canonical |
| Tenant resolution | [`web/src/middleware.ts`](../../web/src/middleware.ts), [`web/src/lib/saas/host-context.ts`](../../web/src/lib/saas/host-context.ts), [`web/src/lib/saas/scope.ts`](../../web/src/lib/saas/scope.ts) | Real | **Yes** | **Preserve** | `agency_domains` gate |

---

## Section 3 — Recommended execution strategy (independent phases)

Phases are **numbered for clarity**; they intentionally **align partly** with the internal plan but **resolve conflicts** (OPERATING vs Phase 4 soak, client “stubs,” drawer gap, migration breadth).

### Phase A — Prove bridge + ship (0.5–2 days)

- **Goal:** Phase 1 acceptance complete; no mock/live drift in roster **including drawers**.
- **Why now:** Unlocks confidence that the design system eats real joins before any URL surgery.
- **Files touched:** [`_drawers.tsx`](../../web/src/app/prototypes/admin-shell/_drawers.tsx) (swap to `effectiveRoster` or `useProto()`), optional QA-only tweaks in prototype; **no** middleware, edit-chrome, `(dashboard)/admin`.
- **Protected:** middleware, `lib/access` (optional micro-fixes only if blocking typecheck), `/t/*`, edit-chrome.
- **Output:** Signed-off `?dataSource=live` on Impronta; documented row count; grep shows no `getRoster(state.plan)` in roster-critical UI paths (or justified exceptions).
- **Acceptance:** Same 10 checks as wave-1 audit §6 + drawer consistency spot-check.
- **Rollback:** Revert single commit.
- **Owner:** mid+.

### Phase B — Capability unification (1–2 days)

- **Goal:** Every gate uses [`userHasCapability`](../../web/src/lib/access/has-capability.ts) / [`requireCapability`](../../web/src/lib/access/has-capability.ts) from `lib/access`; legacy modules become re-exports.
- **Why now:** New routes should not import two permission systems. Cost is small vs downstream confusion.
- **Files touched:** All `hasPhase5Capability` / `requirePhase5Capability` / direct `hasCapability` from saas in app + `lib/site-admin/server/*` + `lib/saas/representation-requests.ts`; [`web/src/lib/saas/capabilities.ts`](../../web/src/lib/saas/capabilities.ts), [`web/src/lib/site-admin/capabilities.ts`](../../web/src/lib/site-admin/capabilities.ts).
- **Protected:** Registry keys (`capabilities.ts`) — change only with explicit mapping review if mismatch found (stop-the-line).
- **Output:** `git grep` clean per internal P2.6 criteria + tests.
- **Acceptance:** `npm run test:access`, `check:capability-keys`, typecheck; smoke site-settings + fields + one server action.
- **Rollback:** Revert migration commit(s).
- **Owner:** senior for server actions; mid for pages.

### Phase C — Route promotion: workspace (1–2 weeks calendar, incremental)

- **Goal:** Canonical workspace URLs (e.g. `app.tulala.digital/[tenantSlug]/admin/...` per product decision) with **prototype UX** and **legacy loaders/actions**.
- **Why now:** Pre-launch; OPERATING §9 favors fast replacement.
- **Files touched:** New [`web/src/app/(workspace)/[tenantSlug]/admin/`](../../web/src/app/) tree (create), shared `lib/data/*` loaders, thin wrappers; **delete or 308** matching legacy routes **in same PR or immediate follow-up** per OPERATING.
- **Protected:** edit-chrome, `/t/*`, middleware structure (allow-list tweaks only if required — prefer smallest change).
- **Output:** Overview + Roster + Site wrapper first; then Work, Clients, Settings.
- **Acceptance:** Impronta smoke; tenant isolation test; no 404 host regression.
- **Rollback:** Revert promotion commit; restore legacy route if deleted in same PR (keep legacy until verified if team prefers — but then **violate OPERATING §9**; escalate explicitly).

### Phase D — Talent / client / platform surfaces

- **Goal:** Path-based shells for non-workspace actors; reuse existing `(dashboard)/talent` and `(dashboard)/client` logic.
- **Why later:** Depends on workspace patterns + Phase B stable.
- **Owner:** mid with senior on cross-tenant platform.

### Phase E — Prototype retirement

- **Goal:** Remove `web/src/app/prototypes/admin-shell` when all surfaces promoted; delete mocks.
- **Why last:** Freeze exists to prevent drift until promotion absorbs UX.

---

## Section 4 — First 10 commits/tasks

| # | Commit title (suggested) | Owner | Files / steps | Tests | Manual smoke | DoD | Rollback |
|---|---------------------------|-------|---------------|-------|--------------|-----|----------|
| 1 | `feat(phase-1): drawer roster reads use effectiveRoster` | mid | Replace `getRoster(state.plan)` with `effectiveRoster` in [`_drawers.tsx`](../../web/src/app/prototypes/admin-shell/_drawers.tsx) (3 sites); ensure `useProto` destructuring | `tsc` | Live URL: drawer counts match list | No mock data in drawers when live | Revert |
| 2 | `chore(prototype): document Phase 1 bridge parity` | any | Update task package / audit: SQL uses `relationship_type`, `talent_service_areas` | n/a | n/a | Docs match [`_data-bridge.ts`](../../web/src/app/prototypes/admin-shell/_data-bridge.ts) | Revert |
| 3 | `feat(phase-1): acceptance QA + promote` | any | Run 5 QA commands + 10 smokes; push `phase-1` | full | Impronta 29 rows | All green | Revert |
| 4 | `refactor(access): migrate site-settings pages to userHasCapability` | mid | 8–10 page files; **use `(cap, tenantId)`** | `tsc`, `test:access` | Owner vs non-staff | No `hasPhase5Capability` in dir | Revert |
| 5 | `refactor(access): migrate site-admin server actions` | senior | `identity`, `homepage`, `pages`, `navigation`, `design`, **`sections`** | + smoke saves | Save identity/pages | `requirePhase5Capability` gone from server | Revert |
| 6 | `refactor(access): migrate fields + representation-requests` | mid | [`fields/actions.ts`](../../web/src/app/(dashboard)/admin/fields/actions.ts), [`representation-requests.ts`](../../web/src/lib/saas/representation-requests.ts) | `tsc`, `test:access` | Field catalog | Greps clean | Revert |
| 7 | `refactor(access): deprecate re-export saas + site-admin capabilities` | senior | Thin shims + `@deprecated` | `test:access` | Smoke | Two files < ~40 LOC | Revert |
| 8 | `feat(workspace): scaffold [tenantSlug]/admin layout + overview` | senior | New route tree + `requireStaff` + `userHasCapability('agency.workspace.view', …)` + reuse overview loader | + tenant isolation if touched | `/impronta/admin` smoke | Real metrics | Revert |
| 9 | `feat(workspace): roster route + 308 legacy /admin/talent` | senior | Promote roster; redirect | `tsc` | List + detail | Legacy redirect | Revert |
| 10 | `feat(workspace): site shell wraps site-settings entry` | senior | Layout wraps existing pages **without** edit-chrome fork | `ci` subset | Publish flow | Builder works | Revert |

Adjust capability key names to match [`web/src/lib/access/capabilities.ts`](../../web/src/lib/access/capabilities.ts) exactly.

---

## Section 5 — Surface promotion order

Legend: **Now** = first tranche; **Soon** = after workspace core; **Later** = needs schema or platform maturity; **Much later** = cross-tenant / net-new complexity.

| Surface | When | Reason | Backend | Schema | UX priority | Risk |
|---------|------|--------|---------|--------|-------------|------|
| Workspace Overview | **Now** | Smallest; loaders exist | High | Read-only | High | Low |
| Workspace Roster | **Now** | Bridge proven | High | Read-only | High | Medium (detail pages) |
| Workspace Site / builder | **Soon** | Revenue + ops; **wrap** edit-chrome | High | CMS tables | **Critical** | **High** if rewrite — **don’t** |
| Workspace Work / Inquiries | **Soon** | Core ops; reuse `inquiry_messages` | Medium–high | Exists | High | Medium RLS/thread UX |
| Workspace Clients | **Soon** | Trust docs partially ahead of full schema | Medium | Some deferred evaluators | Medium | Medium |
| Workspace Settings | **Later** | Team/billing/taxonomy complexity | Medium | Mixed | Medium | Medium |
| Talent Today | **Soon** | Talent UX priority | Medium | Mostly exists | High | Low–medium |
| Talent Profile | **Soon** | Overlaps legacy editor | High | Exists | High | Low |
| Talent Inbox / messaging UX | **Later** | Prototype ≠ thread model; needs careful mapping | Partial | `inquiry_messages` yes; generic “messages” cards may overshoot | High | **High** if wrong abstraction |
| Talent Calendar / Reach / Activity | **Later** | More net-new product surface | Low–medium | Gaps in cards | Medium | Medium |
| Talent Settings | **Later** | prefs tables fragmented | Medium | Partial | Medium | Low |
| Client Discover | **Later** | Directory exists; personalized discover is more | Medium | shortlists etc. deferred | Medium | Medium |
| Client Inquiries / Bookings | **Soon** | Backend exists | High | Exists | High | Low–medium |
| Client Shortlists | **Later** | Schema may be incomplete vs prototype | Low | May need tables | Medium | Medium |
| Client Settings | **Later** | Trust ladder polish | Medium | Partial | Medium | Medium |
| Platform * | **Much later** | Cross-tenant; security surface | Low in UI | Audit logs partial | Lower pre-launch | **High** |

**Recommendation:** After Overview + Roster, prioritize **Site shell** (wrap builder) **before** net-new **Talent Inbox** prototype fidelity — builder breakage is company-stopper; inbox is iterative on existing inquiry threads.

---

## Section 6 — Reuse vs rebuild matrix

| System | Reuse legacy backend? | Reuse prototype UX? | Rebuild? | Notes |
|--------|----------------------|---------------------|----------|-------|
| Tenant resolution | **Yes** | N/A | No | Middleware + headers |
| Auth / session | **Yes** | N/A | No | Supabase + cookies |
| RLS | **Yes** | N/A | No | Never bypass for app reads |
| Page builder | **Yes** (subsystem) | Shell only | **No** rewrite | Wrap per invariants |
| CMS | **Yes** | Navigation IA in prototype | No | |
| Roster | **Yes** | **Yes** | Bridge already maps DTOs | |
| Talent profile | **Yes** | **Yes** | Incremental | `/t` + dashboard loaders |
| Messages (prototype) | **Partial** (`inquiry_messages`) | **Yes** | Thread UI rebuild on real | |
| Inquiries | **Yes** | **Yes** | Orchestration UX | |
| Booking | **Yes** where exists | **Yes** | Later richness | |
| Trust verification | **Partial** | **Yes** | Evaluators per doc | |
| Client dashboard | **Yes** | **Yes** | Replace shell | |
| Platform admin | **Minimal** | **Yes** | Mostly new | |
| Payments | **Deferred** per docs | N/A | Later | |
| Domains | **Yes** (`agency_domains`) | N/A | No | |
| Media / storage | **Yes** | N/A | No | |
| Analytics | **Partial** | Prototype charts | Careful | Often mock in prototype |

---

## Section 7 — Database impact plan

- **Read today (Phase 1):** `agency_talent_roster`, `talent_profiles`, `talent_profile_taxonomy`, `taxonomy_terms`, `talent_service_areas`, `locations` — consistent with [`_data-bridge.ts`](../../web/src/app/prototypes/admin-shell/_data-bridge.ts).
- **Already migrated (examples):** tenant_id on inquiries/messages; taxonomy v2; profile field catalog migrations per audit (198 migrations).
- **Read-only stance:** Phase 1–early Phase 3 should stay **additive**; no DROP/reshape (OPERATING + stop-the-line).
- **Messages:** `inquiry_messages` **exists** with RLS — prototype “3-thread messaging” may need **product** alignment, not necessarily new tables on day one.
- **Trust / client_trust_state:** product doc reserves some tables — **do not assume** full trust ladder is in DB; evaluate per feature.
- **Field catalog:** DB seed exists; frontend may still use prototype constants — per-surface cutover (Phase C/D).
- **Page builder tables:** `agency_pages`, `cms_sections`, `agency_navigation`, branding, tokens — **do not touch invariants**.
- **Payments / booking_transactions:** follow [`docs/transaction-architecture.md`](../transaction-architecture.md) — don’t improvise parallel money tables.

**Primary talent type:** Prefer **`relationship_type = 'primary_role'`** on `talent_profile_taxonomy` (matches unique partial index intent in bridge comments). Public page TypeScript may still mention `is_primary` — **converge types** during profile v2 cleanup, not as a Phase 1 blocker.

---

## Section 8 — Risks and stop conditions (practical)

| Risk | Prevent | Detect | If happens |
|------|---------|--------|------------|
| Tenant isolation break | Only SSR user client + scope | `test:tenant-isolation`, code review | Revert; no service-role “fix” |
| Service-role shortcut | Ban app reads via admin client | grep `createAdminClient` in app paths | Remove; fix RLS |
| Page builder break | Don’t fork edit-chrome; wrap routes | Playwright smoke | Revert wrapper |
| Public `/t` break | Don’t touch route in Phases A–B | Smoke slug | Bisect |
| Mock/live confusion | Bridge returns `[]`; client never substitutes mock when `bridgeRoster !== null` | Manual + unit | Fix client state |
| Route conflict | One source of truth per path | Next build | Rename or redirect |
| Destructive migration early | OPERATING + additive rule | Migration review | Roll back migration |
| Wrong capability mapping | Key-by-key parity | `check:capability-keys`, smoke | Stop; fix map |
| Prototype freeze drift | Bugfix-only commits | PR review | Escalate |
| Vercel/domain 404 | Seed `agency_domains` | Hit host | Alias/promote per runbook |

---

## Section 9 — Comparison to current internal plan

| Topic | Internal plan | This review |
|-------|---------------|-------------|
| Phase ordering (bridge → access → promote) | Yes | **Agree** — still the safest sequencing |
| Phase 1 tech | Server wrapper + bridge | **Agree**; implementation **already advanced** in repo |
| Phase 1 SQL detail in old task package | `is_primary` / `kind` | **Repo is ahead** — uses `relationship_type` + service areas |
| Phase 2 before promotion | Yes | **Agree** — cheap vs confusion |
| Phase 4 deletion timing | Soak then delete (plan file) | **Disagree with soak** for pre-launch — **OPERATING.md §9** says delete on replacement; **reconcile explicitly** |
| Client “all stubs” (audit) | Stated | **Disagree** — client overview is real |
| Governance weight | Many stop-the-line items | Keep **short** list (§8); escalate real blockers only |
| Extraction before ship | Implied heavy splits | **Prefer** split **during** promotion |

**Verdict:** The internal plan is **directionally right** but **too conservative on deletion timing** relative to your own OPERATING doc, and **some audit text is stale** vs code. **Do not replace** the whole plan — **amend** Phase 4 to match pre-launch removal policy and **update Phase 1 acceptance** to match `_data-bridge.ts` + drawer fix.

---

## Section 10 — Final recommendation

- **Continue** the 5-phase **strategy** (stabilize / bridge / unify / promote / retire).
- **Modify** execution details:
  1. Treat Phase 1 as **“verify + drawer fix + ship”**, not greenfield.
  2. Align **deletion policy** with [`OPERATING.md`](../OPERATING.md) §9 unless founder explicitly waives soak.
  3. Expand Phase 2 grep scope to **`sections.ts`** and **`representation-requests.ts`**.
  4. Promote workspace **Overview → Roster → Site wrap** before deep messaging UX.
- **Next safest commit:** `feat(phase-1): align prototype drawers with effectiveRoster` (or confirm already done on branch + run acceptance).
- **Tell the team:** “Prototype is UX truth; legacy is loader/action donor. Bridge pattern is validated in code — finish Phase 1 QA, unify `lib/access` next, then ship `(workspace)/[tenantSlug]/admin` with OPERATING’s delete-on-replacement discipline. Do not rewrite edit-chrome. Fix drawer mock drift before declaring Phase 1 done.”

---

## References (read for this investigation)

- [`~/.claude/plans/ancient-gathering-sparkle.md`](../../.claude/plans/ancient-gathering-sparkle.md)
- [`docs/handoffs/wave-1-prep-audit.md`](./wave-1-prep-audit.md)
- [`docs/handoffs/admin-shell-execution-task-package.md`](./admin-shell-execution-task-package.md)
- [`web/docs/admin-prototype/FREEZE.md`](../../web/docs/admin-prototype/FREEZE.md)
- [`web/docs/admin-prototype/dev-handoff.md`](../../web/docs/admin-prototype/dev-handoff.md)
- [`OPERATING.md`](../OPERATING.md) §9, §12, §12a
- Locked product docs: [`docs/talent-relationship-model.md`](../talent-relationship-model.md), [`docs/transaction-architecture.md`](../transaction-architecture.md), [`docs/talent-monetization.md`](../talent-monetization.md), [`docs/client-trust-and-contact-controls.md`](../client-trust-and-contact-controls.md), [`docs/taxonomy-and-registration.md`](../taxonomy-and-registration.md), [`docs/page-builder-invariants.md`](../page-builder-invariants.md)

---

*End of report.*
