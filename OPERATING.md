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

- [`docs/taxonomy-and-registration.md`](docs/taxonomy-and-registration.md) — Master taxonomy + workspace-scoped enablement + adaptive registration. Establishes:
  - **Three-layer model:** platform-owned master vocabulary / workspace-scoped enablement layer / talent-selection layer. *"Tulala owns the master taxonomy. The agency/hub chooses its allowed offer menu. The talent sees only the relevant registration flow for that agency/hub."*
  - **`agency_taxonomy_settings`** (deferred table) carries per-(tenant, term) config: `is_enabled`, `show_in_directory`, `show_in_registration`, `allow_as_primary`, `allow_as_secondary`, `requires_approval`, `display_order`, `custom_label`, `helper_text`.
  - **Plan-gated parent-type width:** Free=3, Studio=8, Agency=unlimited, Network=unlimited + custom hub vocabularies. New `max_taxonomy_groups` plan-limit.
  - **Adaptive registration flow** (mobile-first 8-step) — schema-driven by the workspace's enabled vocabulary. Same engine, different menu per workspace.
  - **Dynamic profile fields by talent type** via `talent_type_field_groups` (deferred). A model and a driver see different field groups.
  - **Two-mode profile editor:** talent (mobile-first, simple) / admin (deeper controls including approval status, internal notes, directory priority).
  - **5-phase build sequence** (Phase A foundation → E plan-gating). Phase B integrates with Track B.5; Phase E with Track C.
  - 4 capability keys reserved.
  - Honors page-builder invariants: CAS on `agency_taxonomy_settings`; new cache-tag surfaces (`taxonomy`, `registration-flow`); admin UI composes inspector kit primitives.

- [`docs/page-builder-invariants.md`](docs/page-builder-invariants.md) — **Binding constraints** for the SaaS / dashboard refactor (Track B.5) and any future shell, surface, or inspector work. Subsystem reality, not product direction. Establishes:
  - **Token registry** (`web/src/lib/site-admin/tokens/registry.ts`) is the only door for design knobs. Never write `agency_branding.theme_json` directly.
  - **Cache-tag helper** (`web/src/lib/site-admin/cache-tags.ts`) is the only path for cache invalidation; bare-string tags are ESLint-banned. New SaaS surfaces register here.
  - **Multi-tenant CAS** on `agency_branding` / `agency_business_identity` / `cms_navigation_items` / `cms_sections` — `expectedVersion` round-trip + `VERSION_CONFLICT` refetch. New operator-edited tables follow the same protocol.
  - **The canvas IS the public storefront, in edit mode.** No separate preview iframe. New shell wraps; it does not replace.
  - **Inspector IA**: site-header is 3 tabs (Brand / Layout / Navigation); section inspectors are 5 tabs (Content / Layout / Style / Responsive / Motion). Convergence requires coordination.
  - **Inspector kit primitives** are shared (`web/src/components/edit-chrome/inspectors/kit/`). New inspectors compose; never re-style fields ad-hoc.
  - **Public storefront CSS hooks** (`.public-header`, `.public-cms-footer`, `[data-cms-section]`, `[data-section-id]`, `[data-section-type-key]`, `data-token-*`) are load-bearing — preserve verbatim or migrate `token-presets.css` in lockstep.
  - **Free-form values pattern** (color tokens just shipped): `z.string().max(64)` validator → CSS variable → fallback chain. The precedent for any "operator can pick anything" knob.

When working on the dashboard restructure (Track B.5), any new inspector surface, any new operator-editable knob, or any cache-invalidating mutation — read this doc first.

- [`docs/client-trust-and-contact-controls.md`](docs/client-trust-and-contact-controls.md) — Client trust ladder + talent contact preferences + inquiry-send gating. Establishes:
  - **Four-tier trust ladder:** Basic (default) / Verified (verification + small fee) / Silver (verified + funded balance) / Gold (highest trust signal).
  - **Trust = derived field** from underlying signals (`verified_at`, `funded_balance_cents`, super_admin override). Evaluator runs in code so rules can evolve without migrations.
  - **Talent contact preferences:** four per-tier booleans (`allow_basic` / `allow_verified` / `allow_silver` / `allow_gold`). Default all-allowed at claim. Talent decides who can contact them.
  - **Inquiry gate:** new capability `inquiry.send_to_talent` runs a two-way relationship-state check (sender's trust × target talent's preferences). Server-side enforced; UI gating is a UX optimization.
  - **Trust signal carried on inquiry**: `inquiries.client_trust_level_at_send` snapshot for fast inbox filtering / sorting / future prioritization.
  - **Surface-aware:** same talent → same prefs across all surfaces. Workspace-level client policies and exclusivity-driven agency overrides reserved as deferred extensions (latter via existing `agency.roster.set_personal_page_distribution` capability).
  - 8 capability keys reserved in `lib/access/capabilities.ts`.
  - Reserved tables (deferred migrations): `client_trust_state`, `talent_contact_preferences`. Reserved column on `inquiries`: `client_trust_level_at_send`.
  - **Framing:** trust + spam reduction + lead quality, NOT "pay to DM."

- [`docs/talent-monetization.md`](docs/talent-monetization.md) — Tulala's third commercial lane. Establishes (with founder-ratified decisions 2026-04-25):
  - **Three commercial lanes:** workspace subscriptions, transaction fees, talent subscriptions.
  - **Talent product ladder:** Basic (default, free) / Pro ($12/mo placeholder) / Portfolio ($29/mo placeholder). Names final-TBD; plan keys locked.
  - **Architectural direction: solo-workspace approach with path-based public URL.** A talent's premium page is backed by a `kind='talent_solo'` workspace (invisible-to-user backend abstraction) and exposed publicly via the canonical platform URL `tulala.digital/t/<slug>` at all tiers. **No subdomain-per-talent pattern.** Reuses every existing piece of multi-tenant infrastructure.
  - Plan catalog gains `audience` field: `'workspace' | 'talent'`. UIs filter by audience.
  - **Custom domain only at Portfolio tier**, via existing `agency_domains` mechanism. Coexists with the canonical URL (both surfaces resolve to the same content).
  - **Solo workspace provisioned at claim, not at create.** Pre-claim talent-page inquiries flow to the creating workspace.
  - **Source-ownership extension:** path-based URL `/t/<slug>` requires slug-driven tenant resolution at inquiry-creation time (distinct from the host-driven resolution that handles agency / hub / custom-domain pages).
  - **Page ownership ≠ distribution control.** Talent always owns their page (content, subscription, custom domain). Under an exclusive agency relationship, the agency can control visibility / inquiry-routing / distribution — but cannot revoke ownership. Distribution flags reset when the relationship ends.
  - 9 capability keys reserved in `lib/access/capabilities.ts`.
  - 5 founder-resolved decisions documented in §14; 5 smaller open questions deferred in §14a.

When working on the dashboard restructure (Track B.5), the talent surface (`/talent/*`), or any inquiry / roster / visibility / payment / pricing surface — read these docs first.

## 12a. Active execution plan

The canonical 5-phase execution plan supersedes the prior "Track B.x" framing.

- **Plan file:** `~/.claude/plans/ancient-gathering-sparkle.md`
- **Phase 0 audit:** [`docs/handoffs/wave-1-prep-audit.md`](docs/handoffs/wave-1-prep-audit.md) — drift register (D1–D7) with founder-ratified decisions; locks the foundational rule that the prototype is the UX source of truth and the live admin/backend is the data/auth/tenant source of truth until each surface is safely promoted.

Phase order:

```
Phase 0  Stabilization and truth audit         (docs only)
Phase 1  Real-data bridge inside prototype     (one surface, opt-in dataSource=live)
Phase 2  Capability unification                (lib/access/ canonical)
Phase 3  Route promotion begins                (surface by surface)
Phase 4  Replace old admin modules             (delete-on-replacement)
```

Page builder (`web/src/components/edit-chrome/`) is wrapped, never replaced, per `docs/page-builder-invariants.md`.

## 13. Where to find more

- [`AGENTS.md`](AGENTS.md) — agent operating contract (read on every change)
- [`README.md`](README.md) — install / dev / test / deploy
- [`docs/decision-log.md`](docs/decision-log.md) — locked architectural decisions
- [`docs/saas/`](docs/saas/) — multi-tenant SaaS phase docs
- [`web/AGENTS.md`](web/AGENTS.md) — Next.js 16 quirks
- `~/.claude/projects/-Users-oranpersonal-Desktop-impronta-app/memory/` — point-in-time snapshots that may have drifted; read with skepticism
