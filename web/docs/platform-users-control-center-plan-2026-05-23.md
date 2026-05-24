# Platform Users → Customer-Service Control Center

**Status:** BINDING execution plan · ratified 2026-05-23
**Scope owner:** integrator chat (Opus 4.7)
**Living doc:** update this file as slices land — strike out completed rows, add post-merge notes inline.

---

## 0 · Mission

Turn `/platform/admin/users` into the single CS/Ops console where any support agent can find any person on Tulala (claimed account or unclaimed talent), see everything about them in one drawer, and take action — account state, billing, visibility, talent record, audit trail — without leaving the page.

### Decisions (ratified by Oran 2026-05-23)
1. **Page name stays `Users`.** URL `/platform/admin/users`. Internal data model uses the federated row set but the surface name does not change.
2. **"Site" = any Tulala tenant** — Free / Studio / Agency / Hub. Per-site visibility writes one row per tenant the talent appears on. Custom domains are not a separate axis.
3. **Stripe is read + deep-link only.** No cancel / refund / sub-modify inside Tulala. "Manage in Stripe" buttons open Stripe Dashboard.
4. **`is_test_account` flag = analytics filter only.** Counts on Today / dashboards / "needs me" exclude test accounts. Login, billing, and the user list still show them.
5. **Audit log retention = forever** (until GDPR delete cascades it).

---

## 1 · Data-model shift up front

Today: "Users" = humans in `profiles` (15 rows).
After Wave 2: "Users" = `profiles` ∪ `talent_profiles WHERE user_id IS NULL` (15 humans + 76 unclaimed talents ≈ 91 rows), deduplicated on the claim link (`talent_profiles.user_id`).

A claimed talent appears **once** as a human row with `talentProfileId` populated — never twice.

---

## 2 · Phase 0 — Schema foundation (gates everything)

Five migrations. None of the UI work ships until these are applied to remote Supabase. Each independently `db:push`-able. Use the `web/scripts/apply-migration.mjs --apply-pending` fallback if the standard push hits the SASL auth error.

| # | Migration | Purpose | Owner skill |
|---|---|---|---|
| ~~**M0.1**~~ | ~~`platform_audit_log` table~~ | ~~Every admin action against a person logs here: `(actor_user_id, target_kind, target_id, action, before_jsonb, after_jsonb, created_at, context_jsonb)`. RLS: read = super_admin, insert = service role only.~~ | ~~Senior~~ | merged `083566453` → PR #13 `c6180f665` |
| ~~**M0.2**~~ | ~~`user_visibility_overrides` table~~ | ~~`(target_kind enum('talent_profile'), target_id uuid, tenant_id uuid, hidden_by_user_id uuid, hidden_at timestamptz, reason text)`. Unique on (target_id, tenant_id). RLS: read/write super_admin.~~ | ~~Mid~~ | merged `36e31f243` → PR #14 `72f3a489c` |
| ~~**M0.3**~~ | ~~`talent_profiles.published_globally` boolean (+ `hidden_at`, `hidden_by_user_id`)~~ | ~~Audit existing publish-state columns; collapse to one canonical column. Backfill from whatever is currently authoritative (likely `status`).~~ | ~~Mid~~ | merged `55c54ffe7` → PR #15 `998c17c41` |
| **M0.4** | `user_origin_event` — denorm columns on `talent_profiles` (or view) | Resolves `origin_kind` (`agency_signup` / `studio_signup` / `platform_admin_signup` / `self_signup` / `claim_invite`), `origin_workspace_id`, `origin_created_by_user_id`. Use existing `created_by_user_id_provenance` as starting point. Same shape for `profiles` (self_signup vs platform_admin_signup vs claim_invite). | Senior |
| ~~**M0.5**~~ | ~~`user_admin_notes` table~~ | ~~`(target_user_id, target_talent_profile_id, body text, author_user_id, created_at)`. RLS super_admin only.~~ | ~~Junior~~ | merged `b3711cd92` → PR #16 `bf7b2177e` |

**Plus one schema task that is not a migration:** ~~add `is_test_account boolean DEFAULT false` to `profiles` AND `talent_profiles`. Counts as M0.6, junior.~~ **DONE** merged `80e3b6138` → PR #17 `391165d1d`

**Gate:** all 6 applied to remote; `npm run db:check` clean; `npm run deploy:smoke` passes after first deploy that touches them.

---

## 3 · Phase A — Federated data layer

Refactor [`web/src/app/(workspace)/platform/platform-data.ts`](web/src/app/(workspace)/platform/platform-data.ts).

### A.1 · `PlatformUserRow` becomes federated
- Discriminated union: `kind: "human" | "unclaimed_talent"`.
- Human rows keep current fields + `talentProfileId | null` (set when claimed).
- Unclaimed-talent rows get: `email = null`, `emailConfirmed = null`, but DO get `memberships` from roster appearances (`agency_talent_roster`).

### A.2 · Origin resolver
Resolves `origin: { kind, createdByUserId, createdByDisplayName, workspaceId, workspaceName, createdAt }`.

- **`agency_signup`** — creator is owner/admin of a workspace with `plan_tier ∈ {agency, network}`.
- **`studio_signup`** — same but `plan_tier = studio`.
- **`platform_admin_signup`** — creator is super_admin / agency_staff with no workspace context, OR talent has no `created_by_user_id_provenance` but exists on platform.
- **`self_signup`** — human created their own account (no creator).
- **`claim_invite`** — human row whose `talent_profiles.user_id` was set after creation.

### A.3 · `loadPlatformUsers` → `loadPlatformPeopleFederated`
- Keep `loadPlatformUsers` as a thin alias for one PR cycle; delete in B.1.
- Drop `primaryTenant` (already done in shipped PR #12).

**Gate for Phase B:** federated loader returns 91 rows for current data; no duplicates; existing Users page still renders unchanged shape (humans only) while feature is behind a flag, or directly upgraded if integrator decides.

---

## 4 · Phase B — Table surface upgrade

### B.1 — Columns

| Column | Source | Notes |
|---|---|---|
| Name | both | unchanged |
| Email | human; unclaimed shows "—" + tiny "no login" hint | |
| **Status** | derived | Chip set: `Claimed` / `Unclaimed · Agency` / `Unclaimed · Studio` / `Unclaimed · Platform` / `Suspended` / `Test` |
| Type | identity | unchanged |
| **Plan** | NEW | Compact chip stack: talent tier (Basic/Pro/Portfolio) when talent; workspace tier roll-up when operator; trust tier when client. Three orthogonal chips, one column. |
| Workspaces | unchanged | |
| Sites | unchanged | |
| **Last seen** | NEW | `auth.users.last_sign_in_at`; unclaimed shows "—" |
| Joined | unchanged | |

### B.2 — Filters
- **Status**: Any · Claimed · Unclaimed · Suspended · Test
- **Origin**: Any · Agency · Studio · Platform · Self · Claim invite
- **Plan tier**: Any · Free/Basic · Pro · Portfolio (extend later for workspace/client tiers)
- **Has Stripe**: Any · Connected · Not connected
- Existing Type / Workspace power / Email filters stay

### B.3 — Quick-action chips
Six pre-canned filter combos as one-tap chips above filters: `Unclaimed talents` · `Suspended` · `Unconfirmed email` · `Test accounts` · `Workspace operators` · `Stripe connected`.

---

## 5 · Phase C — Drawer expansion

Drawer = nine sections, collapsible. First-paint shows C.1–C.3 expanded, rest collapsed.

### C.1 — Identity & access
Current section, plus: **last seen** + **last IP** + **device** + **sign-in count this month**.

### C.2 — Origin & provenance (NEW)
- Origin chip
- **Created by:** clickable → opens that user's drawer (drawer stack)
- **In workspace:** clickable → opens tenant drawer
- **Via flow:** human-readable label
- **Created at:** absolute + relative

### C.3 — Talent record (only if talent / claimed)
- Link to public profile `/t/<slug>`
- Profile completeness %
- **Claim status** chip; "Send claim invite" button if unclaimed with email
- **Hide globally** toggle → writes `talent_profiles.published_globally`
- **Per-site visibility list** — every tenant this talent appears on (rosters + memberships), each with Visible/Hidden toggle → writes `user_visibility_overrides`

### C.4 — Billing & subscription (NEW)
- Current plan chips (one per ladder applicable)
- Stripe customer ID + connect-account ID (mono, click-to-copy)
- Next renewal + amount
- **Past due?** red flag
- **Manage in Stripe** deep-link (customer page)
- **Apply plan override** — extend existing tenant `plan_overrides` system to key on `profile_id`
- Last 5 invoices: date · amount · status (read-only)

### C.5 — Workspaces & hubs
Each membership row gains `⋯` menu:
- Change role (dropdown)
- Remove from workspace (confirm)
- View workspace admin
- Open inquiry/booking history filtered to this workspace

### C.6 — Activity & support context (NEW)
- Inquiries count + deep-link
- Bookings count + deep-link
- Outstanding workspace invites
- Files uploaded count
- Last 5 inquiries mini-list

### C.7 — Admin notes (NEW)
Threaded notes on the user. Each note: author + timestamp + body. Add note inline.

### C.8 — Admin actions
See Phase E.

### C.9 — Audit log
Reverse-chrono list of admin actions on this person. Filter by action type. Click row → before/after JSON modal.

---

## 6 · Phase D — Billing integration (read + deep-link)

### D.1 — Read-only snapshot
`loadBillingSnapshot(personId)` pulls from Stripe + existing subscription rows. Mounts in C.4 as info only.

### D.2 — Plan-override extension
Extend `plan_overrides` to optionally key on `profile_id` for talent-tier overrides. Reuse timed-override UI from tenant drawer.

### D.3 — Stripe deep-links
"Manage in Stripe" → `https://dashboard.stripe.com/.../customers/<cust_id>`. One-liner per surface.

**Hard scope guard:** no write paths to Stripe inside Tulala. Cancel / refund / sub-modify all live in the Stripe Dashboard.

---

## 7 · Phase E — Admin actions (write paths)

Each action = one server action in `actions.ts`. All gated on `requirePlatformAdmin()`. All write to `platform_audit_log` on success.

| Action | Tier | Confirm? | Audit `action` |
|---|---|---|---|
| Confirm email | 1 | no | `email_confirmed_by_admin` |
| Resend confirmation | 1 | no | `confirmation_resent` |
| Send password reset | 1 | no | `pwd_reset_sent` |
| Set temp password | 1 | typed-name | `pwd_set_by_admin` |
| Force sign-out everywhere | 1 | no | `sessions_invalidated` |
| Support mode (open as user) | 1 | no | `support_mode_opened` |
| Send claim invite | 1 | no | `claim_invite_sent` |
| Suspend | 2 | confirm | `account_suspended` |
| Hide talent globally | 2 | confirm | `talent_hidden_globally` |
| Hide on site X | 2 | confirm | `talent_hidden_on_site` |
| Mark as test | 2 | confirm | `marked_test` |
| Remove from workspace | 2 | confirm | `removed_from_workspace` |
| Change workspace role | 2 | confirm | `workspace_role_changed` |
| Apply plan override | 2 | confirm | `plan_override_applied` |
| Delete account | 3 | typed-name | `account_deleted` |
| GDPR anonymize | 3 | typed-name | `account_anonymized` |
| Un-claim talent profile | 3 | confirm | `talent_unclaimed` |

---

## 8 · Phase F — Audit log viewer
Per-person section already in C.9. **Plus** a platform-wide page `/platform/admin/audit-log` with filters by actor / target / action / date range. Read-side of M0.1.

---

## 9 · Phase G — QA + docs

- E2E smoke for federated loader (count = 91, no dupes, claimed talents resolve to one row).
- Update `/platform/admin/today` counts (test accounts excluded).
- Update `CLAUDE.md` + memory: "Users page = humans only" rule retired.
- Update `web/README.md` super-admin section.
- Write a new `web/docs/admin-cs-runbook.md` — opinionated CS playbook: how to find an unclaimed talent, how to reset a forgotten password, how to handle a duplicate-account report, etc.

---

## 10 · Agent-assignment matrix

Per the integrator protocol (memory `project_multi_agent_integrator_protocol.md` — proven at ~200 commits / ~16 parallel lanes / 0 force-pushes): one integrator chat enforces FF-only merges; each lane runs in its own worktree on its own branch off `main`.

**Skill tiers:** Senior = Opus 4.7 · Mid = Sonnet 4.6 · Junior = Haiku 4.5.

**Effort key:** XS <1h · S 1–3h · M 3–8h · L 1–2d.

| Slice | Touches | Skill | Model | Effort | Depends on |
|---|---|---|---|---|---|
| **Integrator** | Plan ownership, lane dispatch, PR review, FF merges, gate enforcement | Senior | Opus 4.7 | continuous | — |
| ~~M0.1 platform_audit_log~~ | ~~Migration + RLS + helper fn~~ | ~~Senior~~ | ~~Opus 4.7~~ | ~~S~~ | ~~—~~ | **DONE** `083566453` |
| ~~M0.2 user_visibility_overrides~~ | ~~Migration + RLS~~ | ~~Mid~~ | ~~Sonnet 4.6~~ | ~~S~~ | ~~—~~ | **DONE** `36e31f243` |
| ~~M0.3 talent_profiles published_globally~~ | ~~Migration + backfill~~ | ~~Mid~~ | ~~Sonnet 4.6~~ | ~~XS~~ | ~~—~~ | **DONE** `55c54ffe7` |
| ~~M0.4 user origin denorm~~ | ~~Resolver fn + columns/view~~ | ~~Senior~~ | ~~Opus 4.7~~ | ~~M~~ | ~~M0.3~~ | **DONE** `f418808d7` PR #18 `485f9080a` |
| ~~M0.5 user_admin_notes~~ | ~~Migration + RLS~~ | ~~Junior~~ | ~~Haiku 4.5~~ | ~~XS~~ | ~~—~~ | **DONE** `b3711cd92` |
| ~~M0.6 is_test_account flag~~ | ~~Migration on 2 tables~~ | ~~Junior~~ | ~~Haiku 4.5~~ | ~~XS~~ | ~~—~~ | **DONE** `80e3b6138` |
| ~~A.1+A.2+A.3 federated loader~~ | ~~Core data layer refactor, dedup logic, origin resolver~~ | ~~Senior~~ | ~~Opus 4.7~~ | ~~L~~ | ~~M0.4~~ | **DONE** `b0d19bb55` PR #19 `3b643f991` |
| ~~B.1 new columns~~ | ~~Table render~~ | ~~Junior~~ | ~~Haiku 4.5~~ | ~~S~~ | ~~A.1~~ | **DONE** `28422e6cc` PR #20 |
| ~~B.2 new filters~~ | ~~Client component logic~~ | ~~Mid~~ | ~~Sonnet 4.6~~ | ~~S~~ | ~~A.1~~ | **DONE** `a50fa6a50` PR #21 |
| B.3 quick-action chips | UI sugar | Junior | Haiku 4.5 | XS | B.2 | in progress |
| ~~C.1 identity & access~~ | ~~Drawer render~~ | ~~Junior~~ | ~~Haiku 4.5~~ | ~~S~~ | ~~A.1~~ | **DONE** `831767d48` PR #22 |
| ~~C.2 origin section~~ | ~~Drawer section + clickable links~~ | ~~Junior~~ | ~~Haiku 4.5~~ | ~~S~~ | ~~A.1~~ | **DONE** `63fc5aa63` PR #23 |
| C.3 talent record + global-hide | Drawer + write action | Mid | Sonnet 4.6 | M | M0.3, E.tier1, E.tier2 |
| C.4 billing surface | Stripe read + plan override extension | Senior | Opus 4.7 | L | D.1, D.2 |
| C.5 workspaces remove/role | Drawer + 2 write actions | Mid | Sonnet 4.6 | M | E.tier2 |
| ~~C.6 activity context~~ | ~~Read-only joins~~ | ~~Junior~~ | ~~Haiku 4.5~~ | ~~M~~ | ~~—~~ | **DONE** `16082ece4` PR #24 |
| C.7 admin notes | CRUD on user_admin_notes | Junior | Haiku 4.5 | S | M0.5 |
| C.8 action panel UI | Wire E actions to buttons + confirm modals | Mid | Sonnet 4.6 | M | E (all tiers) |
| C.9 per-person audit view | Read-only render | Junior | Haiku 4.5 | S | M0.1, E |
| D.1 billing read snapshot | Stripe SDK + subscription joins | Senior | Opus 4.7 | M | — |
| D.2 plan-override extension | Reuse tenant override system | Mid | Sonnet 4.6 | M | D.1 |
| D.3 Stripe deep-links | One-liner | Junior | Haiku 4.5 | XS | D.1 |
| E.tier1 safe actions | 7 server actions | Mid | Sonnet 4.6 | M | M0.1 |
| E.tier2 reversible actions | 7 server actions + status writes | Mid | Sonnet 4.6 | M | M0.1, M0.2, M0.6 |
| E.tier3 destructive actions | 3 server actions, cascade-aware, typed-name confirm | Senior | Opus 4.7 | M | M0.1 |
| F audit-log page | Standalone page | Junior | Haiku 4.5 | S | M0.1 |
| G.1 federated-loader smoke test | Jest/Vitest | Mid | Sonnet 4.6 | S | A.1 |
| G.2 today-page test-account exclusion | Tweak counts | Junior | Haiku 4.5 | XS | M0.6 |
| G.3 docs (CLAUDE.md, README, runbook) | Prose | Junior | Haiku 4.5 | S | all above |

---

## 11 · Wave order

**Wave 1 — schema foundation** (~4 parallel agents, ½ day)
M0.1 · M0.2 · M0.3 · M0.5 · M0.6 in parallel. M0.4 fires the moment M0.3 lands.

**Wave 2 — federated data layer** (~1 senior, ~1 day)
A.1+A.2+A.3 as a single tightly-scoped slice (one senior agent — splitting it across lanes invites integration headaches).

**Wave 3 — table surface + drawer skeleton** (~5 parallel, ½ day)
B.1 · B.2 · B.3 · C.1 · C.2 · C.6 in parallel.

**Wave 4 — admin actions backbone** (~3 parallel, 1 day)
E.tier1 + E.tier2 + E.tier3 in parallel. Plus C.7 (notes) + F (audit log page) once M0.1 done.

**Wave 5 — drawer feature sections** (~4 parallel, 1 day)
C.3 (hide globally + per-site) + C.5 (workspace role/remove) + C.8 (action panel UI) + C.9 (per-person audit). All gated on Wave 4.

**Wave 6 — billing** (~2 agents, 1 day)
D.1 → D.2, D.3, then C.4. Senior+mid pair.

**Wave 7 — QA + docs** (~2 agents, ½ day)
G.1 + G.2 + G.3.

**Realistic calendar with 4–5 agents in parallel + the integrator chat: 5–7 working days.**

---

## 12 · Hard rules (apply to every lane)

These are non-negotiable. Lane agents that violate any of these get their PR rejected; integrator does not FF until fixed.

1. **Branch off the latest `main`.** `git fetch origin && git switch -c <type>/<slice-name> origin/main`. Never commit directly to `main`.
2. **Own a worktree.** Never `git switch` in the shared `impronta-app` checkout — see memory `feedback_worktree_not_git_switch`.
3. **One migration per agent.** Use `date -u +%Y%m%d%H%M%S` at slice start. If `db push` errors on a collision, use park-restore pattern per memory `project_multi_agent_integrator_protocol`.
4. **TS + lint gate before every commit.** `cd web && npx tsc --noEmit && npm run lint`. Zero new errors, zero new warnings.
5. **`npm run db:push` is part of the commit, not optional.** If standard push fails with SASL auth, fall back to `web/scripts/apply-migration.mjs --apply-pending` (memory `project_supabase_push_protocol`).
6. **Every write action writes to `platform_audit_log`.** No exceptions for "small" actions.
7. **Tier 3 actions require a typed-name confirmation modal.** Not a yes/no — the user must type the target's display name.
8. **Never force-push `main`.** Ever.
9. **Run `npm run deploy:smoke` after every production deploy.** Per CLAUDE.md.
10. **Update this file** with a strike-through on the row you completed + commit SHA, before closing your PR.

---

## 13 · Open decisions deferred to mid-flight

These don't gate kickoff but the integrator must resolve them by Wave 4.

- **Support-mode mechanism for unclaimed talents.** "Open as user" works for humans (impersonate session). What does it do for an unclaimed talent? Probably opens their public profile + roster context. Decide before E.tier1.
- **GDPR anonymize cascade.** Does it null PII on inquiries/bookings/messages too, or only on profiles? Probably bound by client commitments. Decide before E.tier3.
- **Audit-log volume.** If we ship loud (every read = no, every write = yes), table grows ~100 rows/day at current scale. Forever-retention is fine for years.
