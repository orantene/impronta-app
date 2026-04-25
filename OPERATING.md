# OPERATING — Tulala (SaaS) / Impronta (first tenant)

The operating contract for this repo. Every contributor — human or agent — reads this before changing anything. If a rule isn't here, it doesn't exist.

**Status:** pre-launch. No real traffic yet. Ground rules in [`feedback_pre_launch_shipping.md`](.claude/projects/-Users-oranpersonal-Desktop-impronta-app/memory/feedback_pre_launch_shipping.md) override anything below until the user explicitly says **"we are live"**.

---

## 1. Trunk

- Trunk is `phase-1`. Every change lands here.
- `main` is retained only because Vercel's `link.productionBranch` is stuck on it (Hobby plan). Don't push to `main`. Don't merge into `main`. It is a frozen pointer.
- Feature branches only when the work is risky enough to want to throw away. Default: commit straight to `phase-1`.
- No long-lived branches. >7 days = land it or delete it.
- Linear history. Rebase or fast-forward. No merge commits to `phase-1`.
- No `--amend` of pushed commits. No `--force` to `phase-1`. No `--no-verify`.

## 2. Environments

| Env | Host | Purpose | Notes |
|---|---|---|---|
| **Local** | `localhost:3000` (dev), `app.local:3102` (host-routing) | Iterate fast | Hosted Supabase project `pluhdapdnuiulvxmyspd` (one DB, no separate dev DB) |
| **Preview** | `tulala-<hash>-oran-tenes-projects.vercel.app` | Vercel auto-build per push | SSO-gated 401. Don't visit raw — alias to staging |
| **Staging** | `staging.tulala.digital` | Click-through QA before prod | Re-aliased to whichever preview you want to QA. Seeded once in `agency_domains` |
| **Production** | `tulala.digital`, `app.tulala.digital`, `impronta.tulala.digital`, `improntamodels.com` | Live | Promoted via `vercel promote <preview-url> --yes` |

**One Supabase project.** Don't add a second DB until a paying second tenant exists.

## 3. The deploy ladder

```
local → push to phase-1 → Vercel builds preview → (optional) alias to staging.tulala.digital → vercel promote → smoke-test
```

1. **Local:** `npm run dev` (port 3000). Add `node scripts/local-host-proxy.mjs 3102 app.local` only if you're testing host routing.
2. **Pre-commit:** `npm run typecheck && npm run lint`. If you touched middleware / tenant / RLS / server-actions / AI / i18n, also `npm run ci`.
3. **Push:** to `phase-1`. Commit format `<surface>: <what>` (e.g. `admin/drawer: …`).
4. **Preview:** Vercel auto-builds. The preview URL is in the GitHub commit status.
5. **Staging (when you want to click through):** `vercel alias set <preview-url> staging.tulala.digital --scope oran-tenes-projects`. Hit `https://staging.tulala.digital/...`.
6. **Promote (pre-launch — ship straight):** `vercel promote <preview-url> --yes --scope oran-tenes-projects`. The post-deploy GitHub Action re-aliases the two ghost-locked hosts.
7. **Smoke:** `./scripts/smoke-prod.sh`. Green or roll back.

**Post-launch ("we are live"):** always alias to staging and click through 5–10 critical pages before `vercel promote`.

## 4. Content vs code — the hard line

| Lives in code (Git) | Lives in builder/DB |
|---|---|
| Section type definitions (registry) | Which sections appear on which page |
| Page templates (slot definitions) | Page title, slug, body, hero, meta |
| Theme preset palettes | Which preset a tenant uses (`agency_branding`) |
| Route structure | Navigation menu items, link order |
| Schema, RLS policies | Page content, post bodies, drafts |
| Capability rules | Which staff member has which role |
| Brand-shell strings ("Sign in") | Tenant copy ("Impronta Models Tulum") |

**Rule of thumb:** If a future tenant might want it different, it goes in the builder. If every tenant gets the same, it goes in code.

## 5. Domains / hosts

- Every host that serves traffic must exist in `public.agency_domains`. No exceptions.
- Marketing/app/staging hosts: `tenant_id = NULL`, `kind ∈ {marketing, app, hub, subdomain}`.
- Tenant subdomain/custom hosts: `tenant_id = <uuid>`, `kind ∈ {subdomain, custom}`.
- Local dev hosts (`app.local`, `marketing.local`, `impronta.local` etc.) are seeded once.
- Production hosts (`tulala.digital`, `app.tulala.digital`) are NEVER manually `vercel alias set` — they're managed by `vercel promote` + the post-deploy GitHub Action. Only `staging.tulala.digital` is yours to point.

## 6. Vercel

- Project `tulala`, team `oran-tenes-projects`, Hobby plan.
- Push to `phase-1` builds **preview**, not production. Manual `vercel promote` for prod.
- 9 production env vars set in Vercel dashboard. Updating env: dashboard → Settings → Environment Variables, then update `web/.env.example` in the same commit.
- No `vercel.json`. All config in dashboard.
- 2FA on Vercel: enable before launch.

## 7. Testing

- `npm run ci` is the only safety net pre-merge. It chains: typecheck → server-actions → i18n → inquiry-workspace → AI guardrails → tenant-isolation → UI-message → lint → build.
- Tenant-isolation tests (`test:tenant-isolation`) run on every CI invocation. **Do not disable.**
- One Playwright smoke test exists at `web/e2e/smoke.spec.ts` — login → builder → publish → share-link. Run before prod promotion when you've changed surfaces this touches.
- No automated post-deploy verification — `scripts/smoke-prod.sh` is the manual check.

## 8. Decision Log

The Decision Log at [`docs/decision-log.md`](docs/decision-log.md) is binding. L1–L40 are locked. To change a Locked decision: write the rationale in the log first, get approval, then change code. Never silently deviate.

## 9. Pre-launch removal policy

We are pre-launch. No real users, no real traffic. **Default cleanup stance: delete on replacement.** No 7-day soak windows, no 30-day verification periods, no dual-read transitions for cosmetic concerns.

The only sequencing rule: **don't remove a thing until its replacement is wired to all its callers.** Once the new code path is live and the legacy callers have migrated, the legacy code is deleted in the same PR (or the immediate follow-up). No "we'll clean it up later." No archive folders. No `*-legacy.ts` shims with TODOs.

This rule continues until the user explicitly says "we are live" (per `feedback_pre_launch_shipping.md`). At that point: standard pre-deprecation windows, dual-read for live data, redirect periods for moved URLs.

Sequenced removals (working features in tenant #1 still need to function):

| Removal | Sequenced after |
|---|---|
| Legacy `lib/saas/capabilities.ts` role-cap map | Track B.4 (callers migrated) |
| Legacy `lib/site-admin/capabilities.ts` Phase-5 map | Track B.4 |
| `lib/admin/plan-tiers.ts` (TIER_LABEL/DOT/RENEW) | Track C (UI reads `getPlanView`) |
| `components/admin/site-control-center/capability-catalog.ts` (TIER_BANDS) | Track B.5 (new shell renders plans differently) |
| `components/admin/global-upgrade-modal.tsx` PLANS+RANK | Track C |
| `(marketing)/pricing/page.tsx` TIERS array | Track C |
| `dashboardPathForRole`, `isStaffRole` from `lib/auth-flow.ts` | Track B.4 |
| `app_role = 'super_admin'` reads → `platform_role` | Track B.2 lands the column; Track B.4 migrates callers; same PR drops the fallback |
| `app_role = 'agency_staff'` enum value | Track B.4 final commit |
| `agency_entitlements` columns | Track C migration (same migration as `plan_capabilities` insert) |
| `agencies.talent_seat_limit` column | Track C migration |
| `(dashboard)/admin/*` legacy shell | Track B.5 (new shell at `(workspace)/[tenantSlug]/admin/*`) |

No dual-read window. No staging-only deletions. The migration's last step is the deletion.

## 10. Plan and access-model governance

The access model — capabilities, roles, plans, limits, status, overrides — has its own ownership rules. See [`web/src/lib/access/`](web/src/lib/access/) for the canonical module and [`docs/special-plans.md`](docs/special-plans.md) for the special-plans register.

### Source of truth (who owns what)

| Concern | Owner today | Owner post-Track-C |
|---|---|---|
| Capability registry (the keys + descriptions) | `web/src/lib/access/capabilities.ts` (TS const) | Same — code remains owner |
| Tenant role definitions + role→capability map | `web/src/lib/access/roles.ts` (TS const) | Same |
| Platform role definitions + cap map | `web/src/lib/access/platform-role.ts` + `profiles.platform_role` column (Track B.2) | Same |
| Plan catalog | TS mirror in `plan-catalog.ts` | DB table `plans` |
| Plan → capability mapping | TS mirror in `plan-capabilities.ts` (permissive Phase 1) | DB table `plan_capabilities` |
| Plan limits | TS mirror in `plan-limits.ts` | DB table `plan_limits` |
| Plan pricing | Direct fields on `plan-catalog.ts` | DB columns on `plans` |
| Status behavior matrix | `web/src/lib/access/status-rules.ts` (TS const) | Same |
| Tenant identity / domains / memberships | DB (`agencies`, `agency_domains`, `agency_memberships`) | Same |
| Capability resolver | `web/src/lib/access/has-capability.ts` (TS) | Same |
| Limit resolver | `web/src/lib/access/tenant-limit.ts` (TS) | Same |
| Landing path | `web/src/lib/access/landing-path.ts` (TS) | Same |
| Audit log | DB `platform_audit_log` | Same |
| Reserved slugs | DB `platform_reserved_slugs` + code mirror | Same |

### Plan governance — Phase 1

- **Plans are migration-only.** Editing `plans` / `plan_capabilities` / `plan_limits` (or, until Track C, the TS files in `lib/access/`) outside a committed migration / PR is a process violation. No Supabase Studio direct edits. No admin UI editing.
- **Reviewers required:** at least one engineer (or the founder solo) reviews every plan-touching PR.
- **CI guard:** `npm run check:capability-keys` validates that every capability key referenced anywhere in the access module is in the registry. Runs in `npm run ci`.
- **Pricing is data, not code.** Live in `plan-catalog.ts` until Track C, then in `plans.monthly_price_cents` / `plans.annual_price_cents`. Never hardcode `$49` / `$149` in JSX.

### Special-plan discipline (the temporary alternative to overrides)

Special plans = `is_visible=false OR is_self_serve=false`. Used today for grandfathered tenants (`legacy`) and reserved for one-off enterprise contracts (`enterprise_<slug>`). Until the override-tables trigger fires (architecture brief §override governance), special plans are the only sanctioned way to give a tenant non-default terms.

- **Naming:** `<base>_<descriptor>` (lowercase, snake_case, ≤32 chars). Patterns: `legacy`, `enterprise_<slug>`, `<base>_<year><quarter>`, `<base>_<reason>_<year>`. **Disallowed:** `customplan1`, `acme`, `temp`, `test`.
- **Required fields:** `is_visible=false`, `is_self_serve=false`, full `display_name` including the customer/contract, full `description` explaining who/why/what differs/when retire.
- **Required register:** every special plan adds a row to [`docs/special-plans.md`](docs/special-plans.md) in the same PR. CI script `check:special-plans-doc` (post Track C) asserts every special plan in the DB has a doc row.
- **Anti-mess thresholds:** when active special plans ≥ 5, near-duplicate pairs ≥ 3, OR tenants on special plans ≥ 10, the override-tables build is triggered. New special-plan PRs blocked past those thresholds until either (a) an existing special plan is retired or (b) override-tables work is scheduled.
- **Quarterly review** is post-launch. Pre-launch (one engineer, one tenant), the threshold trigger is sufficient — no scheduled reviews.

### Access resolution contract

`web/src/lib/access/has-capability.ts` is the only entry point for "can this user do X on tenant Y?". 10-step contract:

1. Resolve tenant
2. Check tenant servability (status)
3. Resolve user
4. Platform role bypass (super_admin, audited)
5. Active membership
6. Role grants capability
7. Plan grants capability *(Phase 1: feature-flagged off until Track C; current behavior preserved)*
8. Limit headroom *(caller invokes `assertWithinLimit` separately)*
9. Status-degraded behavior *(Phase 1: enforced for `onboarding`/`active`/`suspended`; Phase 2 statuses pass through with a logged warning)*
10. Allow

super_admin bypass policy:
- **Reads** (e.g. viewing a tenant via support mode) → audited at `severity='info'`.
- **Writes** outside an active support-mode session → pre-Track-A: warned + audited at `severity='warn'` with `support_mode='emergency_override'`. Post-Track-A: denied (writes go via dedicated `/admin/tenants/<id>/...` routes only).
- Cross-tenant writes never happen on `/{slug}/admin` URLs once Track A lands.

## 11. Open questions parked here (resolve with the user before changing)

- **`x-impronta-*` internal headers** (17 usages: `lib/saas/scope.ts`, `lib/auth-routing.ts`, `lib/saas/host-context.ts`, `lib/supabase/middleware.ts`, etc.). Internal contracts, not user-visible; renaming is a 20-file refactor with no functional gain. Leave until there's a reason.
- **Vercel production branch** stuck on `main`. Fix only by upgrading to Pro and editing `link.productionBranch`. Do at launch.
- **`draft` workspace status** — keep, merge into `onboarding`, or drop. Recommend merging during Phase 2 status work.

## 12. Locked product logic

These documents are binding product logic. Code, schema, or copy that conflicts must be raised as a Decision-Log amendment before being changed — not silently re-interpreted.

- [`docs/talent-relationship-model.md`](docs/talent-relationship-model.md) — Talent / agency / hub / visibility / inquiry-ownership rules. Establishes:
  - Hubs ≠ agencies (criteria-based vs configurable join modes)
  - Agency join modes: `open` / `open_by_approval` / `exclusive`
  - Exclusivity rules and the talent's right to exit
  - User-talent dual identity ("AlsoTalent" relationship)
  - **Inquiry ownership = source URL** (most important rule)
  - Multi-source inquiry flow
  - Profile lifecycle states (Draft / Invited / Awaiting approval / Published / Claimed / Verified / Inactive / Removed)
  - Plan-ladder distribution rules (Free auto-assigned; Studio+ manual; Agency exclusive; Network hub-level)
  - Relationship-gated capabilities (the "explain why" UI rule)
  - 14 capability keys reserved in `lib/access/capabilities.ts`

- [`docs/transaction-architecture.md`](docs/transaction-architecture.md) — v1 payment / transaction model. Establishes:
  - **One booking = one payout receiver in v1.** Receiver explicitly selected per booking; not auto-derived.
  - Eligible receiver types: agency / admin / coordinator / talent. All require a connected `payout_accounts` row.
  - **Tulala takes platform fee first**, snapshotted on the transaction; receiver gets net.
  - Source-ownership invariants extend through transactions: workspace owning the inquiry owns the booking owns the transaction.
  - Booking payment state machine (draft → payment_requested → pending → paid → payout_pending → payout_sent, plus refunded / cancelled / disputed / failed off-paths).
  - Payment events extend `inquiry_events` with a nullable `booking_id`. New event types reserved.
  - Provider seam: v1 `'manual'`, v2 `'stripe'` / `'stripe_connect'`. Same schema.
  - 10 capability keys reserved in `lib/access/capabilities.ts`.
  - Reserved tables (deferred migrations): `booking_transactions`, `payout_accounts`. Reserved column on future `plans` table: `platform_fee_basis_points`.

When working on the dashboard restructure (Track B.5), the talent surface (`/talent/*`), or any inquiry / roster / visibility / payment surface — read these docs first.

## 13. Where to find more

- [`AGENTS.md`](AGENTS.md) — agent operating contract (read on every change)
- [`README.md`](README.md) — install / dev / test / deploy
- [`docs/decision-log.md`](docs/decision-log.md) — locked architectural decisions
- [`docs/saas/`](docs/saas/) — multi-tenant SaaS phase docs
- [`web/AGENTS.md`](web/AGENTS.md) — Next.js 16 quirks
- `~/.claude/projects/-Users-oranpersonal-Desktop-impronta-app/memory/` — point-in-time snapshots that may have drifted; read with skepticism
