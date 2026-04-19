# Phase 0 Deliverable 3 — State Machines

**Purpose.** One document with every lifecycle state machine the SaaS build has to implement. Each state machine lists: the states, what each state means, the legal transitions between them, who can trigger each transition, side effects, and events/audit entries emitted.

**Sources.** Plan §4 (`agencies`, `agency_memberships`, `agency_domains`, `agency_talent_roster`), §8 (field lifecycle), §11–11.5 (hub visibility + representation requests), §16 (inquiry lifecycle), §19 (provisioning/deprovisioning), §20 (required state-transition tests), §24 (cross-surface rules). Locks: L9, L11, L18, L22, L41–L43.

**Notation.** `a → b` is a legal transition. Branch with `|` (e.g. `completed | cancelled`). Transitions happen via explicit mutations; **no silent state auto-advancement** unless the state machine here says so.

**Rule (applies to all state machines).** Each transition emits a domain event to the appropriate log (`inquiry_events`, `activity_log`, `platform_audit_log`). Status strings are stored as `TEXT` with a CHECK constraint; transitioning via an enum-like helper (`advanceAgencyStatus()`, `advanceMembershipStatus()`, etc.) keeps the rules centralised.

---

## 1. Agency lifecycle (`agencies.status`) — Plan §4

### States

```
draft → onboarding → trial → active
                  ↘       ↘        ↓
                   (cancel any time from onboarding → cancelled → archived)
                                   ↓
                               past_due → restricted → suspended → cancelled → archived
                                   ↑________________________________________|
                                     (recovery: past_due → active on payment)
                                     (recovery: restricted → active on payment + review)
```

| State | Public site | Admin (agency) | Admin (platform) | Inquiries | Billing | Hub assignments |
|---|---|---|---|---|---|---|
| `draft` | Hidden | No | Yes | No | No | No |
| `onboarding` | Hidden | Yes (limited) | Yes | No | No | No |
| `trial` | Live | Yes | Yes | Yes | Not enforced | Yes |
| `active` | Live | Yes | Yes | Yes | Active | Yes |
| `past_due` | Live | Yes (billing lockouts shown) | Yes | Yes | Past due | Yes |
| `restricted` | Live (limited) | Yes (view only, no mutations) | Yes | Paused | Overdue | Frozen |
| `suspended` | Maintenance page | Blocked | Yes | Blocked | Suspended | Hidden from hub |
| `cancelled` | Redirect to platform | Grace period (export) | Yes | Blocked | Cancelled | Removed |
| `archived` | Gone | No | Yes (read-only cold storage) | No | No | Removed |

### Transitions + who

| From → To | Trigger | Actor | Side effects |
|---|---|---|---|
| `draft → onboarding` | Onboarding flow starts | `super_admin` / provisioning system | Run provisioning checklist (Plan §19) |
| `onboarding → trial` | Owner completes provisioning | Agency owner | `onboarding_completed_at` set; storefront goes live; hub participation if enabled |
| `trial → active` | Billing starts / trial ends with payment | System (billing webhook — Phase 8) | Plan enforcement begins |
| `active → past_due` | Payment failure | System (billing webhook) | Show lockout banners; preserve operational capability |
| `past_due → active` | Payment succeeds | System | Clear lockout banners |
| `past_due → restricted` | Overdue threshold exceeded | System | Freeze mutations; inquiries paused |
| `restricted → active` | Payment + review | System + platform admin | Unfreeze |
| `restricted → suspended` | Continued non-payment / policy breach | `super_admin` | Storefront → maintenance page; block admin login; hide from hub |
| `active|past_due|restricted|suspended → cancelled` | Owner cancels OR platform terminates | Owner (`manage_agency_billing`) OR `super_admin` | Start 30-day grace period; storefront redirect; deprovisioning checklist begins (Plan §19) |
| `cancelled → archived` | Grace period elapsed | System (background job) | Remove from hub; archive agency-local rows; preserve legal retention |
| `suspended → active` | Platform restores | `super_admin` | Audit + owner notification |
| `onboarding|draft → cancelled` | Abandoned signup cleanup | System / `super_admin` | Fast-path deprovisioning (no production data to retain) |

### Enforcement gates

- **Non-platform actors** cannot set `status = 'suspended' | 'archived'` directly. Only via `super_admin`.
- Once `archived`, agency is read-only cold storage — inquiries/bookings remain per legal retention, but no new writes.
- Public middleware (Phase 4) reads `agencies.status` to decide storefront render vs maintenance page vs redirect.

### Tests required (Plan §20)

- Create → onboard → template pick → branding edit → invite staff → add roster → submit hub → approve → connect domain → suspend → recover.
- Agency suspension with active inquiries: states frozen, messaging disabled, platform emergency override can reassign.

---

## 2. Membership lifecycle (`agency_memberships.status`) — Plan §4

### States

```
invited → pending_acceptance → active → suspended → removed
            ↓                                         ↑
        expired_invite ─────────────────────────────┘ (removed after cleanup)
```

| State | Meaning |
|---|---|
| `invited` | Invite created; email sent; `invite_expires_at` set |
| `pending_acceptance` | User clicked invite but hasn't confirmed (account creation in progress) |
| `active` | Member in good standing; capabilities apply |
| `suspended` | Temporarily blocked from agency; retains row for audit |
| `removed` | Permanent removal; row kept for audit trail |
| `expired_invite` | Invite past `invite_expires_at` without acceptance |

### Transitions + who

| From → To | Trigger | Actor | Side effects |
|---|---|---|---|
| (create) → `invited` | `manage_agency_users` sends invite | Agency admin+ | Invite email sent; `invited_by`, `invite_expires_at` set |
| `invited → pending_acceptance` | Invitee clicks link | Invitee | Link consumed; account-link in progress |
| `pending_acceptance → active` | Account confirmed | Invitee | `accepted_at` set; capabilities active |
| `invited|pending_acceptance → expired_invite` | `invite_expires_at` < now | Background job (Plan §21) | Invite link invalidated |
| `expired_invite → invited` | Re-invite | Agency admin | New expiry set |
| `active → suspended` | Staff discipline / security hold | Agency admin+ | User loses capabilities; sessions invalidated on next auth cycle |
| `suspended → active` | Restored | Agency admin+ | Capabilities return |
| `active|suspended → removed` | Removal | Agency admin+; self-removal allowed except owner | Row retained; `removed_at`, `removed_by`, sessions invalidated |

### Enforcement gates

- **Owner cannot be removed until ownership is transferred** (Plan §18). `ALTER MEMBERSHIP` from the only `owner` row is rejected.
- Invite to an existing platform user creates the membership directly (row starts `active` if single-step, or `invited → active` with a one-click accept — implementation choice in Phase 4).
- Invite to an unknown email creates the membership in `invited` state; on signup the membership attaches to the new profile and moves to `active`.
- Suspending / removing invalidates all sessions associated with that membership scope (but the user's other agency memberships remain unaffected).

### Tests required

- Invitation lifecycle transitions (per §20).
- Expired invite cleanup job idempotency (re-invites don't duplicate).

---

## 3. Invitation lifecycle (extension of membership — Plan §4, §21)

The invitation is the `invited → pending_acceptance → active | expired_invite` subgraph of membership, plus side channels.

### States + transitions (dedicated view)

```
invited ──click──> pending_acceptance ──confirm──> active
   │                                                 ↑
   │                                           resent as new
   └──time elapsed──> expired_invite ──re-invite──> (new invited row)
```

### Events + notifications

| Event | Emits |
|---|---|
| Invite created | Email to invitee; `activity_log` entry; `agency_usage_counters.staff_count` unchanged until `active` |
| Invitee clicks link | `platform_audit_log` low-severity entry |
| Invite accepted | `activity_log` + welcome email; counter increments |
| Invite expires | `activity_log` + agency-admin notification (digest) |

### Background job

Invite expiration cron scans `agency_memberships` where `status IN ('invited', 'pending_acceptance') AND invite_expires_at < now()`. Marks `expired_invite`. Tenant-aware (Plan §21).

### Cross-reference

Invitation lifecycle feeds `agency_usage_counters.staff_count` — counter increments on `invited → active`, not on `(create) → invited`. Otherwise plan limits could be bypassed with spam invites.

---

## 4. Domain lifecycle (`agency_domains.status`) — Plan §4, §12

### States

```
pending ──submit──> dns_verification_sent ──DNS ok──> verified ──provision──> ssl_provisioned ──> active
                                        │                    │                       │
                                        └────DNS fail────────┴──> failed           suspended (platform / health)
                                                                    ↓                   ↑
                                                                re-verify ──> pending   │
                                                                                     (if revoked)
```

| State | Meaning |
|---|---|
| `pending` | Row created; no DNS check started |
| `dns_verification_sent` | Verification token sent; awaiting DNS propagation |
| `verified` | DNS matches token; ready for SSL |
| `ssl_provisioned` | Cert issued |
| `active` | Live and serving traffic |
| `failed` | DNS or SSL step failed; troubleshooting surface shown to owner |
| `suspended` | Platform / health check disabled this domain |

### Transitions + who

| From → To | Trigger | Actor | Notes |
|---|---|---|---|
| (create) → `pending` | Owner adds domain | `manage_agency_domains` (owner only) | Token generated |
| `pending → dns_verification_sent` | Verification initiated | System | Email to owner with DNS records |
| `dns_verification_sent → verified` | DNS check passes | Background job | Retry w/ backoff; Plan §21 |
| `dns_verification_sent → failed` | DNS check repeatedly fails | Background job | Owner-visible failure; option to re-submit |
| `verified → ssl_provisioned` | Vercel API issues cert (**Phase 5 / human-in-loop**) | Platform + Vercel | — |
| `ssl_provisioned → active` | Domain serves traffic | System | Storefront routing enables |
| `active → suspended` | Health check failure OR platform action | System / `super_admin` | Fallback to subdomain (Plan §4) |
| `suspended → pending` | Retry by owner | Owner | Triggers re-verification |
| (any) → (delete) | Custom domain removal | Owner | Subdomain row cannot be deleted — always fallback |

### Enforcement gates

- **Subdomain row is auto-created on agency creation** and always remains as fallback. Not deletable. Plan §4.
- **Only one `is_primary = true`** per agency. Switching primary is a controlled action with canonical SEO update.
- Admin workspace is **never served on a custom domain** (L2). Routing always redirects admin requests to `app.studiobooking.io/a/{slug}/...`.
- Custom domains require `manage_agency_domains` capability — owner only by default.
- **Platform approval is implicit** via DNS verification; there is no manual reviewer step. Plan §12.
- Periodic re-verification via background job; DNS change detection triggers `active → suspended → pending → ...` cycle.

### Phase note

Phase 5 is the production implementation (Vercel Domains API, SSL provisioning) and requires human-in-loop (Charter §7). Until Phase 5, only the subdomain path is live.

---

## 5. Roster assignment lifecycle (`agency_talent_roster.status` + `agency_visibility`) — Plan §4, §11.5

Two dimensions on the same row: **assignment status** and **agency-site visibility**.

### Assignment status

```
pending ──accept──> active ──deactivate──> inactive ──remove──> removed
   │                  ↑___________________│ (reactivate)           ↓ (archived)
   └──reject──> removed
```

| State | Meaning |
|---|---|
| `pending` | Assignment proposed (e.g. via representation request accept) but not yet effectuated |
| `active` | On agency roster; visible per `agency_visibility` |
| `inactive` | Temporarily off roster (e.g. sabbatical); history preserved |
| `removed` | Off roster permanently; row retained for audit |

### Agency visibility (orthogonal)

```
roster_only ──publish──> site_visible ──feature──> featured
   ↑___________________________│_______________________│ (demote)
```

| Visibility | Meaning |
|---|---|
| `roster_only` | On the agency roster but not shown on the storefront |
| `site_visible` | Displayed on public storefront listings |
| `featured` | Promoted on storefront homepage / featured rail |

### Transitions + who

| From → To | Trigger | Actor | Side effects |
|---|---|---|---|
| (create, pending) | Accepted representation request OR direct add | `manage_roster` | `source_type` recorded (agency_added / agency_created / freelancer_claimed / platform_assigned / imported) |
| `pending → active` | Effectuation step (onboarding paperwork, etc.) | `manage_roster` | Storefront visibility per `agency_visibility` |
| `active ↔ inactive` | Reassignment | `manage_roster` | History preserved |
| `active|inactive → removed` | Removal | `manage_roster` | Existing inquiries continue; new inquiries cannot reference this talent from this agency (Plan §16 edge case) |
| `roster_only → site_visible` | Publish | `manage_roster` | Indexed in agency-public search |
| `site_visible → featured` | Feature on storefront | `manage_roster` | Sort override + featured rail |

### Hub visibility dimension

`hub_visibility_status` is a **separate** third dimension (see §6 below). Roster changes do not auto-affect hub visibility — they must be submitted explicitly (L9, L42).

| `hub_visibility_status` | Meaning |
|---|---|
| `not_submitted` | Never submitted to hub |
| `pending_review` | Submitted; awaiting platform review |
| `approved` | Hub-approved; visible on `talenthub.io` (subject to other gates) |
| `rejected` | Platform rejected submission |

### Rules

- Removing a talent from the roster while they have hub visibility **does not** auto-unpublish hub visibility (platform moderation path, not agency). Talent can still appear on hub as a freelancer or via another agency.
- If the agency is the talent's **primary agency** and the talent is removed, their `agency_talent_roster.is_primary` flag must move to another agency row (or remain unrouted → new inquiries land in `tenant_id IS NULL` platform queue, Plan §16).

---

## 6. Hub visibility lifecycle (`hub_visibility_requests.status`) — Plan §11, §11.5, L41

Governed request pattern. Uses the unified status vocabulary from Plan §11.5.

### States

```
requested ──pick up──> under_review ──approve──> accepted
   │                       │                         │
   │                       │                         └─(revoke by moderation)─> rejected
   │                       └──reject──> rejected
   └──withdraw──> withdrawn
```

| State | Meaning |
|---|---|
| `requested` | Submitted by agency or freelancer-talent; in queue |
| `under_review` | Platform reviewer is actively reviewing |
| `accepted` | Approved; hub visibility **effectuated** — `agency_talent_roster.hub_visibility_status = 'approved'`, `talent_profiles.workflow_status` + `visibility` synced |
| `rejected` | Denied; no effectuation; optional reason surfaced to requester |
| `withdrawn` | Cancelled by requester before acceptance; no partial publication |

### Transitions + who

| From → To | Trigger | Actor | Side effects |
|---|---|---|---|
| (create) → `requested` | Agency `submit_hub_visibility` OR freelancer talent flow | Agency admin+ / talent self | Queue entry; platform notified |
| `requested → under_review` | Reviewer picks up | `platform_reviewer` / `platform_admin` / `super_admin` | Review queue UI |
| `under_review → accepted` | Approve with optional notes | `platform_reviewer`+ | Sync to `talent_profiles.workflow_status` + `visibility`; `agency_talent_roster.hub_visibility_status = 'approved'`; index in hub search |
| `under_review → rejected` | Reject with reason | `platform_reviewer`+ | Requester notified; hub unaffected |
| `requested|under_review → withdrawn` | Requester cancels | Original requester OR agency admin | No publication artefacts created |
| `accepted → (revoke)` | Moderation action | `super_admin` (emergency) OR `platform_moderator` | Row stays `accepted` in history; **moderation layer** hides/freezes publication; audit at elevated severity (L43) |

### Rules

- Each hub surface is a **separate request row** (Plan §11.5). Adding `talenthub.io` visibility does not imply visibility on any future branded discovery host.
- Self-selection (talent requests hub visibility) creates `requested`, not `accepted`. Never auto-publish (L41).
- Preferences ("I want to appear on hub X") are stored **separately** from requests. They inform future requests or reviewer context only.
- Platform moderation can override publication state at any time without transitioning the request row. The audit trail carries the override.

### Cross-reference

Feeds `agency_talent_roster.hub_visibility_status` on `accepted`; this sync is the only way an agency row's hub flag becomes `approved`.

---

## 7. Representation request — agency application (Plan §11.5, L41–L42)

Same unified status vocabulary. Applies when a **talent** applies to an **agency roster** (separate from hub visibility).

### States

```
requested → under_review → accepted | rejected | withdrawn
```

### Transitions + who

| From → To | Trigger | Actor | Side effects |
|---|---|---|---|
| (create) → `requested` | Talent applies via dashboard OR platform admin creates on behalf | Talent / platform admin | Queue entry in agency workspace |
| `requested → under_review` | Agency picks up | Agency admin+ with `manage_roster` | Visible in agency review surface |
| `under_review → accepted` | Accept | Agency admin+ | Roster row created in `agency_talent_roster` (`status = 'pending'` or `'active'` per agency workflow); roster lifecycle continues independently |
| `under_review → rejected` | Reject | Agency admin+ | Optional reason to talent; no roster change |
| `requested|under_review → withdrawn` | Talent cancels | Talent OR platform admin on behalf | No roster change |

### Rule

Agency admin **cannot** approve hub visibility unless product grants a delegated capability (default: no). L42.

---

## 8. Field lifecycle (`field_definitions.status`) — Plan §8

### States

```
draft → active → deprecated → archived
         ↕
       locked  (platform-controlled; immutable)
```

| State | Meaning |
|---|---|
| `draft` | Not yet visible to talent / public |
| `active` | In use |
| `deprecated` | Readable, but hidden from new edits; migration notice shown |
| `archived` | Hidden; values preserved but not queryable |
| `locked` | Immutable, platform-controlled (e.g. during schema migration) |

### Transitions + who

| From → To | Trigger | Actor | Notes |
|---|---|---|---|
| (create) → `draft` | Platform adds field (core scope) OR agency admin adds field (agency-local scope, Phase 6) | `super_admin` / `platform_admin` / agency admin with `manage_agency_fields` | Scope determines reviewer |
| `draft → active` | Publish field | Platform (core) / agency admin (local) | Visible per `hub_visible`/`searchable`/`filterable` flags |
| `active → deprecated` | Deprecation decision | Platform (core) / agency admin (local) | Reads still work; writes gated with notice |
| `deprecated → archived` | Cleanup | Platform / agency admin | Values retained but removed from query surfaces |
| (any) → `locked` | Schema migration window | `super_admin` | Immutable until unlocked |
| `locked → previous` | Migration complete | `super_admin` | Returns to prior state |

### Enforcement gates

- `who_creates` on each field definition is either `platform_only` or `agency_admin`.
- Agency-local fields are auto-prefixed with `agency_{slug}_` in internal key (Plan §8).
- Reserved keys: all current global field keys are reserved; agency cannot create a field with a reserved internal key.
- Deleting a select option: values using it become orphaned — migration prompt required.
- Agency-local fields never enter hub AI/search (L8, L39 — hub serializer allowlist enforces this).

### Tests

Field scope enforcement (Plan §20) — agency-local fields must not appear in hub serializer output.

---

## 9. Field promotion lifecycle (`field_promotion_requests.status`) — Plan §8, Phase 6

Agency-local field proposed for promotion to global scope.

### States

```
requested → under_review → accepted | rejected | withdrawn
                              │
                              └─(accepted)─> field_definitions row updated to scope='global'
```

### Transitions + who

| From → To | Trigger | Actor | Side effects |
|---|---|---|---|
| (create) → `requested` | Agency admin proposes | Agency admin (`manage_agency_fields`) | Queue entry for platform |
| `requested → under_review` | Reviewer picks up | `platform_admin` / `platform_reviewer` | — |
| `under_review → accepted` | Approve | Platform admin | Field `scope` updated to `global`; agency-local values migrate to `field_values`; synonym mapping recorded (Plan §8) |
| `under_review → rejected` | Reject | Platform admin | Reason surfaced; field remains agency-local |
| `requested|under_review → withdrawn` | Agency withdraws | Agency admin | No schema change |

### Rule

Promotion folds agency-local options into global taxonomy terms. The **synonym map** the platform maintains for search quality is updated on accept; the agency's old options remain pointing at the new global term.

### Taxonomy promotion (same pattern)

`taxonomy_promotion_requests` uses the identical status vocabulary. Agency-local tag → global taxonomy term. Platform assigns canonical slug + SEO metadata on approval (Plan §8).

---

## 10. Inquiry lifecycle (reference — Plan §16, L21)

Not a Phase 0 new-concept, but listed because tenantisation Phase 1 preserves it. Tests in Plan §20 cover it.

```
draft → submitted → acknowledged → in_progress → offer_sent → booked | declined | cancelled
```

- State transitions are capability-gated (`manage_inquiries`).
- Only the **primary** coordinator (`inquiry_coordinators.role = 'primary' AND removed_at IS NULL`) can transition.
- Closed inquiries (`booked`, `declined`, `cancelled`) are read-only except via platform emergency override.
- Every transition emits an `inquiry_events` row + updates derived notifications (L27).

## 11. Booking lifecycle (reference — Plan §16)

```
pending_confirmation → confirmed → in_progress → completed | cancelled
```

- Booking belongs to one inquiry; inherits tenant.
- Booking is **frozen** (not deleted) if the agency is suspended.
- Post-booking requirement-group lock (L32): changes only via controlled adjustment flow (substitution, replacement) with reason + audit entry.
- Reassigning a booking to another agency is **not allowed in V1**; deferred to V1.5+ with explicit talent + client consent flow (Plan §16).

---

## 12. Provisioning + deprovisioning (Plan §19)

Not a single state machine — they are **checklists** attached to the `agencies` lifecycle. Listed here so the lifecycle transitions above have a concrete definition of side effects.

### Provisioning (on `draft → onboarding` / `onboarding → trial`)

1. `agencies` row with `status = 'onboarding'`.
2. `agency_memberships` row for owner (`role = 'owner'`, `status = 'active'`).
3. `agency_branding` defaults from template.
4. `agency_domains` subdomain row (`status = 'active'`).
5. Starter navigation items.
6. Starter CMS pages (from template, `context = 'agency_storefront'`).
7. Default `settings` rows (from template + plan).
8. `agency_entitlements` row from plan.
9. `agency_usage_counters` initialised to 0.
10. Default inquiry form configuration.
11. Default `supported_locales`.
12. Default feature flags.
13. Onboarding checklist UI entries.

### Deprovisioning (on `cancelled` → 30-day grace → `archived`)

1. Grace period for data export (30 days).
2. Custom domains released; DNS records documented for agency.
3. Talent roster assignments set to `removed`; talent profiles remain global.
4. Hub visibility for agency's submitted talent: withdrawn (unless another agency carries them).
5. `agency_client_relationships`: archived.
6. `agency_memberships`: all set to `removed`; sessions invalidated.
7. Agency-local field values: archived (not deleted).
8. Media uploaded by agency: remains on talent profiles (global ownership).
9. Agency-specific media (campaign overlays, if any): archived.
10. Inquiries/bookings: archived, not deleted (legal retention).
11. `agencies.status`: `cancelled → archived` after grace period.

---

## 13. Required tests (Plan §20)

Direct state-machine tests from Plan §20:

- **Visibility workflow state transitions** — hub visibility lifecycle (§6) across all transitions.
- **Invitation lifecycle transitions** — membership §2 + §3.
- **Agency lifecycle state effects** — §1 for each state (public site visibility, admin access, inquiries/billing gates).
- **Domain resolution and fallback** — §4.
- **Capability mapping per agency role** — deliverable 2 §4.

Plus the operational state tests:

- **Multi-coordinator inquiry** — primary slot never empty; secondaries can be added/removed; history preserved in `inquiry_coordinators` (§10 reference + Plan §16.6).
- **Requirement-group fulfillment + booking conversion** — fill/partially fill/override/block (Plan §16.5).
- **Post-booking group lock** — immutability + controlled adjustment (L32).
- **Agency suspension with active inquiries** — frozen state, emergency override can reassign.
- **Support-mode thread visibility** — deliverable 2 §7 matrix.

---

## 14. Change control

- Adding a new state to any machine above: Decision Log entry in Plan §27 before implementing.
- Adding a new transition: update the table in this doc AND the `advanceXStatus()` helper.
- Retiring a state: deprecate first (update UI + migrations), keep the enum value for audit history, remove from allowed transitions.
