# Premium Execution Runbook — Who Does What

**Companion to:** `docs/plans/premium-execution-plan-2026-05-12.md`
**Purpose:** That file is *what* and *why*. This file is *who* and *how*. Each task below has an assigned agent type, dispatch prompt, dependencies, and verification gate.

**Total: 7 phases (0 → G), 76 tasks. ~6.5 weeks of focused agent work.**

---

## Agent type guide (pick the right tool per task)

| Agent type | Best for | Avoid for |
|---|---|---|
| **sonnet** *(general-purpose, default)* | Well-scoped fixes touching 1-3 files, copy changes, single-pattern codemods, UI tweaks, additions to existing patterns | Cross-cutting sweeps >5 files, ambiguous root-cause investigations |
| **opus** *(general-purpose, model="opus")* | New architecture (e.g. notifications backend), large refactors, ambiguous bugs that need data-flow tracing, multi-step investigations | Trivial single-line fixes (waste of token budget) |
| **Explore** *(read-only)* | Upfront discovery when fix path is unclear, "where is X defined" questions, cross-file consistency audits | Anything that needs to write code |
| **Plan** *(read-only architect)* | Designing a new subsystem before implementation (e.g., notifications data model), architectural trade-offs | Tasks where the design is already clear |
| **claude** *(default, parent)* | Orchestration, light edits inline, picking which sub-agent to dispatch | Long-running focused work (delegate to sonnet/opus instead) |

### Foreground vs background

- **Foreground** = block on the result before moving on. Use when the next task depends on what this one finds/builds.
- **Background** = dispatch and continue. Use for independent work that takes >5 min.
- **Parallel batch** = multiple agents in a single dispatch message. Use when 2+ tasks are independent.

### Dispatch defaults

- All implementation agents: **`general-purpose` subagent_type**, model picked per-task.
- All read-only agents: **`Explore` subagent_type**.
- All architecture-design agents: **`Plan` subagent_type**.
- Always include in the prompt: "Run `npx tsc --noEmit` before commit. Reference finding ID (e.g. `0.3`, `B.2`) in commit message."

---

## Phase 0 — Reconnect the loop *(2-4 days, blocks everything else)*

> Live walkthrough verification at end: admin + client + talent sessions on `tulala.digital` Impronta tenant complete the five-step loop.

### 0.1 ✅ Client discover filter widened — DONE (commit `9aa3d4f1`)

No dispatch needed.

---

### 0.2 — Verify inquiry-form dropdown populates

| | |
|---|---|
| **Agent** | sonnet |
| **Effort** | 30 min |
| **Dep** | none |
| **Mode** | foreground |

**Prompt:**
> Live-verify on `https://app.tulala.digital/impronta/client/inquiries/new` that the talent dropdown lists at least the 2 published + several claimed talents that exist on the Impronta tenant. The relevant filter is at `web/src/app/(workspace)/[tenantSlug]/client/inquiries/new/page.tsx:44-46` and was widened in Wave 3 to `state === "published" || state === "claimed"`. Confirm by reading the file and matching against the `loadWorkspaceRosterEnriched` return shape. If the filter is correct but the dropdown is still empty, escalate (likely a data-bridge issue). Report in under 100 words.

**Verify:** Read confirms filter; live page shows ≥ 2 talent options.

---

### 0.3 — Root-cause why talent inbox is empty after admin assignment *(HIGHEST PRIORITY)*

| | |
|---|---|
| **Agent** | **opus** |
| **Effort** | 1 day |
| **Dep** | none (entry point) |
| **Mode** | foreground |

**Prompt:**
> You are investigating the most critical bug in Tulala: when an admin uses "Add talent" on an inquiry, the participant row IS created (verified live 2026-05-12), but the talent NEVER sees that inquiry in their `/[slug]/talent/inbox`. Loop is broken end-to-end.
>
> Trace the data flow:
> 1. Admin clicks Add talent → `addInquiryLineupTalent` in `web/src/app/(workspace)/[tenantSlug]/admin/_pipeline-actions.ts` → `rosterAddTalent` server action → `addTalentToRoster` engine in `web/src/lib/inquiry/inquiry-engine-roster.ts`.
> 2. Engine inserts into `inquiry_participants` with `role='talent'`, `status='invited'`. Verified working live in commit `273f28fc` (Wave 5 backfill).
> 3. Talent inbox page is `web/src/app/(workspace)/[tenantSlug]/talent/inbox/page.tsx` which uses `_data-bridge/talent.ts` to load inquiries.
>
> Investigate the bridge query:
> - Does it filter by `talent_profile_id` correctly (NOT `user_id`)?
> - Does it require `status === 'active'` (excluding `invited`)?
> - Does it require RLS access (`inquiry_participants` policies must allow talent SELECT)?
> - Is there a `talent_profiles.user_id` join that breaks when the talent_profile has no user_id?
>
> Cross-reference RLS policies in `supabase/migrations/*inquiry_participants*` and check `web/src/app/(workspace)/[tenantSlug]/_data-bridge/talent.ts`.
>
> Fix the root cause. Add a defensive logging line if needed for live debugging. Verify in production: as `qa-admin@impronta.test` add a Tulum talent to an inquiry, then log in as that talent on a second session — inquiry should appear in their inbox within 5 seconds.
>
> Output: commit + push + brief root-cause summary.

**Verify:** Live three-session walkthrough on Impronta tenant. Admin adds talent → talent (other browser) sees inquiry without refresh.

---

### 0.4 — Public directory shows real talent

| | |
|---|---|
| **Agent** | sonnet |
| **Effort** | 4h |
| **Dep** | none |
| **Mode** | foreground |

**Prompt:**
> The public directory at `improntamodels.com/directory` (and `tulala.digital/directory` when on agency host) currently shows "0 profiles" despite the Impronta tenant having 2 published + 22 claimed talents.
>
> Investigate:
> 1. The public directory entry point is `web/src/app/(public)/directory/page.tsx` (likely) — read it.
> 2. The query path probably uses `web/src/lib/directory/*` or similar.
> 3. Check whether the filter requires `workflow_status === 'published'` AND `roster.status === 'active'` (the strict path). Same root cause as the Wave 3 discover/inquiry-form fix.
>
> Fix: widen the filter to include talent with active roster + (published OR claimed). Be careful: public directory differs from authenticated-client discover — claimed talent might not yet have public-ready profiles. Acceptable middle: only include published-on-public-directory talent (a more conservative widening). Check the actual `workflow_status` enum values and `agency_visibility` if it exists.
>
> Output: minimal-diff commit, push, live-verify `https://improntamodels.com/directory` shows ≥1 card.

**Verify:** `curl -L https://improntamodels.com/directory` returns markup containing talent profile-code references.

---

### 0.5 — Custom-domain readout reflects `agency_domains`, not plan tier

| | |
|---|---|
| **Agent** | sonnet |
| **Effort** | 4h |
| **Dep** | none |
| **Mode** | foreground |

**Prompt:**
> Bug confirmed at `web/src/components/admin/shell/internal/pages.tsx:9586`:
> ```tsx
> description={meetsPlan(state.plan, "studio") ? "Live at your custom domain" : `Currently at ${...subdomain...}`}
> ```
> This reads the mock `state.plan` from the SPA shell, not the real `agency_domains` table. For the Impronta tenant — which has `improntamodels.com` verified in `agency_domains` — this incorrectly shows "Currently at impronta.tulala.app".
>
> Fix:
> 1. Add a server-side data load in `pages.tsx` parent (or via the bridge) that queries `agency_domains` for the current tenant: `SELECT primary_domain, status FROM agency_domains WHERE tenant_id = ? AND status = 'verified' LIMIT 1`.
> 2. Plumb the result into the shell state (e.g. `state.customDomain: string | null`).
> 3. Change the TierCard at line 9584 to: `description = state.customDomain ? \`Live at \${state.customDomain}\` : \`Currently at \${subdomain}\``.
> 4. Update the `meta` indicator likewise — show `<StatDot tone="green" /> Verified` only when domain actually verified.
>
> Don't change the upgrade-CTA logic (that's plan-gated for buyers).
>
> Output: commit + push. Live-verify Impronta admin sees "Live at improntamodels.com · Verified".

**Verify:** Live screenshot on admin settings shows real domain.

---

### 0.6 — Talent profile / calendar / settings stop rendering blank

| | |
|---|---|
| **Agent** | **opus** |
| **Effort** | 1 day |
| **Dep** | none (parallel with 0.3) |
| **Mode** | foreground |

**Prompt:**
> User reports that visiting `/impronta/talent/profile`, `/calendar`, `/settings` renders BLANK bodies — the page loads but shows no content.
>
> The three route files are minimal:
> ```
> web/src/app/(workspace)/[tenantSlug]/talent/profile/page.tsx
> web/src/app/(workspace)/[tenantSlug]/talent/calendar/page.tsx
> web/src/app/(workspace)/[tenantSlug]/talent/settings/page.tsx
> ```
> All three are: `force-dynamic` exports + `<TalentPageRouteSyncer page="..." />` only. The actual rendering happens in the talent SPA shell (`web/src/components/admin/shell/internal/talent.tsx`) via the route syncer.
>
> Investigate:
> 1. Open `web/src/app/(workspace)/[tenantSlug]/talent/_talent-page-route-syncer.tsx`. Check what it sets in shell state.
> 2. Open `talent.tsx` and find where it switches on the `talentPage` state value. Cases: `inbox`, `today`, `profile`, `calendar`, `bookings`, `settings`. Verify each case renders something.
> 3. Likely culprit: a case is gated on a feature flag, a profile state, or `isBridgeMode` and silently renders null in production data mode.
> 4. Test by reading the conditional rendering around each `talentPage === "profile"` / `"calendar"` / `"settings"` block.
>
> Fix: ensure each route always renders at least the page header and an empty-state fallback if no data — no path should produce a fully blank body. Add server-side log if a render guard fires.
>
> Output: commit + push. Live-verify each route shows content within 2s.

**Verify:** Visit each route as `tulum-talent-sofia@impronta.test` — body content renders.

---

### 0.7 — Talent settings stops showing wrong-tenant data

| | |
|---|---|
| **Agent** | sonnet |
| **Effort** | 4h |
| **Dep** | 0.6 (needs settings page to render first) |
| **Mode** | foreground |

**Prompt:**
> When a talent on the Impronta tenant opens their settings, the page shows hardcoded text like "Atelier Roma", "Pro plan", and fake verification claims. This is cross-tenant data leakage, not generic mock placeholder.
>
> Files to inspect:
> - `web/src/components/admin/shell/internal/talent.tsx` (settings section, search for "Atelier Roma" — found at lines 4960, 4996, 5030, 5069, 5099)
> - `web/src/components/admin/shell/internal/state.tsx` (talent fixture data)
>
> Fix:
> 1. Replace every "Atelier Roma" literal with `effectiveTenant.name` (already wired in the shell context for similar fixes — see Wave 2 commit `3e7d3264`).
> 2. Strip the fake plan tier display from the talent settings page — talent users don't have plan tier per se (the workspace does). Show only what's actually persisted on the talent's record: their email, real workflow_status, real `home_country` setting, real notification prefs.
> 3. Strip fake verification claims. Render only verifications that exist in `talent_profiles.badges` (which Wave 6 audit confirmed is empty — that's fine, just show "Verify your identity →" CTA, not a checkmark for unverified state).
>
> Output: commit + push. Live-verify Sofía's talent settings on Impronta show real Impronta workspace name and only honestly-rendered fields.

**Verify:** `grep -rn "Atelier Roma" web/src/app/(workspace)/[tenantSlug]/talent/` returns 0 hits. Live render confirms.

---

## Phase A — Foundation gaps *(3-5 days)*

### A.1 — Branded 404 for unregistered hosts

| | |
|---|---|
| **Agent** | sonnet |
| **Effort** | 2h |
| **Dep** | Phase 0 done |
| **Mode** | foreground |

**Prompt:**
> File `web/src/proxy.ts:120-127` currently returns plain text "Host not registered. Seed agency_domains." for unknown hosts (Vercel middleware). Replace with a branded 404 page.
>
> Plan:
> 1. Create `web/src/app/_host-unregistered/page.tsx` as a static page with the Tulala logo, "This domain isn't connected yet" copy, and a link to `https://tulala.digital`.
> 2. In `proxy.ts`, instead of returning plain text, rewrite the request to `/_host-unregistered` and let Next.js render the branded page (status still 404).
> 3. Ensure middleware doesn't loop on the new page (whitelist it).
>
> Output: commit + push. Verify with `curl -L https://random-non-existent.example.tulala.digital` (or similar) returns branded HTML.

**Verify:** Curl unknown host returns branded HTML.

---

### A.2 — Replace silent catches

| | |
|---|---|
| **Agent** | sonnet |
| **Effort** | 1h |
| **Dep** | none |
| **Mode** | foreground or parallel with A.3 |

**Prompt:**
> Three sites currently swallow errors silently:
> - `web/src/app/(workspace)/[tenantSlug]/admin/media/actions.ts` (~line 85 and ~95 — `catch { return null; }`)
> - `web/src/app/(workspace)/[tenantSlug]/admin/site/CopyUrlButton.tsx` (`catch { /* ignore */ }`)
>
> Replace each `catch { }` or `catch { return null }` with `catch (err) { logServerError("media.<context>", err); return { ok: false, error: CLIENT_ERROR.update }; }` (for server actions) or `catch (err) { logClientError("CopyUrlButton.copy", err); toast({ tone: "error", title: "Copy failed — try again" }); }` (for client component).
>
> Use `web/src/lib/server/safe-error.ts` for the helpers — these are the established patterns.
>
> Output: commit + push.

**Verify:** `grep -rn "catch { }\|catch { return null" web/src` returns 0 hits.

---

### A.3 — `guardedQuery<T>` wrapper for `_data-bridge`

| | |
|---|---|
| **Agent** | opus |
| **Effort** | 1 day |
| **Dep** | none |
| **Mode** | foreground (touches many files) |

**Prompt:**
> The `_data-bridge` modules in `web/src/app/(workspace)/[tenantSlug]/_data-bridge/*` currently trust the calling layout's scope check. A drawer caller could theoretically bypass it.
>
> Create `web/src/lib/server/guarded-query.ts` exporting:
> ```typescript
> export async function guardedQuery<T>(
>   context: string,
>   required: "staff" | "client" | "talent" | "any",
>   fn: (auth: AuthContext) => Promise<T>,
> ): Promise<T | null>
> ```
>
> Wrap every server data-load function in `_data-bridge/*` with this. Pattern:
> ```typescript
> export async function loadX(tenantId: string) {
>   return guardedQuery("loadX", "staff", async (auth) => { ... });
> }
> ```
>
> Don't change function signatures; the auth check is internal. Return `null` (with logged warning) if guard fails — calling pages already handle null bridge data.
>
> Output: commit + push. Confirm `grep -rn "createSupabaseServerClient" web/src/app/(workspace)/[tenantSlug]/_data-bridge` has been replaced by `guardedQuery` calls (except the auth helper itself).

**Verify:** TS check passes. Every data-bridge function passes through `guardedQuery`.

---

### A.4 — `ServerActionResult<T>` canonical type + audit

| | |
|---|---|
| **Agent** | opus |
| **Effort** | 1 day |
| **Dep** | none (parallel with A.3) |
| **Mode** | foreground |

**Prompt:**
> Server action result shapes are inconsistent across the codebase. Two shapes coexist:
> 1. `{ ok: true; data?: T } | { ok: false; error: string }` (admin actions, most newer files)
> 2. `{ error: string }` or raw `T` (talent-field-values.ts, some media actions)
>
> Step 1: Create `web/src/lib/server-actions/result.ts`:
> ```typescript
> export type ServerActionResult<T = undefined> =
>   | { ok: true; data: T }
>   | { ok: false; error: string; reason?: string };
> ```
>
> Step 2: Audit every file in `web/src/lib/server-actions/` and every `actions.ts` under `web/src/app/(workspace)/`. List which ones don't conform.
>
> Step 3: Convert non-conforming files to the canonical type. For each:
> - Update return shape
> - Update call sites (TypeScript will guide you)
> - Don't break behavior — just type/shape harmonization
>
> Output: incremental commits per file pattern (e.g., "chore(server-actions): conform <file> to ServerActionResult"). Push when done.

**Verify:** `grep -rn "Promise<\(.* | \)\?{ error" web/src/lib/server-actions/` returns 0 hits.

---

### A.5 — Replace remaining `void promise` with `.catch(logServerError)`

| | |
|---|---|
| **Agent** | sonnet |
| **Effort** | 4h |
| **Dep** | none |
| **Mode** | parallel with A.2, A.3, A.4 |

**Prompt:**
> Wave 2 (commit `5fabeb5d`) fixed 8 paths. The audit found these still remain:
> - `web/src/app/share/folder/[token]/page.tsx` (view count increment)
> - `web/src/components/edit-chrome/edit-context.tsx` (DOM cache bust)
> - `web/src/components/admin/shell/internal/state.tsx` (preference persistence, prefetch)
> - `web/src/lib/server-actions/user-prefs.ts` (all writes documented as fire-and-forget)
> - `web/src/components/admin/shell/internal/media-page.tsx`
> - `web/src/components/admin/shell/internal/wave2.tsx`
>
> For each `void someAsyncFn()` callsite, replace with `someAsyncFn().catch((err) => logServerError("context", err))`. Use a stable context string like `media-page.cacheBust` or `state.prefSave`.
>
> For client-side equivalents, use `logClientError` if it exists, or `console.error` if not (then create a thin `logClientError` helper).
>
> Output: commit + push.

**Verify:** `grep -rn "void [a-z][a-zA-Z]*Async\?(" web/src/components web/src/lib` returns only `void 0`, `void el`, etc.

---

### A.6 — `.maybeSingle()` lint rule

| | |
|---|---|
| **Agent** | sonnet |
| **Effort** | 4h |
| **Dep** | none |
| **Mode** | foreground |

**Prompt:**
> Add an ESLint rule (custom plugin or `eslint-plugin-local-rules`) that flags `.maybeSingle()` or `.single()` calls not immediately followed by a `if (!result || error)` guard.
>
> Steps:
> 1. Create `web/eslint-rules/no-unguarded-maybe-single.js` (a custom AST rule).
> 2. Register in `web/.eslintrc.*`.
> 3. Run `npm run lint` and fix the few violations.
>
> Acceptable: rule has `--fix` autoinsert of `if (!data) return { ok: false, error: "Not found" };` (optional).
>
> Output: commit + push. CI lint stays green.

**Verify:** Lint passes; intentional unsafe destructure produces error.

---

### A.7 — Inline form validation on critical forms

| | |
|---|---|
| **Agent** | sonnet |
| **Effort** | 1 day |
| **Dep** | none |
| **Mode** | parallel with A.5, A.6 |

**Prompt:**
> Two critical forms currently lack inline validation; users only learn what's wrong after a server round-trip:
> 1. `web/src/app/(workspace)/[tenantSlug]/client/inquiries/new/new-inquiry-form.tsx` (lines 119-185)
> 2. `web/src/app/onboarding/actions.ts` (server side, but the client form is at `web/src/app/onboarding/talent-location/*`)
>
> Add field-level validation with `useState` per field error + `onBlur` validation. Required fields show "required" hint on first blur, validation messages on submit attempt.
>
> Use the existing FIELD_STYLE pattern. Show inline `<span>` errors below each field with `role="alert"`.
>
> Output: commit + push.

**Verify:** Submit empty form → inline errors appear, no server round-trip needed.

---

## Phase B — Real-data wiring *(8-12 days)*

### B.1 — Wire `WORKSPACE_REGISTRY` to real settings

| | |
|---|---|
| **Agent** | opus |
| **Effort** | 1 day |
| **Dep** | Phase A complete |
| **Mode** | foreground |

**Prompt:**
> Replace the hardcoded `WORKSPACE_REGISTRY` object in `web/src/components/admin/shell/internal/messages.tsx:273-290` with real workspace identity loaded from the DB.
>
> Steps:
> 1. Define `getWorkspaceIdentity(tenantId: string)` in `web/src/lib/saas/workspace-identity.ts` — load name, signature, plan tier, avatar from `agencies` + `agency_settings` tables.
> 2. Plumb the result into the admin shell context (`state.tsx`) at boot, exposed as `effectiveWorkspace`.
> 3. In `messages.tsx`, replace `WORKSPACE_REGISTRY[name]` lookups with `effectiveWorkspace.*`.
> 4. Remove the now-dead constant.
>
> Output: commit + push. Live-verify on Impronta admin that signature, plan, and identity render real values.

**Verify:** `grep -rn "WORKSPACE_REGISTRY\|Atelier Roma" web/src/components/admin/shell` returns 0 production-render hits.

---

### B.2 — Notifications backend (Phase X)

| | |
|---|---|
| **Agent** | **Plan first, then opus** |
| **Effort** | 4d (1d design + 3d implementation) |
| **Dep** | Phase A complete |
| **Mode** | foreground (long-running) |

**Step 1 — Architecture design (Plan agent):**

> Design the data model and event-emission architecture for real notifications in Tulala. Constraints:
> - Multi-tenant (every row has `tenant_id`).
> - Per-user feed (filter by `user_id` + `tenant_id`).
> - Categories: action / system / update / message (extensible).
> - Existing `inquiry_events` table emits structured events — notifications should be derived from these where possible (avoid double-writes).
> - Read tracking: per-user-per-notification, with timestamp.
> - Real-time delivery via Supabase Realtime subscription (already used elsewhere — see `realtime` references in the codebase).
> - Notification preferences live in `user_prefs.notification_prefs` (already exists).
>
> Output: a design doc proposing
> - Table schemas (`user_notifications`, optionally `notification_subscriptions`)
> - RLS policies
> - Event-to-notification mapping (which `inquiry_events` types create which notification kinds)
> - Hook signature for `useNotifications(userId, tenantId)`
> - Migration path from current mock data
> - Rollout strategy (feature-flag or full cutover)

**Step 2 — Implementation (opus):**

> Implement the notifications backend per the design from Plan step 1. Create the migration, RLS, server hooks, and the `NotificationsDrawer` rewire. Update `web/src/components/admin/shell/internal/drawers.tsx` (`NotificationsDrawer` function around line 17636) to consume real data via the new hook.
>
> Mark-all-read calls the new RPC. Live event delivery via Supabase Realtime channel.
>
> Output: migrations + lib code + drawer rewire + verification. Live test: submit a new inquiry as client → admin and talent both get a notification row in their feed within 5s.

**Verify:** Live three-session test. Migration applied. `grep "MOCK_TALENT_NOTIFS\|NOTIFICATIONS const" web/src` returns 0 hits.

---

### B.3 — Talent calendar Phase 5 data model

| | |
|---|---|
| **Agent** | **Plan first, then opus** |
| **Effort** | 4d (1d design + 3d implementation) |
| **Dep** | none structural (can parallel with B.2 after Plan stages) |
| **Mode** | foreground |

**Step 1 — Architecture design (Plan agent):**

> Design the talent calendar data model per `~/.claude/projects/-Users-oranpersonal-Desktop-impronta-app/memory/project_trust_the_loop_audit.md` Phase 5 specification. Three tables needed:
> - `talent_bookings` — confirmed work
> - `talent_holds` — tentative availability blocks
> - `talent_availability_blocks` — out-of-office / unavailable periods
>
> Each needs RLS for: talent themselves (full access), agency admin (their roster only), client (only their own bookings via inquiry link).
>
> Output: design doc with schemas, indexes (calendar queries are date-range heavy), RLS, bridge query patterns, integration points with existing `inquiries.event_date`, migration safety on production.

**Step 2 — Implementation (opus):**

> Implement per the Plan design. Create migration `20260923000000_talent_calendar_v1.sql`. Wire bridge in `web/src/app/(workspace)/[tenantSlug]/_data-bridge/talent-calendar.ts` (new file). Update `web/src/components/admin/shell/internal/talent.tsx:11015-11080` (calendar render) to read real data; remove mock TALENT_BOOKINGS / TALENT_REQUESTS fallbacks except as labeled-demo paths.
>
> Output: migration + bridge + UI rewire + live test (confirmed booking on inquiry → appears on talent calendar).

**Verify:** Talent confirms booking on an inquiry → appears on `/talent/calendar` immediately.

---

### B.4 — Public talent profile real data

| | |
|---|---|
| **Agent** | sonnet |
| **Effort** | 1 day |
| **Dep** | none |
| **Mode** | parallel after Phase A |

**Prompt:**
> `web/src/app/share/talent/[slug]/page.tsx:23-58` currently renders only `MOCK_TALENT` with the single key `"marta-reyes"`. This is the only public-facing talent share page.
>
> Replace with real data:
> 1. Resolve `[slug]` via `SELECT * FROM talent_profiles WHERE profile_code = $1 AND workflow_status = 'published'`.
> 2. Load gallery images via `media_assets` join (`avatar`, `hero`, gallery `kind` variants).
> 3. If slug not found, fall back to a "Profile not found" page (branded).
> 4. Add proper OG meta tags per profile (use the avatar image as og:image).
> 5. Wire the "Send inquiry" CTA to redirect to `/[tenantSlug]/inquiry?talent={profile_code}&source=share`.
>
> Output: commit + push. Live-verify with a known slug from the Impronta roster.

**Verify:** Visit `https://tulala.digital/share/talent/<real-slug>` → real talent renders.

---

### B.5 — Empty roster CTA on storefront

| | |
|---|---|
| **Agent** | sonnet |
| **Effort** | 4h |
| **Dep** | none |
| **Mode** | parallel |

**Prompt:**
> When an agency storefront loads with zero published talent, the directory currently renders blank/cards-with-no-data. Add an empty state:
> 1. Detect `roster.filter(r => r.state === "published").length === 0` in `web/src/components/home/agency-home-storefront.tsx` (or the relevant directory component).
> 2. Render an EmptyState component with: "🎭 Roster coming online" + "{{agencyName}} is finalizing their talent showcase. Send an inquiry now and they'll match you." + CTA to inquiry form.
>
> If the agency admin is viewing their own storefront in preview mode (signed in), add a secondary CTA: "→ Add your first talent" linking to `/[slug]/admin/roster`.
>
> Output: commit + push.

**Verify:** Fresh agency storefront → branded empty state, not blank cards.

---

### B.6 — Trust badges source from DB

| | |
|---|---|
| **Agent** | sonnet |
| **Effort** | 2 days |
| **Dep** | none |
| **Mode** | foreground |

**Prompt:**
> `talent_profiles.badges` is currently always empty in production. Wire badge population:
>
> 1. Verify schema: `badges JSONB` or `text[]` — check migration history. If not a column, add one in a new migration.
> 2. Identify verification touch points that should write a badge: ID verification flow, age verification, agency-managed status (auto), payment-method connection.
> 3. For each touchpoint, add the corresponding badge insert in the success path. Use a server function like `awardTalentBadge(supabase, talentProfileId, badge)` for consistency.
> 4. Render badges in `talent.tsx:4046-4058` (BadgeChip) — already shipped, just needs data.
>
> Per `~/.claude/projects/-Users-oranpersonal-Desktop-impronta-app/memory/project_client_trust_badges.md`: badges are tier signals, never paywalled.
>
> Output: commits per touchpoint + push. Live-verify one verification flow end-to-end (verify identity → badge appears).

**Verify:** Complete identity verification → badge appears on talent profile.

---

### B.7 — Client trust chips on talent inbox

| | |
|---|---|
| **Agent** | sonnet |
| **Effort** | 4h |
| **Dep** | none |
| **Mode** | parallel with B.6 |

**Prompt:**
> Talent inbox rows in `web/src/components/admin/shell/internal/talent.tsx:351-400` currently don't display the client's trust tier. Per `project_client_trust_badges.md` §5, ClientTrustChip should appear next to client name.
>
> 1. Check if `ClientTrustChip` component exists — likely in `talent-drawers.tsx` or similar. If not, create.
> 2. Bridge data: inquiry → `client_user_id` → `client_profiles.trust_tier` (or similar; verify schema).
> 3. Render the chip in InboxRow after client name, before stage chips.
>
> Output: commit + push.

**Verify:** Talent inbox shows tier badge per inquiry.

---

### B.8 — Admin overview real-data sweep

| | |
|---|---|
| **Agent** | sonnet |
| **Effort** | 1 day |
| **Dep** | none |
| **Mode** | parallel |

**Prompt:**
> User audit found admin Overview tab has "Load demo data" controls visible to real users + prototype analytics tiles that don't reflect real workspace state.
>
> 1. In `web/src/components/admin/shell/internal/pages.tsx` Overview section, remove or feature-flag the "Load demo data" button. Operations should be invisible/unreachable in production.
> 2. Audit Overview tiles: every numeric stat should either be real-data-backed or marked with `DemoBadge` (the pattern from Wave 2 commit `491d3dac`).
> 3. Replace prototype analytics with operational "needs you today" cards backed by `inquiry_events` queries: count of inquiries waiting on you, count of unanswered messages, count of pending offers.
>
> Output: commit + push. Live-verify admin Overview on Impronta shows real numbers + no demo controls.

**Verify:** Live admin Overview shows real Impronta data only.

---

### B.9 — Inquiry-form completeness (real brief)

| | |
|---|---|
| **Agent** | sonnet |
| **Effort** | 2 days |
| **Dep** | none |
| **Mode** | parallel |

**Prompt:**
> Current inquiry form at `web/src/app/(workspace)/[tenantSlug]/client/inquiries/new/new-inquiry-form.tsx` captures: contactName, company, talentProfileId (single), eventDate, quantity, eventLocation, message.
>
> Add fields the user audit identified as missing for a real booking brief:
> - **event_type** (select): editorial, lookbook, commercial, runway, fitting, content, other
> - **budget_range** (select): under €500, €500-1k, €1k-3k, €3k-10k, €10k+, "Open" (mapped to `inquiries.budget_min` / `budget_max`)
> - **usage_type** (select): print, digital, broadcast, internal, social-only
> - **call_time** (optional time): event start time
> - **multi-talent select**: allow selecting up to 5 talent (use existing `talent_profile_ids` array on submit)
> - **files**: upload up to 3 reference images / PDFs (use Supabase Storage `inquiry-references` bucket)
>
> Wire each through `submitInquiry` server action — most fields already exist on `inquiries` table; add columns via migration if missing.
>
> Output: migration (if needed) + form + action + types. Commit + push.

**Verify:** Submit a full-brief inquiry — admin sees all fields in workspace drawer.

---

### B.10 — Quantity label disambiguation

| | |
|---|---|
| **Agent** | sonnet |
| **Effort** | 1h |
| **Dep** | B.9 (or independent if scoped tight) |
| **Mode** | parallel |

**Prompt:**
> Quick fix: in `new-inquiry-form.tsx` field at line 153-161, the "Quantity" label is ambiguous — "2 talent" reads as selected talent, not quantity.
>
> Change label from "Quantity" to "How many talent do you need?" with helper text "Total slots to fill — separate from any preferred talent above". Render the value downstream as "{n} **slots**" not "{n} talent".
>
> Output: commit + push.

**Verify:** Form copy is unambiguous.

---

## Phase C — System consistency *(5-7 days)*

### C.1 — Centralized error-copy lexicon

| | |
|---|---|
| **Agent** | sonnet |
| **Effort** | 1 day |
| **Dep** | A.4 (canonical result shape) |
| **Mode** | foreground |

**Prompt:**
> Create `web/src/lib/i18n/error-copy.ts` exporting `ERROR_COPY: Record<string, { en: string; es: string }>` for 10-15 common reason codes: `forbidden`, `rate_limited`, `not_found`, `version_conflict`, `validation_failed`, `network_error`, `unexpected`, etc.
>
> Update server actions to emit `reason` codes (e.g. return `{ ok: false, error: "...", reason: "rate_limited" }`). Update toast dispatchers to look up copy via `ERROR_COPY[reason][locale]` with fallback to the raw `error` string.
>
> Replace ad-hoc English in `CLIENT_ERROR` constant with references to the new copy table.
>
> Output: commit + push.

---

### C.2 — Single `useToast()` API

| | |
|---|---|
| **Agent** | opus |
| **Effort** | 1 day |
| **Dep** | none structural |
| **Mode** | foreground |

**Prompt:**
> Three toast/notification systems coexist (state-based toast queue, AlertRow panel, browser `alert()`). Consolidate to one.
>
> 1. Define canonical `useToast()` hook in `web/src/lib/ui/toast.ts` with signature: `toast({ tone, title, description?, durationMs?, action? })`.
> 2. Default durations: success 3000ms, error 6000ms, info 4000ms, warning 5000ms.
> 3. All titles/descriptions are i18n keys, resolved at render time.
> 4. Sweep codebase replacing all `alert()`, custom toast variants, and ad-hoc banners with the single API.
> 5. Add ESLint rule disallowing direct `alert(` calls.
>
> Output: incremental commits per file pattern. Push when sweep complete.

**Verify:** `grep -rn "alert(" web/src --include="*.tsx" --include="*.ts"` returns 0 hits.

---

### C.3 — Standard `<EmptyState>` component

| | |
|---|---|
| **Agent** | sonnet |
| **Effort** | 1 day |
| **Dep** | none |
| **Mode** | parallel |

**Prompt:**
> Refactor empty states across the codebase. Create canonical `<EmptyState>` in `web/src/lib/ui/empty-state.tsx`:
> ```tsx
> <EmptyState icon="inbox" title={t("...")} description={t("...")} primaryAction={{ label, href|onClick }} secondaryAction={...} />
> ```
> Sweep all list-rendering components and wire through this. Every list now has a CTA-carrying empty state.
>
> Output: commits per surface (admin, client, talent). Push when done.

---

### C.4 — Route-aware `loading.tsx`

| | |
|---|---|
| **Agent** | sonnet |
| **Effort** | 1 day |
| **Dep** | none |
| **Mode** | parallel |

**Prompt:**
> Add `loading.tsx` files matched to each major surface so tab-nav within `/admin/*`, `/client/*`, `/talent/*` shows a skeleton instead of flashing blank.
>
> Each loading file renders a skeleton matching its parent layout (header + main content area outline). Use `web/src/lib/ui/skeleton.tsx` (create if missing).
>
> Sites to add:
> - `app/(workspace)/[tenantSlug]/admin/roster/loading.tsx`
> - `app/(workspace)/[tenantSlug]/admin/messages/loading.tsx`
> - `app/(workspace)/[tenantSlug]/admin/settings/loading.tsx`
> - `app/(workspace)/[tenantSlug]/client/inquiries/loading.tsx`
> - `app/(workspace)/[tenantSlug]/client/bookings/loading.tsx`
> - `app/(workspace)/[tenantSlug]/talent/inbox/loading.tsx`
> - …and matching others
>
> Output: commits per surface bundle.

---

### C.5 — `ServerActionResult` shape audit

(Already covered by A.4 — verification only.)

| | |
|---|---|
| **Agent** | sonnet |
| **Effort** | 4h |
| **Dep** | A.4 done |
| **Mode** | foreground |

**Prompt:**
> Verify A.4 sweep was complete. Grep for any remaining non-conforming server action shapes. Fix any stragglers. Add a TypeScript type test to `web/src/lib/server-actions/result.test.ts` that exercises the discriminator.

---

### C.6 — i18n wrap sweep

| | |
|---|---|
| **Agent** | sonnet |
| **Effort** | 1 day |
| **Dep** | C.1 |
| **Mode** | foreground |

**Prompt:**
> Sweep `web/src` for English literals in user-visible JSX or toast/banner copy. Wrap each with the i18n `t()` pattern. Add new copy keys to the locale files.
>
> Categories to focus on: server action error messages, alert/banner text, toast messages, inline form errors.
>
> Output: per-file commits + push. CI lint should warn on remaining English literals >3 words.

---

### C.7 — Save-state visibility (`SaveStateIndicator`)

| | |
|---|---|
| **Agent** | sonnet |
| **Effort** | 1 day |
| **Dep** | none |
| **Mode** | parallel |

**Prompt:**
> Create `<SaveStateIndicator state="idle"|"saving"|"saved"|"error" />` component. Wire into every drawer footer and form. State transitions: idle → saving → saved (auto-back to idle after 2s) | error.
>
> Replace the "toast and close" pattern in drawers (`drawers.tsx:1308, 1461, 1789`, etc.) with: trigger save → indicator shows saving → indicator shows saved → drawer closes after a 600ms delay so user sees the success state.
>
> Output: commit + push.

---

## Phase D — Mobile + accessibility *(3-5 days)*

### D.1 — Viewport metadata fix

| Agent | sonnet | Effort | 30min | Dep | none | Mode | parallel |
|---|---|---|---|---|---|---|---|

**Prompt:**
> Update `web/src/app/layout.tsx` viewport export to:
> ```ts
> export const viewport: Viewport = {
>   width: 'device-width',
>   initialScale: 1,
>   viewportFit: 'cover',
>   minimumScale: 1,
>   maximumScale: 5,
>   themeColor: '#0B0B0D',
> };
> ```
> Commit + push.

---

### D.2 — OG-image fallback per agency

| Agent | sonnet | Effort | 1d | Dep | none | Mode | parallel |
|---|---|---|---|---|---|---|---|

**Prompt:**
> Create `web/src/app/api/og/agency/[tenantSlug]/route.tsx` using Vercel's `ImageResponse` API. Generate a 1200×630 OG image with: agency name, talent count, primary brand color, "Discover N Models on {{agency}}" copy.
>
> Wire into `web/src/app/page.tsx` metadata as the fallback when `homepage?.ogImageUrl` is unset.

---

### D.3 — Mobile occlusion sweep

| Agent | sonnet | Effort | 1d | Dep | none | Mode | foreground |
|---|---|---|---|---|---|---|---|

**Prompt:**
> Audit sticky bars, composers, cookie banners across client/talent surfaces for mobile occlusion. Specific known issues:
> - `today/page.tsx:320-373` sticky action bar
> - Cookie banner blocks bottom CTAs on client mobile (user-audit finding)
> - Client mobile nav overflows horizontally
>
> Fix patterns: hide sticky UI <640px or add `padding-bottom: 80px` to scroll containers; make cookie banner dismissible and non-blocking.
>
> Test on 375px viewport. Output: commit + push.

---

### D.4 — Touch target audit

| Agent | sonnet | Effort | 4h | Dep | none | Mode | parallel |
|---|---|---|---|---|---|---|---|

**Prompt:**
> Sweep all icon-only buttons in client/talent surfaces. Min touch target = 44×44px. Add transparent padding via CSS where needed without changing visual size.
>
> Lighthouse mobile usability should hit ≥ 95 on 5 sample pages.

---

### D.5 — Focus management on drawer open

| Agent | sonnet | Effort | 1d | Dep | none | Mode | parallel |
|---|---|---|---|---|---|---|---|

**Prompt:**
> Audit `DrawerShell` (primitive). On open: focus first interactive element (input or close button). Trap focus inside. On close: restore focus to the trigger element.
>
> Use `react-focus-lock` or hand-roll. Test keyboard-only flow: tab to a drawer trigger → enter → tab through drawer → escape → focus returns.

---

### D.6 — Color-contrast lint

| Agent | sonnet | Effort | 4h | Dep | none | Mode | parallel |
|---|---|---|---|---|---|---|---|

**Prompt:**
> Extract `statusTone()` helpers (duplicated in `inquiries/page.tsx:35-51`, `today/page.tsx`) into `web/src/lib/ui/status-tones.ts`. Add WCAG AA contrast validation (3.0:1 for >18px text, 4.5:1 for body) for every defined tone-pair.
>
> Add a unit test asserting all tone pairs pass AA.

---

### D.7 — ARIA labels sweep

| Agent | sonnet | Effort | 4h | Dep | none | Mode | parallel |
|---|---|---|---|---|---|---|---|

**Prompt:**
> Sweep icon-only buttons for missing `aria-label`. Particular focus: composers (send, attach, mention), inbox row actions (pin, archive, unread toggle), drawer close buttons.
>
> Output: commit + push.

---

## Phase E — Trust signals & first impressions *(3-5 days)*

### E.1 — Branded 5xx page on storefronts

| Agent | sonnet | Effort | 4h | Dep | none | Mode | parallel |
|---|---|---|---|---|---|---|---|

**Prompt:**
> Make `web/src/app/error.tsx` route-aware: when on a storefront host (`hostContext.kind === "agency"`), render storefront-branded fallback. Otherwise render app-branded fallback.

---

### E.2 — Branded 404 for storefront paths

| Agent | sonnet | Effort | 2h | Dep | E.1 | Mode | parallel |
|---|---|---|---|---|---|---|---|

**Prompt:**
> Replace any plain-text 404 responses in `web/src/proxy.ts` (line 296-299) with rewrites to a branded `not-found.tsx`. Storefront hosts show storefront-branded 404; app hosts show app-branded.

---

### E.3 — Login UX upgrade

| Agent | sonnet | Effort | 1d | Dep | none | Mode | parallel |
|---|---|---|---|---|---|---|---|

**Prompt:**
> `web/src/app/(auth)/login/login-form.tsx`:
> 1. Add "Keep me signed in" checkbox → sets 30d cookie TTL.
> 2. Verify "Forgot password" link exists and works.
> 3. Improve error messages: "Invalid email or password" not "Auth failed".
> 4. Add subtle loading state on submit.
> 5. If OAuth is configured anywhere, surface it; otherwise skip.

---

### E.4 — Guest-inquiry confirmation page

| Agent | sonnet | Effort | 1d | Dep | none | Mode | parallel |
|---|---|---|---|---|---|---|---|

**Prompt:**
> Currently `web/src/app/(public)/directory/cart/page.tsx:13-32` strips the success URL params after sheet modal renders, leaving no persistent confirmation.
>
> Create `web/src/app/(public)/inquiry-sent/page.tsx` — a real success page. On guest submit, redirect to `/inquiry-sent?email=...&agency=...&id=...`. Page shows:
> 1. "✓ Your inquiry has been sent to {{agency}}"
> 2. "We sent a confirmation to {{email}}"
> 3. Persistent CTA: "Create account to track replies" → `/register?email={{email}}&inquiry={{id}}`

---

### E.5 — Talent claim flow context propagation

| Agent | sonnet | Effort | 1d | Dep | none | Mode | parallel |
|---|---|---|---|---|---|---|---|

**Prompt:**
> When a talent receives a claim invite email, the link should carry tenant context all the way through login → claim page. Audit the invite email template; ensure links look like `/login?next=%2F[tenantSlug]%2Ftalent%2Fclaim%3Ftoken%3D...`.
>
> After login, talent should land on `/[tenantSlug]/talent/claim` (create if missing) which validates the token and provisions the claim.

---

### E.6 — Onboarding role-select cards

| Agent | sonnet | Effort | 4h | Dep | none | Mode | parallel |
|---|---|---|---|---|---|---|---|

**Prompt:**
> `web/src/app/onboarding/role/page.tsx` (or equivalent). Replace bare radio/select with two cards:
> - **Talent**: "Claim your profile · manage bookings · reply to inquiries"
> - **Client/Agency**: "Build a roster · send inquiries · coordinate bookings"
>
> Each card has an icon and is clickable.

---

### E.7 — Onboarding form state preservation

| Agent | sonnet | Effort | 4h | Dep | none | Mode | parallel |
|---|---|---|---|---|---|---|---|

**Prompt:**
> Client-side: save onboarding form data to `localStorage["onboarding.draft.<step>"]` on every change. On validation error, restore. On successful submit, clear.
>
> Apply to: talent-location, talent-identity, role-select.

---

### E.8 — Powered-by-Tulala footer

| Agent | sonnet | Effort | 2h | Dep | none | Mode | parallel |
|---|---|---|---|---|---|---|---|

**Prompt:**
> Add a small footer badge on storefronts: "Powered by Tulala" with link to `https://tulala.digital`. Toggleable per agency via a settings flag (`agency_settings.show_powered_by_badge default true`).
>
> Position: bottom of storefront, subtle (12px text, muted color).

---

## Phase F — Behind-the-toast features *(3 weeks, scoped per feature)*

Each feature is a self-contained mini-project. Dispatch them sequentially or in parallel based on developer bandwidth. Each gets its own dedicated session.

| # | Feature | Agent | Effort | Dep | Notes |
|---|---|---|---|---|---|
| F.1 | Team invite | opus | 3d | A done | Email infra check, role assignment, accept flow |
| F.2 | Resend claim invite | sonnet | 1d | none | Reuses `sendTalentInvitedNotification` |
| F.3 | Add alternate domain | opus | 5d | A done | DNS verification + Vercel alias automation |
| F.4 | Payment method editor | opus | 5d | A done | Stripe Connect; needs API keys provisioned |
| F.5 | Wire deposit / bank link | opus | 5d | F.4 | Plaid/TrueLayer |
| F.6 | Cancel sub / downgrade | opus | 3d | F.4 | Stripe state machine + win-back |
| F.7 | Talent take-over | sonnet | 2d | A done | Workflow status transition |
| F.8 | Reject-all profile changes | sonnet | 2d | A done | Persist event + email notify |
| F.9 | Brief saved (pre-fill) | sonnet | 1d | B.9 | LocalStorage + URL hydration |
| F.10 | Schedule saved | sonnet | 2d | B.3 | Availability persistence |
| F.11 | Privacy settings save | sonnet | 1d | A.4 | `user_prefs` extension |
| F.12 | Notification prefs save | sonnet | 1d | B.2 | Channels × event types matrix |
| F.13 | Migration queued | opus | 3d | B.2 | Background job runner |
| F.14 | Plan compare drawer | sonnet | 1d | none | Static content + tier matrix |
| F.15 | Mark-all-read | sonnet | 4h | B.2 | RPC call on the new notifications table |

Each agent prompt should be a self-contained "build this feature including server action, schema if needed, UI wiring, tests, live verify."

---

## Phase G — Polish & optimistic UX *(2-3 days)*

| # | Task | Agent | Effort |
|---|---|---|---|
| G.1 | Apply `useOptimisticMutation` to pin/mark-read/reorder/toggle | sonnet | 1d |
| G.2 | Personalize empty states with user name + agency | sonnet | 4h |
| G.3 | Message edit/delete (30s window) | sonnet | 1d |
| G.4 | Add-to-calendar on confirmed bookings | sonnet | 4h |
| G.5 | Real-time relative dates (`useEffect` interval) | sonnet | 2h |
| G.6 | Hover-action consistency on inbox rows | sonnet | 2h |
| G.7 | Read receipts ("Seen at HH:MM") | sonnet | 4h |
| G.8 | Unsaved-changes warning on Settings nav-away | sonnet | 2h |
| G.9 | Admin message timestamps friendly format | sonnet | 1h |
| G.10 | Disabled-CTA inline reasons (tooltip) | sonnet | 4h |
| G.11 | Mobile cookie banner non-blocking + nav overflow fix | sonnet | 4h |
| G.12 | Talent status chip surfaced everywhere | sonnet | 4h |

All Phase G tasks can run in parallel; none have hard dependencies on each other.

---

## Parallelization opportunities

Many tasks are independent and can run as parallel batches (multiple agents in a single dispatch).

**High-leverage parallel batches:**

- **Batch P-A** (Phase A, ~6h elapsed): A.1 + A.2 + A.5 + A.7 (sonnet × 4 in parallel)
- **Batch P-B-trust** (Phase B trust work): B.4 + B.5 + B.7 + B.10 (sonnet × 4 in parallel)
- **Batch P-D-mobile** (Phase D quick fixes): D.1 + D.2 + D.4 + D.6 + D.7 (sonnet × 5 in parallel)
- **Batch P-E-trust** (Phase E first impressions): E.1 + E.2 + E.3 + E.6 + E.8 (sonnet × 5 in parallel)
- **Batch P-G** (Phase G polish): all G.* (sonnet × 12 in parallel — pick 5 at a time)

**Cannot parallelize:**
- Phase 0 must complete before A (verification dependency)
- A.3 (`guardedQuery`) and A.4 (`ServerActionResult`) modify many of the same files — sequential
- B.2 (notifications backend) and F.15 / F.12 / B.6 depend on B.2 — sequential
- C.1 (error copy) before C.6 (i18n sweep)

---

## How to dispatch (cheat sheet)

**Single task:**
> "Dispatch a `general-purpose` agent with model `sonnet` to execute task 0.4 from `docs/plans/premium-execution-runbook-2026-05-12.md`. Pass the prompt verbatim."

**Parallel batch:**
> "Dispatch 4 `general-purpose` `sonnet` agents in parallel for batch P-A: tasks A.1, A.2, A.5, A.7 from the runbook."

**Architecture-first:**
> "First dispatch a `Plan` agent for B.2 step 1 (design). On return, dispatch an `opus` `general-purpose` agent for step 2 (implementation)."

**Investigation-first:**
> "Dispatch an `Explore` agent to verify task 0.2 before proceeding."

**Background:**
> "Dispatch task F.3 in background mode (use `run_in_background: true`). I'll continue with task F.7 in foreground."

---

## Verification stack per agent

Every agent must, before reporting done:
1. Run `npx tsc --noEmit` (clean)
2. Run `npm run lint` (clean)
3. Run `rm -f .next/dev/types/routes.d.ts` if TS errors mention it
4. Make a single focused commit with `<finding-id>` in the message
5. Reference this runbook by filename + section in the PR/commit
6. State live-verification result (curl/browser test) in the response

Failures must report:
1. What was attempted
2. Why it didn't work
3. Suggested next step

---

## Total dispatch count estimate

| Phase | Tasks | Sonnet | Opus | Plan | Explore |
|---|---|---|---|---|---|
| 0 | 7 | 5 | 2 | 0 | 0 |
| A | 7 | 5 | 2 | 0 | 0 |
| B | 10 | 8 | 2 | 2 | 0 |
| C | 7 | 6 | 1 | 0 | 0 |
| D | 7 | 7 | 0 | 0 | 0 |
| E | 8 | 8 | 0 | 0 | 0 |
| F | 15 | 8 | 7 | 0 | 0 |
| G | 12 | 12 | 0 | 0 | 0 |
| **Total** | **73** | **59** | **14** | **2** | **0** |

Plus ~3-5 ad-hoc `Explore` dispatches for unknown surfaces encountered along the way.

Estimated total agent-hours: ~250h (sonnet) + ~80h (opus) + ~10h (plan) = **~340 agent-hours**. At parallelism factor ~3 (running 3 agents at peak), that compresses to **~120 wall-clock hours** = ~3 dev-weeks of active dispatch + 1 week of human integration/QA.
