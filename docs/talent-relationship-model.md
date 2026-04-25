# Talent / Agency / Hub / Visibility / Inquiry Ownership — Locked Product Logic

**Status:** Locked product logic. Author: founder. Date: 2026-04-25.

This document is binding. It supersedes any earlier informal assumption about the relationship between talent, agencies, hubs, visibility controls, and inquiry ownership. Any architectural change that conflicts with the rules here must be raised as a Decision-Log amendment before implementation.

The rules here are referenced by:
- `OPERATING.md` (governance pointer)
- The capability registry at [`web/src/lib/access/capabilities.ts`](../web/src/lib/access/capabilities.ts) (capabilities derived from these rules)
- The dashboard / UX redesign work (Track B.5)
- The future approval / claim workflow

---

## 0. Big picture — what this product is

Tulala is **not** a roster site, a directory, a profile system, a booking tool, or a site builder. It is a **multi-sided talent operating system**.

The core operational workflow at the center of every surface is:

> **request → inquiry → offer → booking**

Around that workflow lives an ecosystem of:
- **Talent** (the people being booked)
- **Agencies** (representation organizations with configurable join modes)
- **Hubs / talent pool sites** (criteria-based discovery destinations)
- **Free starter workspaces** (entry-level workspaces with a real workflow)
- **Clients** (the people sending requests)
- **Platform operators** (super_admin, future support/ops/reviewer roles)

This is a real product system, not a single-role dashboard. The UX must support:
- Overlapping identities (a person who is admin AND talent)
- Overlapping visibility (a talent appearing in multiple workspaces simultaneously)
- Different ownership of inquiries (the source URL owns the conversation)
- Different levels of control over talent placement and marketing visibility (per relationship type and exclusivity)

Designs that simplify this into "one workspace, one role, one talent list" are wrong by definition. Honest design is the only acceptable design.

---

## 1. Five concepts to keep separate

The product distinguishes five things that are easy to conflate. Don't.

| Concept | What it is | Carried by |
|---|---|---|
| **Workspace** (= tenant) | The thing a customer pays for. An agency, a hub, a free user's solo space. | `agencies` row |
| **Workspace membership** | A user's role inside a workspace (owner / admin / coordinator / editor / viewer). | `agency_memberships` row |
| **Talent profile** | The canonical record of a person who can be booked. | `talent_profiles` row |
| **Talent–workspace relationship** | A talent's presence in a workspace. Carries source, status, exclusivity, visibility, hub status. | `agency_talent_roster` row |
| **Inquiry** | A booking request that originated on a specific URL. Owned by the workspace whose URL received it. | `inquiries` row, `tenant_id` column |

A user can have **a workspace membership and a talent profile at the same time**. Owner ≠ talent is not an assumption — they often are the same person, especially on Free.

A talent can have **many talent–workspace relationships** at once: in two hubs, one agency, on a friend's free site. Each relationship is its own row.

---

## 2. Hubs vs Agencies — they are not the same

Hubs and agencies are both workspaces (rows in `agencies`, distinguished by `kind` / `template_key`), but their **join logic and ownership semantics differ**.

### Hubs

Hubs are **criteria-based ecosystem distribution**. Examples: model hub, musician hub, all-talent hub.

- **Join logic:** open by category. If a talent matches the hub's criteria, they can join (or be auto-accepted, or be promoted in by an agency).
- **Ownership of the talent's hub presence:** depends on the talent's other relationships. A free / non-exclusive talent owns it. An exclusively-represented talent's agency owns it.
- **No traditional gatekeeping:** hubs don't approve individual applications by taste — they apply criteria.
- **Inquiry behavior:** hubs receive inquiries on their URLs. Hub inquiries are owned by the hub. (Hub operators manage them or forward to the relevant agency — that's a future workflow.)

### Agencies

Agencies are **representation relationships with configurable join modes**. Examples: a model agency, a music management company.

- **Join logic:** depends on the agency's `roster_join_mode` setting. Three modes (see §3).
- **Ownership of the talent's presence:** depends on the join mode + whether the relationship is exclusive.
- **Gatekeeping:** an agency owner approves talent. Always.
- **Inquiry behavior:** agencies receive inquiries on their URLs. Owned by the agency.

### The architectural rule

Both are `agencies` rows. They share the table because most platform machinery (domains, members, inquiries, content) is identical. The differences live in:
- `agencies.template_key` (or a future `agencies.kind` enum) — distinguishes hub from agency
- The `agency_talent_roster` semantics applied differently per kind
- A future `hub_criteria` table (or column) defining what makes a talent eligible for a hub

For Phase 1: hubs and agencies share storage. UX surfaces them differently. Capabilities discriminate where needed.

---

## 3. Agency join modes

Every agency has a **`roster_join_mode`** setting that controls how talent enter the roster and how much self-service the talent retains.

| Mode | Who can be added | Talent visibility self-service | Talent can also be elsewhere |
|---|---|---|---|
| **`open`** | Anyone matching basic criteria; auto-approved on application. | Yes — talent manages own hub/agency presence. | Yes |
| **`open_by_approval`** *(default)* | Anyone can apply; agency owner approves each. | Yes — talent manages own hub/agency presence. | Yes |
| **`exclusive`** | Only via agency-owner-initiated invite or direct addition. | **No** — agency controls hub visibility and distribution. | **No** — talent cannot be in another agency or in hubs not approved by this agency |

The mode is a workspace setting, edited by agency owners/admins. Plan-gating of the available modes (e.g., "only Agency tier can use exclusive") is a separate product decision and is not assumed in this document.

---

## 4. Exclusivity rules

When a talent's relationship to an agency is exclusive (`agency_talent_roster.is_exclusive = true`):

1. **The talent has exactly one active exclusive agency relationship.** A new exclusive relationship cannot be created while another exists. The DB enforces this with a partial unique index.
2. **The talent cannot freely manage their own hub or agency presence.** All `talent.hub.*` and `talent.agency.apply` capabilities deny while exclusive.
3. **The agency owner controls hub assignment.** They decide which hubs the talent appears in. The capability `agency.roster.set_hub_visibility` is meaningful only on exclusive relationships (on non-exclusive, the talent owns it).
4. **The talent retains the right to exit the relationship.** `talent.agency.exit` is **never gated** on exclusivity. Once exited, the relationship status flips and all the constraints lift.
5. **Exiting an exclusive relationship returns the talent to the open ecosystem.** They can then apply to open agencies, join hubs they qualify for, and manage their own visibility per their next relationship's rules.

Non-exclusive relationships have none of these constraints — talent can be in many agencies + hubs concurrently.

### Transparency for non-exclusive talent

Agency owners with a non-exclusive talent on their roster can **see where else the talent is represented**: other agencies, other hubs. The capability is `agency.roster.view_external_relationships`. This is a transparency feature, not a control feature — it doesn't grant any modify rights to the other workspaces' rosters.

The data behind this is a cross-tenant read of `agency_talent_roster` filtered by `talent_profile_id`, returning non-PII fields (workspace name, kind, relationship status). RLS must allow this.

---

## 5. User ↔ talent dual identity (the "AlsoTalent" relationship)

A user (auth user, `profiles` row) can simultaneously be:
- The owner of a workspace (`agency_memberships.role = 'owner'`)
- A talent profile in that same workspace's roster (`agency_talent_roster.talent_profile_id` linked to a `talent_profiles` row whose `user_id` is theirs)
- A talent in someone else's workspace, hub, or free site

This is **especially common on Free**: a solo creator who runs their own workspace and is also the talent.

We call this the **"AlsoTalent" relationship** — the linked-identity state where the same human is both an operator (workspace member) and a talent (roster entry). The product must recognize and surface this explicitly.

### Architectural implication

- `app_role` (on `profiles`) is the user's primary navigation surface (`admin` / `talent` / `client`). It does not exclude them from other relationship types.
- `agency_memberships.role` is the tenant-management role.
- `talent_profiles.user_id` links a talent profile to its claiming user (when claimed; null when created on someone else's behalf and not yet claimed).
- The dashboard must NOT assume admin and talent are separate humans.
- The dual-identity check is: `agency_memberships(profile_id, tenant_id).status='active'` ∧ `talent_profiles.user_id = profile_id` ∧ `agency_talent_roster(tenant_id, talent_profile_id).status='active'`.

### UX implication

- **Workspace home** must surface "You are also shown in this roster" when AlsoTalent applies. The card or chip links to the user's own talent profile inside the workspace.
- **Talent surface** must surface "You also manage this workspace" → links to `/{slug}/admin`.
- **My Profile drawer** should expose both identities — the workspace-operator profile and the talent profile — with switching shortcuts.
- **Free-tier onboarding** must detect "user wants to manage AND be in the roster" and configure both seamlessly in one flow.
- **Roster page** in admin should show a small badge on the user's own roster row indicating "(you)".

---

## 6. Inquiry ownership = source URL (the most important rule)

**The workspace whose domain/URL received the inquiry owns the inquiry.** Always. No matter how many places the inquired-about talent appears, the inquiry belongs to the source.

Concretely:
- A client visits `agency-a.tulala.digital`, opens a talent's profile, sends an inquiry. Inquiry → tenant_id = agency A's id.
- The same talent is also on `hub-models.tulala.digital`. A different client inquires there. Inquiry → tenant_id = hub's id. **Two distinct inquiry threads, two distinct owners.**
- The talent sees both inquiries on their `/talent/inquiries` view. Each shows its source.
- Agency A sees only the inquiry from agency A's URL. They do NOT see the hub's inquiry.

This rule is already correct in the data model: `inquiries.tenant_id` carries the receiving workspace, and middleware sets `tenant_id` from the host header before the inquiry is created.

### What changes in the dashboard

- **Workspace inquiry list** continues to be tenant-scoped. No change.
- **Talent inquiry list** (`/talent/inquiries`) is multi-source. Each inquiry must show a "from {workspace name + kind}" badge so the talent knows which client conversation belongs where.
- **Inquiry detail** must surface source workspace prominently. Cross-workspace inquiry sharing (e.g., agency A asking hub for help on an inquiry hub received) is a future workflow, not Phase 1.

### What this rules out

- Routing an inquiry to "whichever agency the talent is primarily represented by." That violates source ownership. Don't do it.
- Showing one workspace's inquiries to another workspace because the talent overlaps. That's a privacy violation.

---

## 7. Multi-source inquiry flow

A direct consequence of §6: a talent may receive inquiries from many sources, each owned by a different workspace.

- Talent sees a unified inbox at `/talent/inquiries`, with source badging.
- Each individual inquiry thread is hosted in the **source workspace's** chat / messaging surface.
- The talent participates in each thread but is not the owner.
- The owner-workspace's coordinator manages the thread, sends offers, converts to bookings.

### Future: cross-source overlap awareness

A talent might receive two competing inquiries from two different workspaces for the same date. The talent's inbox shows both with source badges; the system flags the date conflict on the talent side. Each owning workspace coordinates within their own thread; no cross-workspace data leak.

This is **not** built in Phase 1, but the data model already supports it (each inquiry is independent, each has a `event_date`).

---

## 8. All tiers can create users / talent profiles

Any tier — including Free — can:
- Create user records (invite people)
- Add talent profiles
- Build a roster

Plan tiers gate **how many** (via `plan_limits.max_team_seats`, `max_active_talent`) and **what flags** (e.g., `is_exclusive`, custom domains, hub participation may have plan dependencies — TBD).

Plan tiers do **not** gate the basic creation capability. Free users frequently create profiles for friends who don't have laptops or technical know-how. Blocking that breaks the entry path.

The capability `agency.talent.create` is granted to coordinator + above on every plan. The capability `agency.talent.invite_to_claim` is granted to admin + above on every plan.

## 8a. Profile lifecycle states

A talent profile (and its workspace relationship) moves through a lifecycle that the dashboard must reflect honestly. The states below are properties of `talent_profiles` and `agency_talent_roster`, not of the talent's auth user.

| State | What it means | Visible publicly? | Visible in admin roster? |
|---|---|---|---|
| **Draft** | Profile created, not yet ready for visibility. Bio/media incomplete. | No | Yes (with badge) |
| **Invited** | Workspace created the profile on someone else's behalf and sent an invite-to-claim. | No | Yes (with status + invite link) |
| **Awaiting approval** | Workspace's `roster_join_mode='open_by_approval'` — talent applied, owner hasn't approved. | No | Yes (queue) |
| **Published** | Active in roster. Profile visible per `agency_visibility` setting. | Yes (per visibility) | Yes |
| **Claimed** | Talent has claimed the profile (`talent_profiles.user_id` set, `claimed_at` set). | Inherited from Published | Yes |
| **Verified** *(future)* | Platform-verified identity (deferred — Phase 2 trust feature). | Yes | Yes |
| **Inactive** | Hidden but not removed. Still in roster, not on public site. | No | Yes |
| **Removed** | Relationship terminated. Profile may still exist if claimed elsewhere. | No | No |

Every state has UI implications:
- **Draft / Invited / Awaiting approval** rows surface a primary action ("Finish profile" / "Resend invite" / "Approve").
- **Claimed vs unclaimed Published** rows look the same publicly but differ in admin: claimed profiles show a "(claimed by talent)" indicator, unclaimed profiles show "(invite to claim)" if applicable.
- **Inactive** is a one-toggle return to Published. Don't bury it.

These states are independent of (and orthogonal to) the **agency status** lifecycle (see `STATUS_RULES` in `lib/access/`) and the **subscription billing status**.

## 8b. Plan-ladder distribution rules

The plan ladder is meaningful — what each plan unlocks isn't arbitrary feature-gating, it's a real progression of distribution authority.

| Plan | Distribution model | Hub assignment | Branding | Representation |
|---|---|---|---|---|
| **Free** | Auto-assigned into default hub(s) matching their category. Cannot choose pool. | Auto, no manual control. | Tulala-branded site at `<slug>.tulala.digital`. | Self-only or close friends. |
| **Studio** | Manual hub/pool assignment within their category. Can opt out of default hubs. | Manual, per-talent toggle. | Stronger brand customization, embed widgets, API access. | Solo or small operator. |
| **Agency** | Full control over which hubs / pool sites their roster appears on. | Per-talent + workspace defaults; exclusive mode available. | Custom domain, full theming, multi-page CMS. | Real agency operation; team workflows. |
| **Network** | Hub-level distribution authority. Can operate own hubs. Multi-brand control. | Owns hubs; sets criteria for member talent. | Multi-domain, white-label, ecosystem-level. | Operates multiple agencies; cross-brand. |

**Free is the entry point, not a demo.** Free users get the real `request → inquiry → offer → booking` workflow. They get inquiries. They go through offers. They book. What they don't get is *control over distribution* — they're auto-assigned, not in the driver's seat. Each tier upward is a step in distribution authority, not a step in core-workflow access.

This ladder informs:
- Locked-card copy in the new shell ("Studio adds manual hub assignment", not "Studio adds inquiries")
- Settings organization (settings present-but-disabled at Free, with upgrade hints)
- The capability gating in `plan_capabilities` (Track C will populate per-plan grants from this ladder)

---

## 9. Approval / claim flow (deferred build, locked contract)

When a workspace creates a talent profile on behalf of someone else (a friend, a roster signing without the talent in the room), the talent eventually gets the chance to claim that profile.

The flow is **not built in Phase 1**, but the data model and capabilities reserve room for it:

1. **Profile created by someone else.** `talent_profiles.created_by_user_id` and `talent_profiles.user_id = null` (no claimer yet).
2. **Invite-to-claim sent.** Workspace admin sends an invite (email/link). `agency_talent_roster.talent_acceptance_status = 'pending'`.
3. **Talent receives invite, signs up / signs in.** Their auth user is created (or matched).
4. **Talent claims.** `talent_profiles.user_id = auth.uid()`, `talent_profiles.claimed_at = now()`. The talent now has read/edit access to their own profile (via the `talent` surface).
5. **Talent accepts the relationship.** `agency_talent_roster.talent_acceptance_status = 'accepted'`. The talent now has the appropriate self-service capabilities (per §4).
6. **Talent rejects.** `agency_talent_roster.status = 'removed'`, `talent_acceptance_status = 'rejected'`. The relationship terminates.

### Capabilities reserved for this flow

- `talent.profile.claim` — talent claims a profile someone else created
- `agency.talent.invite_to_claim` — admin sends the invite
- `agency.roster.create_unclaimed` — implicit in `agency.talent.create`; tracked via the `created_by_*` fields on talent_profiles

### What the data model needs (deferred migrations)

- `talent_profiles.claimed_at` (TIMESTAMPTZ, nullable) — when the user_id was attached
- `agency_talent_roster.talent_acceptance_status` (TEXT, enum: `pending | accepted | rejected`, default `accepted` for self-created relationships)
- `agency_talent_roster.invited_to_claim_at` (TIMESTAMPTZ, nullable)

These columns are deferred. The capabilities exist now so that callers reserved for this flow can be planned.

---

## 10. Conditional / relationship-gated capabilities

Some capabilities are **not role-granted** — they're **relationship-state-granted**. A talent's ability to manage their own hub presence isn't granted by their `app_role = 'talent'` alone; it's also conditional on whether they have an active exclusive agency relationship.

### Resolution rule

The access resolver runs the standard 10-step contract. For relationship-gated capabilities, **after** step 6 (role grants) and step 7 (plan grants), the resolver consults a relationship-state check specific to the capability. If the relationship state denies, the capability denies, even if role and plan grant.

The capabilities flagged with `gating: "relationship"` in `lib/access/capabilities.ts` need this extra evaluation. Track B.5 (or a follow-up) wires the relationship-state evaluators per capability. Until then, these capabilities exist in the registry but no caller depends on them.

### Capabilities in this class

- `talent.visibility.manage_self` — talent toggles own active/inactive. Denied while in an exclusive agency.
- `talent.hub.apply` — talent applies to a hub. Denied while exclusive.
- `talent.hub.leave` — talent removes self from a hub. Denied while exclusive (the agency owns the visibility).
- `talent.agency.apply` — talent applies to an open agency. Denied while exclusive.
- `talent.agency.exit` — talent leaves any agency. **Always granted** (this is the escape valve). The only relationship-gated capability with `gating: "always"`.
- `talent.profile.claim` — only the invited claimee can claim.
- `agency.roster.set_hub_visibility` — meaningful only on exclusive relationships. On non-exclusive, denied (talent owns it).
- `agency.roster.view_external_relationships` — meaningful only on non-exclusive. On exclusive, returns empty (the talent has no other relationships by definition).

### The "explain why" rule

When a relationship-gated capability denies, **the UI must explain the reason**, not just disable a control. Disabled-without-explanation is a UX failure.

Required pattern: every disabled relationship-gated control carries an inline explanation + an action path back to control. Examples:

| Situation | Bad UX | Good UX |
|---|---|---|
| Talent on exclusive relationship tries to toggle hub visibility | Greyed-out toggle, no copy | Disabled toggle + "**Managed by Acme Agency.** Your hub placement is set by your agency. Exit the agency to regain independent control." + "Exit agency" button |
| Talent on exclusive relationship tries to apply to another agency | Hidden button | Disabled button + "**You're in an exclusive relationship with Acme Agency.** Exit your current agency before applying elsewhere." |
| Free-tier workspace tries to deselect a default hub | Locked card | Locked card + "**Hub selection unlocks at Studio.** Free workspaces are auto-distributed to the default model hub." + "Compare plans" |
| Free-tier workspace tries to set roster mode to `exclusive` | Locked toggle | Disabled toggle + "**Exclusive representation requires Agency plan.**" + "Upgrade" |

The explanation copy must:
1. Name the cause specifically (the agency, the plan, the state)
2. Name the path back to control (exit agency / upgrade plan / claim profile / etc.)
3. Use the relationship's actual name where applicable (don't say "your agency" when you can say "Acme Agency")

---

## 11. Capability registry additions

The following capabilities are added to `lib/access/capabilities.ts` and are **locked product contracts**. Renaming is forbidden once shipped (per existing capability governance).

| Key | Category | Gating | Notes |
|---|---|---|---|
| `agency.settings.edit_join_mode` | team | role | Admin/owner. Sets `roster_join_mode`. |
| `agency.talent.create` | talent | role | Coordinator+. Create unclaimed profile. |
| `agency.talent.invite_to_claim` | talent | role | Admin+. Send claim invite. |
| `agency.roster.set_exclusive` | talent | role + relationship | Admin+. Only sets exclusive when both sides agree. |
| `agency.roster.set_hub_visibility` | talent | role + relationship (exclusive only) | Admin+. Manages hub presence on exclusive talent. |
| `agency.roster.view_external_relationships` | talent | role | Coordinator+. See where else this talent is rostered. |
| `talent.visibility.manage_self` | talent-self | relationship (non-exclusive) | Talent toggles own active/inactive. |
| `talent.hub.apply` | talent-self | relationship (non-exclusive) | Talent applies to a hub. |
| `talent.hub.leave` | talent-self | relationship (non-exclusive) | Talent leaves a hub. |
| `talent.agency.apply` | talent-self | relationship (non-exclusive) | Talent applies to an open agency. |
| `talent.agency.exit` | talent-self | always granted | The escape valve. |
| `talent.profile.claim` | talent-self | relationship (invited claimee only) | Claim a profile created by someone else. |
| `platform.hub.create` | platform | platform_role | super_admin only. |
| `platform.hub.set_criteria` | platform | platform_role | super_admin only. |

---

## 12. Data-model implications

The current schema mostly supports this model. Confirmed presence:
- `agencies` (workspace root) ✓
- `agency_memberships` (role per workspace) ✓
- `agency_talent_roster` (talent–workspace relationship; has `source_type`, `status`, `agency_visibility`, `hub_visibility_status`, `is_primary`) ✓
- `talent_profiles` (canonical talent record; has `user_id`, `created_by_agency_id`, `created_by_user_id_provenance`, `source_type`) ✓
- `inquiries.tenant_id` (source ownership) ✓

Reserved for future migrations (deferred but planned):
- `agencies.roster_join_mode` (TEXT enum: `open | open_by_approval | exclusive`, default `open_by_approval`)
- `agency_talent_roster.is_exclusive` (BOOLEAN, default `false`); partial unique index ensuring at most one active exclusive relationship per `talent_profile_id`
- `agency_talent_roster.talent_acceptance_status` (TEXT enum: `pending | accepted | rejected`, default `accepted`)
- `agency_talent_roster.invited_to_claim_at` (TIMESTAMPTZ, nullable)
- `talent_profiles.claimed_at` (TIMESTAMPTZ, nullable)
- A small `hub_criteria` table — keyed by hub `tenant_id`, defining auto-acceptance rules

These columns are not added in Phase 1. They're reserved here so that adding them later is additive and doesn't conflict with existing constraints.

### RLS implication: cross-tenant talent transparency

`agency.roster.view_external_relationships` requires reading `agency_talent_roster` rows for `talent_profile_id` X across multiple tenants. Today's `agency_talent_roster_staff_all` policy is `is_agency_staff()` (Phase 1) — broad. Phase 2 RLS hardening must add a special policy: workspaces sharing a talent can read each other's roster rows for that talent, returning only non-PII fields (workspace name, kind, status, visibility flags). This is a deferred RLS task.

---

## 13. UX implications for the dashboard restructure

Track B.5 (the new shell) must surface this model. Specific requirements:

### Talent surface (`/talent/*`)

- **Visibility & Distribution settings page.** Toggle active/inactive. List of hubs (with apply/leave buttons). List of agency relationships (with status + exit button). Banner when an exclusive relationship is active: *"Your distribution is currently managed by {Agency Name}. To regain control, exit this representation."*
- **My Inquiries.** Multi-source inbox with badges (`from: {workspace name}`).
- **Where I Appear** section. The talent's view of their own non-PII presence — agencies they're in, hubs they appear on. Editable per relationship rules.

### Workspace admin (`/{slug}/admin/*`)

- **Settings → Roster join mode.** `open` / `open_by_approval` / `exclusive`. Includes warning copy when switching to `exclusive` (existing relationships affected).
- **Roster page.** Each talent row shows:
  - Relationship status (active / pending / etc.)
  - Exclusivity badge (if applicable)
  - "Also at: {N other workspaces}" link (non-exclusive only) — opens a side panel listing the workspaces.
- **Talent detail.** Hub-visibility controls visible only on exclusive relationships. On non-exclusive, the controls show as "Managed by {talent name}" with a read-only display.
- **Inquiry list.** Source-aware (every inquiry on this workspace's URL is owned by this workspace; no cross-workspace bleed).

### Hub admin (deferred to Phase 2 hub features)

- **Criteria editor.** Define the rules under which a talent auto-qualifies.
- **Pending applications.** When `open_by_approval` (rare on hubs; may not exist).
- **Talent list.** Cross-agency view; each talent shows their representing agencies.

### Platform admin (`/admin/*`)

- **Hubs list.** Create / edit hubs. Set criteria.
- **Talent audit.** Resolve disputed exclusivity claims, view full relationship history (cross-tenant view).

---

## 14. What's locked vs deferred

### Locked now

- All concept definitions (§1, §2)
- Agency join modes and their semantics (§3)
- Exclusivity rules (§4)
- User-talent dual identity (§5)
- Inquiry ownership = source URL (§6, **most important**)
- Multi-source inquiry flow rules (§7)
- All-tiers-can-create rule (§8)
- Approval / claim flow contract (§9)
- Capability key names (§11) — added to the registry now, locked product contracts going forward

### Deferred (planned, not built yet)

- DB migrations for `roster_join_mode`, `is_exclusive`, `talent_acceptance_status`, `claimed_at`, `invited_to_claim_at`, `hub_criteria` table
- RLS policy widening for cross-tenant talent transparency
- The actual claim / invite-to-claim flow code path
- Hub criteria evaluator
- Talent self-service visibility UI
- Workspace settings UI for `roster_join_mode`
- Multi-source inquiry inbox on talent surface
- "Also at" badge on agency roster
- Conflict-detection on overlapping inquiries

These are scheduled into Track B.5 (UI/shell rebuild) and Phase 2 work (DB migrations + RLS hardening). Capability keys exist now so the surfaces can be wired against them when built.

---

## 15. Reference examples (the four canonical scenarios)

These four scenarios are the test cases the dashboard restructure is judged against. If a designer or developer can't tell which UI a given scenario produces, the design isn't ready.

### Example 1 — Free owner who is also a talent

A model signs up on Free. She creates her workspace (`<slug>.tulala.digital`). She adds herself as a talent profile (auto-claims since `talent_profiles.user_id = auth.uid()`). She invites three friends, who appear as Invited / Awaiting approval. She publishes herself; one friend claims and publishes; two friends remain Invited. The default model hub auto-includes her published profile (Free auto-distribution).

UI requirements:
- Workspace home shows "You are also shown in this roster"
- Roster shows mixed states (Published / Invited / Awaiting approval), each with appropriate primary action
- A "default hub" indicator on her own roster row showing she's discoverable in the model hub (read-only, since Free)
- Plan card / locked-card explains "Manual hub selection at Studio"

### Example 2 — Exclusive agency

A dancer joins an agency that's set to `exclusive`. The agency owner has full control over her distribution. She cannot manually toggle hub placement; she sees disabled toggles with "Managed by {Agency Name}." She retains the right to exit. After exiting, she returns to the open ecosystem and can apply to open agencies / hubs again.

UI requirements:
- Talent visibility settings page: prominent banner "Your distribution is currently managed by {Agency Name}"
- All hub toggles disabled with explanation
- Apply-to-agency button disabled with explanation
- "Exit agency" button always enabled, with a confirmation flow
- Agency-side: roster row for this dancer shows exclusive badge; agency owner has full hub-visibility controls

### Example 3 — Non-exclusive multi-representation

A musician joins two non-exclusive agencies and a music hub. Each agency can see where else the musician is represented (via `agency.roster.view_external_relationships`). The musician manages her own visibility settings.

UI requirements:
- Talent visibility settings: hub toggles enabled; agency list shows both relationships with exit buttons each
- Each agency's roster row for this musician shows "Also at: {N other workspaces}" — clicking opens a side panel listing the other workspaces (non-PII: name, kind, status)
- The hub admin sees the musician with "Also represented by: 2 agencies" indicator

### Example 4 — Multi-source inquiry

A client discovers a talent on a hub site (`hub-models.tulala.digital`) and sends an inquiry. A different client discovers the same talent on an agency site (`acme-agency.tulala.digital`) and sends a different inquiry. Both inquiries reach the talent's unified inbox.

UI requirements:
- Talent's `/talent/inquiries` lists both, with source badges (`from: hub-models` / `from: acme-agency`) and distinct visual chips per workspace
- Each inquiry detail surfaces source workspace prominently
- The hub's admin sees only the hub-originated inquiry; the agency's admin sees only the agency-originated one (no cross-workspace bleed)
- If the two inquiries have overlapping dates, the talent's view flags the conflict; neither workspace can see the other's inquiry to resolve the conflict (privacy)

---

## 16. Reference

This document is the canonical source for these rules. If you see code, copy, or schema that conflicts, raise it as a Decision-Log amendment before fixing — don't silently re-interpret.

The user's full statement that established this logic is in the session transcript dated 2026-04-25, including both the architecture-facing brief and the UX-designer-facing brief — both incorporated here.
