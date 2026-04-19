# Phase 0 Deliverable 2 — Capability Definitions + Role Mapping

**Purpose.** Define the capability primitives that gate every mutation, map default roles (platform and agency) to those capabilities, and document the three access modes platform staff use to enter an agency workspace. This is the spec that Phase 2 implements as `hasCapability(userId, agencyId, capability)` / `requireTenantStaff()` / `requireAgencyRole()` / `requireCapability()`.

**Sources.** Plan §5 (Roles + capabilities), §6 (Support access model), §11–11.5 (Representation requests — governed capability interplay), §16.6 (Coordinator assignment — operational layer on top of capabilities). Locks: L10, L11, L22, L23, L41–L43.

---

## 1. Why capabilities, not role names (L10)

Role names are convenient for UI ("Editor" / "Coordinator"), but permission checks read **capabilities**. When the first agency asks "can my coordinator edit offers but not delete users?" the answer is a capability re-mapping, not a code refactor.

- Role → capability mapping is either stored in `agency_role_capabilities` (future) or hardcoded per role in Phase 2 (likely this — simpler to ship).
- Server-side checks always use `hasCapability(userId, agencyId, capability)`. Never `user.role === 'coordinator'`.
- Platform role checks use an equivalent `hasPlatformCapability(userId, capability)` pattern.
- UI may gate by role for discoverability, but actions must still be enforced by capability on the server.

---

## 2. Platform identity (`profiles.app_role`)

Plan §5.

| Role | Purpose | Notes |
|---|---|---|
| `super_admin` | Full platform control | Only role that can enter emergency override mode |
| `platform_admin` | Governance (taxonomy, fields, approvals) | **No** billing/agency-destructive ops |
| `platform_reviewer` | Read + approve/reject hub submissions & field promotions | New in Phase 2 |
| `platform_support` | Read-only cross-agency inspection for support cases | New in Phase 2; no governance mutations |
| `agency_member` | Has one or more `agency_memberships` | Keep existing `agency_staff` enum as alias during migration (O4 resolution pending) |
| `talent` | End-user talent | — |
| `client` | End-user client | — |

**Why split `platform_admin` and `platform_support`?** Someone who inspects an agency (read logs, reproduce a bug, walk through a workflow) should not also be authorised to approve hub publishing or rewrite taxonomy. Narrow scopes reduce blast radius and make audit review tractable.

---

## 3. Agency role (`agency_memberships.role`)

Plan §5.

| Role | Purpose |
|---|---|
| `owner` | Full agency control — billing, domains, ownership transfer. Must have at least one per agency; owner cannot delete self until transferred. |
| `admin` | Settings, users, branding, fields, hub submissions. Everything except billing/ownership. |
| `coordinator` | Inquiries, bookings, roster management, talent operations. |
| `editor` | CMS content, branding, translations, navigation. |
| `viewer` | Read-only agency dashboard access. |

Multiple agency memberships per user allowed (same person can be in multiple agencies). Membership status is separate from role (see deliverable 3).

---

## 4. Capability primitives (Plan §5)

These are the capability keys the `hasCapability()` check is written against. Phase 2 materialises the mapping.

### Agency-scoped capabilities

| Capability | Describes | Examples of gated actions |
|---|---|---|
| `manage_agency_settings` | Edit agency-level settings (subject to mutability — deliverable 4) | Change template variant; edit supported_locales; toggle agency-editable settings |
| `manage_agency_users` | Invite / remove / change role of `agency_memberships` | Invite staff; reassign role; remove staff; transfer ownership (owner-only; see §7) |
| `manage_agency_billing` | View + change plan, billing contact | **Owner only** in default mapping |
| `manage_agency_domains` | Add/remove `agency_domains` rows; trigger DNS verification | **Owner only** in default mapping |
| `edit_branding` | Update `agency_branding` fields | Change primary/accent colors, upload logo |
| `edit_navigation` | Modify `cms_navigation_items` for this tenant | Add storefront nav link |
| `edit_cms_content` | Create/edit `cms_pages`, `cms_posts`, tenant collections | Publish storefront page |
| `manage_roster` | Add/remove `agency_talent_roster` rows; edit overlays | Add talent; set featured; adjust sort override |
| `manage_inquiries` | Drive inquiry workflow — state transitions, messaging, coordinator primary slot | Acknowledge inquiry; send message; reassign primary coordinator |
| `manage_bookings` | Post-inquiry booking lifecycle | Confirm booking; invoke controlled adjustment flow |
| `create_offers` | Create/edit `inquiry_offers` + line items | Draft per-participant offer |
| `approve_internal_offers` | Agency-internal sign-off before client-facing send | Admin approval gate in multi-staff agency |
| `submit_hub_visibility` | Create `talent_representation_requests` rows with `target_type = 'hub'` (L44) | Submit talent to hub for platform review |
| `manage_agency_fields` | Create agency-local field definitions (Phase 6) | Add local field; manage select options |
| `view_private_client_data` | See notes/tags on `agency_client_relationships` + client contact fields beyond public projection | Coordinator access to full client record |
| `view_billing` | Read billing status, invoices | Owner sees by default; admin can view but not change |
| `view_analytics` | Read agency analytics views | Dashboard KPIs, funnel steps |
| `manage_translations` | Editor-level access to translation audit and overrides | Approve translated CMS page |

### Default role → capability matrix

Plan §5 (authoritative). `Y` = granted, `-` = denied.

| Capability | owner | admin | coordinator | editor | viewer |
|---|:-:|:-:|:-:|:-:|:-:|
| `manage_agency_settings` | Y | Y | - | - | - |
| `manage_agency_users` | Y | Y | - | - | - |
| `manage_agency_billing` | Y | - | - | - | - |
| `manage_agency_domains` | Y | - | - | - | - |
| `edit_branding` | Y | Y | - | Y | - |
| `edit_navigation` | Y | Y | - | Y | - |
| `edit_cms_content` | Y | Y | - | Y | - |
| `manage_roster` | Y | Y | Y | - | - |
| `manage_inquiries` | Y | Y | Y | - | - |
| `manage_bookings` | Y | Y | Y | - | - |
| `create_offers` | Y | Y | Y | - | - |
| `approve_internal_offers` | Y | Y | - | - | - |
| `submit_hub_visibility` | Y | Y | - | - | - |
| `manage_agency_fields` | Y | Y | - | - | - |
| `view_private_client_data` | Y | Y | Y | - | - |
| `view_billing` | Y | - | - | - | - |
| `view_analytics` | Y | Y | Y | Y | - |
| `manage_translations` | Y | Y | - | Y | - |

**Viewer** is the minimum non-trivial role: read-only dashboard. A user with no membership has no agency access at all.

---

## 5. Platform permission matrix (Plan §5)

Applied at the platform layer (not scoped to a specific agency). `Y (filtered)` means the data is readable but filtered to the support caseload or otherwise scoped.

| Action | super_admin | platform_admin | platform_reviewer | platform_support |
|---|:-:|:-:|:-:|:-:|
| Create / suspend / delete agency | Y | - | - | - |
| Enter agency workspace (assisted edit) | Y | Y | - | - |
| Enter agency workspace (read-only) | Y | Y | Y | Y |
| Manage global taxonomy | Y | Y | - | - |
| Manage global fields | Y | Y | - | - |
| Approve hub visibility | Y | Y | Y | - |
| Approve field promotions | Y | Y | Y | - |
| Manage platform settings | Y | - | - | - |
| Manage billing / plans | Y | - | - | - |
| View cross-agency data | Y | Y | Y | Y (filtered) |
| Emergency override (suspend, hide) | Y | - | - | - |
| View audit logs | Y | Y | Y | Y |

---

## 6. Support access modes (Plan §6, L11)

A platform user entering an agency workspace is a trust feature — agencies will care a great deal whether the platform can silently edit their business.

Three modes, each with banner colour, logging semantics, and thread-content rules.

### 6.1 Read-only support

- Roles: `platform_support`, `platform_reviewer`.
- Mutation: **none**.
- Banner: blue — "Support view — read only."
- All page views logged to `platform_audit_log`.

### 6.2 Assisted edit

- Roles: `super_admin`, `platform_admin`.
- Mutation: allowed, clearly inside agency context.
- Banner: amber — "Editing as Platform Admin in [Agency Name] — [Exit]."
- Every mutation logged with `actor_id` = platform user, `agency_id` = target.
- Destructive actions require a confirmation dialog.

### 6.3 Emergency override

- Roles: `super_admin` only.
- Use cases: suspensions, hiding content, urgent security fixes.
- Banner: red — "Emergency override — all actions logged."
- Reason **required** for every destructive action.
- Emits `platform_audit_log` entry with `severity = 'emergency'`.
- Agency owner notified after the action (unless the action itself is a security event that must not notify).

### 6.4 Context storage (L11)

`AgencyContext` is stored in a signed `impronta_agency_context` cookie, separate from the impersonation system. Entering an agency workspace does **not** change the user's identity — the actor still acts as themselves, inside the agency's data scope.

```ts
type AgencyContext = {
  agencyId: string;
  agencySlug: string;
  enteredAt: string; // ISO8601
  mode: 'read_only' | 'assisted_edit' | 'emergency_override';
  reason?: string;   // required when mode === 'emergency_override' and action is destructive
};
```

---

## 7. Messaging + thread visibility rules (Plan §6)

Trust-critical, not an implementation detail. Agencies will judge the platform by how conservatively this is handled.

### Thread types

- **Client thread** — agency staff ↔ client on an inquiry/booking.
- **Internal group thread** — agency staff + selected talent participants.
- **System messages** — engine-generated workflow annotations.

### Default visibility by mode

| Mode | Metadata (subject, participants, counts) | Workflow state + events | Client thread content | Internal group thread content | System messages |
|---|---|---|---|---|---|
| Read-Only Support | Visible | Visible | **Hidden by default** (subject / participant list only) | **Hidden by default** | Visible |
| Assisted Edit | Visible | Visible | Hidden by default; openable per-thread with explicit "Open thread" action (logged; reason optional but encouraged) | Same opt-in rule | Visible |
| Emergency Override | Visible | Visible | Openable with **required reason**; each open emits elevated audit + agency-owner notification | Same | Visible |

### Rules

1. Platform support always sees **that** messages exist (count, timing, participant list). Content is hidden by default.
2. Opening a thread's content is a discrete, audit-logged action: **one audit entry per thread opened per session**, not per message read.
3. Emergency-mode opens always log at `severity = 'emergency'` AND trigger agency-owner notification.
4. Platform support **cannot send messages** into any thread under any mode. Mutations in messaging are agency-only.
5. Agencies see a "Platform access log" in their admin (read-only) listing every platform user who opened any thread — who, when, which mode, what reason. Visible trust surface.
6. Hub coordinator on platform-queued `tenant_id IS NULL` inquiries (freelancer with no agency) is an agency-style operator, not platform support — normal thread rules apply.

### Legal / compliance bypass

Content access for legal compliance (court orders, law enforcement) goes through a separate documented channel, not the emergency-override UX. Audited at `severity = 'legal_hold'`. Not a normal support operation.

### Implementation cue (for Phase 2/3)

- A single server action `openThreadInSupportMode(threadId, mode, reason?)` is the only path for thread-content reads by platform users.
- RLS on `inquiry_messages` permits platform SELECT only when a matching open-thread audit row exists for the session, or when the action was invoked with `severity = 'emergency'` + reason.
- UI default: thread panel shows participant list + message count; content requires click-through + confirmation.

---

## 8. Coordinator capability layer (Plan §16.6, L23, L30)

Agency membership role and per-inquiry coordinator assignment are **two layers**:

- **Layer 1 — membership role + capabilities.** `manage_inquiries` makes a user **eligible** to be a coordinator. `coordinator` and `admin` roles both have this capability; `editor` and `viewer` do not.
- **Layer 2 — per-inquiry coordinator assignment.** A row in `inquiry_coordinators` with `role = 'primary' | 'secondary'` grants operational authority over that inquiry. Source of truth (L30). Any legacy `inquiries.coordinator_id` column is a denormalised cache only.

### Assignment rules

- Any staff with `manage_inquiries` can be primary; default on creation is rule-based (round-robin, load-based, or agency-owner fallback).
- Reassignment allowed by `admin`+; emits `inquiry_events` + `inquiry_action_log` rows.
- A single talent can be elected as lead coordinator for certain inquiries (group/team leads). That talent has scoped capabilities: can contribute to group thread, see limited offer info, cannot see other talent's private commercial terms.
- Platform users are **never** default coordinators. They act only via support modes.

### Workflow authority

- Only the **primary** coordinator can transition the inquiry through primary workflow states (`submitted → acknowledged → in_progress → offer_sent → booked|declined|cancelled`).
- Secondaries contribute to messages, offers, roster edits, approvals — but do not own primary state transitions.

---

## 9. Representation request capability (Plan §11.5, L41–L43)

Governed workflows for agency applications and hub visibility requests share a status vocabulary but different capability reviewers.

| Actor | Surface | Allowed capability on `representation_requests` |
|---|---|---|
| Agency admin (tenant-scoped) | Agency workspace | Review **agency applications** to that agency; accept/reject/withdraw. Cannot approve hub visibility unless product grants a delegated capability (default: **no**). |
| Hub / platform admin (`super_admin`, `platform_admin`) | Platform admin + hub review queues | Review hub visibility requests; moderation overrides; duplicate / identity decisions. |
| Platform reviewer (`platform_reviewer`) | Same as above + policy tools | Approve/reject hub visibility; cannot moderate (no emergency). |
| Platform moderator | Same + override tools | Override publication (hide, suspend, revoke, freeze) — with audit trail. |

**Locks:**

- L41 — Talent representation is request-driven. `requested → under_review → accepted | rejected | withdrawn`. Self-selection never auto-publishes.
- L42 — Agency roster/storefront visibility and hub visibility are **separate governed workflows**. Default: independent gates.
- L43 — Platform moderation may override any publication state on canonical or visibility layers, with audit.

---

## 10. Capability check precedence (Phase 2 implementation cue)

When Phase 2 writes the guard middleware, checks apply in this order. Earliest failure short-circuits.

1. **Auth** — user is authenticated. Otherwise `401`.
2. **Tenant resolution** — hostname + cookie + slug resolve to a concrete tenant OR an explicit platform context. Ambiguous → **fail hard** (Plan §22.7, L37). Never fall back to tenant #1.
3. **Membership / platform role** — for agency routes, user has an active `agency_memberships` row in the resolved tenant OR is in platform support mode for that tenant. For platform routes, user has the required `app_role`.
4. **Agency lifecycle gate** — if the resolved agency is `suspended` / `cancelled` / `archived`, only platform support/emergency modes proceed. (See deliverable 3.)
5. **Entitlement gate** — for features behind `agency_entitlements` flags, check the flag. Plan-gated settings require plan eligibility.
6. **Mutability gate** — for settings writes, check the setting's mutability class (deliverable 4).
7. **Capability check** — `hasCapability(userId, tenantId, capabilityKey)` returns true.
8. **Workflow state gate** — e.g. inquiry post-booking group-lock; closed inquiries read-only except platform emergency (Plan §16).

Guards that compose these are `requireTenantStaff()`, `requireAgencyRole(role)`, `requireCapability(capability)`. They write to `platform_audit_log` / `activity_log` on failure where relevant.

---

## 11. Open items

- **O4** — `agency_staff` enum migration strategy affects whether `agency_member` is a new enum value, a rename, or an additive role. Hold Phase 2 start until resolved.
- **O7** — Person as both talent AND agency staff affects how capabilities interact when the same `profiles.id` has both a talent profile and an agency membership.
- **Phase 6** — `agency_role_capabilities` table (vs hardcoded mapping) is a later decision if any agency requests per-role customisation. Defer unless a specific customer ask arises.

---

## 12. Change control

- Adding a new capability: append to §4, update the default matrix, cross-reference the Plan section that justifies it.
- Changing the default matrix for an existing capability: Decision Log entry in Plan §27, not silent.
- Adding a platform role: §2 + §5 row + explicit Plan amendment.
