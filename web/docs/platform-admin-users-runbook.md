# Platform Admin — Users Control Center: Runbook

> **Status**: Production as of 2026-05-24 (PR #27, #28). See the full plan at
> `web/docs/platform-users-control-center-plan-2026-05-23.md`.

## Overview

The platform user drawer at `/platform/admin/users` is the canonical super-admin
view for every person on the Tulala platform. It surfaces nine collapsible sections,
all gated on the `super_admin` platform role.

## Section reference

| Section | File | What it does |
|---|---|---|
| Identity & Access | `UserDrawer.tsx` (inline) | Email, confirmed status, app role, account status, timestamps |
| Origin & Provenance | `UserDrawer.tsx` (`OriginSection`) | How/where/who created this account |
| Talent Record | `TalentRecordSection.tsx` | Slug link, workflow status, claim status, send-invite for unclaimed |
| Billing & Subscriptions | `BillingSection.tsx` | Talent/client subscription, Stripe customer link, plan override UI |
| Workspaces & Hubs | `WorkspaceMembershipsSection.tsx` | Membership rows with ⋯ change-role / remove menu |
| Activity | `UserActivitySection.tsx` | Inquiry + booking counts, last 5 inquiries |
| Admin Notes | `AdminNotesSection.tsx` | Threaded notes visible only to platform admins |
| Audit History | `AuditHistorySection.tsx` | Last 20 `platform_audit_log` entries for this person |
| Admin Actions | `AdminActionsSection.tsx` | Tier 1/2/3 action buttons (see below) |

## Admin action tiers

| Tier | Actions | Confirmation required |
|---|---|---|
| **Tier 1 — safe** | Resend confirmation, password reset, set temp password, force sign-out, support mode | None (immediate) |
| **Tier 2 — reversible** | Suspend/unsuspend, hide/unhide talent globally, mark as test account | One click |
| **Tier 3 — destructive** | GDPR anonymize, delete account, unclaim talent profile | Typed-name confirmation (server re-validated) |

All actions write to `platform_audit_log` and are visible in the Audit History section.

## Server actions

| File | Exports |
|---|---|
| `actions.ts` | Tier-1 safe actions + `getPlatformUserAuditLog` |
| `actions-tier2.ts` | Tier-2 reversible actions |
| `actions-tier3.ts` | Tier-3 destructive actions |
| `actions-notes.ts` | Admin notes CRUD |
| `actions-billing.ts` | Talent plan override apply/remove, `getPersonBillingSnapshot` |

## Database tables

| Table | Purpose |
|---|---|
| `platform_audit_log` | Immutable audit trail for all platform-admin operations |
| `user_admin_notes` | Admin notes per user (CRUD) |
| `user_visibility_overrides` | Per-site talent visibility overrides |
| `talent_plan_overrides` | Temporary talent plan grants (comp/trial/promo) |
| `workspace_plan_overrides` | Temporary workspace plan grants |

## Test accounts

Test accounts are flagged via `profiles.is_test_account = true` (humans) or
`talent_profiles.is_test_account = true` (talent). The today-page stat counts
(`loadPlatformStats`) exclude test accounts. The federated loader still includes
them; the users table has a "Test" chip for identification.

## Common support tasks

**User can't sign in (unconfirmed email)**
→ Admin Actions → Tier 1 → "Confirm email" button in the Identity section, or
"Resend confirmation" in Admin Actions.

**User locked out / forgot password**
→ Admin Actions → Tier 1 → "Send password reset" or "Set temp password".

**Suspend a bad actor**
→ Admin Actions → Tier 2 → "Suspend account". Bans via Supabase Auth + sets
`profiles.account_status = 'suspended'`. Reverse with "Unsuspend account".

**Grant a talent a free Pro/Portfolio plan**
→ Billing & Subscriptions → "Apply plan override". Pick plan, duration, reason.
Override is recorded in `talent_plan_overrides` and mirrored onto
`talent_profiles.talent_plan_key`. Revoke anytime with "Remove override".

**Claim a talent profile on behalf of a user**
→ Talent Record section → "Send claim invite". Sends a Supabase magic-link
invite that pre-populates `claim_talent_profile_id` in the new user's metadata.

**Remove a user from a workspace**
→ Workspaces & Hubs → ⋯ menu → "Remove". Irreversible at the drawer level;
the workspace admin can re-add them.

## Monitoring

The global audit log is at `/platform/admin/audit-log`. Filter by actor, target,
action, or date range. All platform-admin writes appear here within seconds.

## Access control

All server actions in the `users/actions*.ts` files call `requirePlatformAdmin()`
which checks `profiles.app_role = 'super_admin'` via the service-role client.
The page itself is gated by the platform middleware (`platform-role.ts`).
There is no multi-level delegation — only `super_admin` can reach these pages.
