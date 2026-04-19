# Phase 1 — O1–O7 Decision Resolutions

**Status.** Lead architect (Claude) proposes defaults below. Each default is plan-aligned and labeled with reversibility. Proceeding per user directive "propose the best default, label it clearly, state impact, continue only where safe."

**Escalation rule.** Only items that would CHANGE core architecture or data ownership trigger a stop. None of O1–O7 does under the proposed defaults. If any default turns out to conflict with a downstream reality, it is reversible as noted.

---

## Phase-blocking (must be settled before any Phase 1 migration lands)

### O2 — Tenant #1 slug

**Proposed default:** `impronta`

**Impact.**
- Subdomain: `impronta.studiobooking.io`
- Reserved-slug check (Phase 4 storefront middleware rejects this slug for anyone else)
- Seeded in `agencies.slug` + `agency_domains` subdomain row
- Display name unchanged: "Impronta Models Tulum"

**Why this one.**
- Short, memorable, matches brand.
- `impronta-tulum` was considered but `tulum` is geographic scope — keeping it flexible for future expansion.
- `impronta-group` / `impronta-models` would bind the slug to an org-form word that may later shift.

**Reversibility.** Seed-time value; reversible by a follow-up migration before Phase 4 middleware ships. After Phase 4, the slug is live — changing it requires a rename + redirect rule.

---

### O6 — Client relationship model

**Proposed default:** Option (a) — global `client_profiles` + per-agency `agency_client_relationships` overlay.

**Impact.**
- `client_profiles` (exists today) **stays global**. No `tenant_id` added.
- New table in Phase 1: `agency_client_relationships` with `tenant_id NOT NULL`, carrying per-agency notes, tags, source, status.
- Existing `client_accounts` + `client_account_contacts` (commercial accounts) become tenant-scoped (`add tenant_id`).
- Client contact information stored in `client_profiles` remains global (email, name, phone); agency-private notes live in the overlay.

**Why this one (plan-aligned with L6, L7).**
- Mirrors the canonical + overlay pattern already used for talent.
- A client who works with two agencies in the future keeps one identity; each agency sees only its own relationship row.
- Agencies never see another agency's notes/tags.
- Simpler RLS in Phase 2 — one pattern for talent-overlay and client-overlay.

**Alternative considered.** Per-agency records (option b) would duplicate identity data and prevent future client-side multi-agency UX. Hybrid (option c) introduces two patterns where one suffices.

**Reversibility.** Adding the overlay is additive. If a future decision converts back to per-agency records, the overlay rows migrate 1:1 to per-agency records. Safe.

**Business risk.** Modest. Existing Impronta (single-tenant) flows continue unchanged — `client_profiles` already exists; new overlay table starts empty and fills as agencies add notes.

---

### O7 — Can one person be both talent and agency staff?

**Proposed default:** Yes, with guardrails. Implementation path: roles move out of single `profiles.app_role` enum slot and onto `agency_memberships` rows.

**Impact.**
- Phase 1: create `agency_memberships` table with `profile_id UUID REFERENCES profiles(id)` + `role TEXT` (`owner` / `admin` / `coordinator` / `editor` / `viewer`). No UNIQUE constraint forcing profile to be talent-only.
- Phase 1: `profiles.app_role` keeps existing values (`super_admin`, `agency_staff`, `talent`, `client`) for compatibility. A profile can have `app_role = 'talent'` AND one or more active `agency_memberships` rows.
- Phase 2: capability resolution reads from `agency_memberships` for agency scope; `profiles.app_role` becomes legacy primary-role indicator.
- Phase 3: UX guardrail — when a user with both talent profile and agency membership logs in, account switcher exposes both contexts; defaults to the last-used.

**Why this one (plan-aligned with L10, Plan §5, deliverable 2).**
- Capabilities are the permission primitive, not role names (L10).
- Phase 0 deliverable 2 already treats agency-role as a property of `agency_memberships`, not of the person.
- Real-world use case: a talent who is also their agency's booker (common in small agencies).

**Alternative considered.** "No" would force account duplication with different emails. "Yes without guardrails" risks confusion over which context an action executes in.

**Reversibility.** Phase 1 is purely additive — adding `agency_memberships` does not change `profiles.app_role` behavior. If we later decide no overlap, a future migration can enforce "at most one talent profile per profile that also has any agency membership." Safe.

**Impact on O4.** This default implicitly softens O4 — `agency_staff` enum value remains available but is no longer the source of truth for agency-scope permissions. Phase 2 handles the formal deprecation path.

---

## Non-blocking (Phase 1 can proceed; resolve before the dependent phase)

### O1 — Confirm production DNS

**Status.** OPEN. Blocker for Phase 4 (storefront middleware) and Phase 5 (custom domains), not Phase 1.

**Working assumption for Phase 1 planning:** Plan §1.5 domains — `app.studiobooking.io`, `studiobooking.io`, `talenthub.io`, `{slug}.studiobooking.io`, plus tenant custom domains (e.g. `improntamodels.com`). No Phase 1 migration depends on any of these being live.

**When it must be resolved.** Before Phase 4 starts. The middleware hardcodes hostname → context routing; it can't ship without confirmed hostnames.

---

### O3 — Deployment platform (Vercel assumed)

**Status.** OPEN. Blocker for Phase 5, not Phase 1.

**Working assumption for Phase 1 planning:** Vercel. No migration in Phase 1 references any platform-specific feature.

**When it must be resolved.** Before Phase 5 (custom domain + SSL provisioning via Vercel Domains API).

---

### O4 — `agency_staff` role enum migration strategy

**Status.** OPEN. Blocker for Phase 2, not Phase 1.

**Phase 1 working assumption:** Keep the `agency_staff` enum value in `public.app_role`. Add `agency_memberships` as the new source of truth for agency-scope permissions (see O7). Phase 2 makes the formal call between:
- (α) Keep `agency_staff` enum value indefinitely as legacy primary-role flag (low churn)
- (β) Rename to `agency_member` with a migration + code rewrite
- (γ) Add `agency_member` as a new enum value and migrate rows over time

Phase 1 does not choose among α/β/γ. All three remain open.

---

### O5 — Admin URL pattern for agency context

**Status.** OPEN. Blocker for Phase 3, not Phase 1.

**Working assumption for Phase 1 planning:** Path-based `/a/{slug}/admin` (mentioned in Plan §6 and ownership map §8). Phase 3 confirms or revises. No Phase 1 migration depends on this.

---

## Summary table

| # | Decision | Phase 1 resolution | Blocker for | Reversibility |
|---|---|---|---|---|
| O1 | Production DNS | Assume plan § 1.5; defer | Phase 4 | n/a (no migration yet) |
| O2 | Tenant #1 slug | **Default: `impronta`** | Phase 1 seed | Seed-time; reversible pre-Phase-4 |
| O3 | Vercel | Assume Vercel | Phase 5 | n/a |
| O4 | `agency_staff` enum | Keep enum value; defer rename | Phase 2 | Phase 2 chooses α/β/γ |
| O5 | Admin URL | Assume `/a/{slug}/admin` | Phase 3 | Phase 3 can revise |
| O6 | Client relationship | **Default: global + overlay** | Phase 1 | Overlay is additive |
| O7 | Talent + agency staff same person | **Default: Yes via `agency_memberships`** | Phase 1 | Additive; no constraint loosened or broken |

---

## What happens if a default turns out wrong

For each of the three materially-resolved decisions (O2, O6, O7), a follow-up migration can undo or reshape:

- **O2 wrong:** rename slug in one migration before Phase 4 ships. After Phase 4: rename + 301 redirect.
- **O6 wrong:** overlay rows migrate to per-agency records in a straightforward script. No data loss.
- **O7 wrong:** add UNIQUE constraint "at most one of {talent_profile exists, agency_membership exists} per profile"; handle conflicts by picking primary role. One-time script.

None of these requires tearing down canonical structures. The canonical + overlay model (L6, L7) and request-driven governance (L41–L44) remain intact under any outcome.
