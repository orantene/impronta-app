# Admin Consolidation Map — v2

**Status:** Draft v2 (supersedes v1). Aligns with the *Tulala SaaS Admin Dashboard UX Handout*.
**Scope:** This map covers the **workspace admin shell only** — the dashboard a tenant's team uses to run their workspace. It is **not** a universal admin map for every user type on the platform.

Out of scope for this document:
- Platform admin shell (Tulala HQ — designed as a separate system, Phase 5).
- Talent/member experience (lighter, profile-centric — separate shell, designed later).
- Public marketing site, sign-up flow, auth.

---

## 0. Locked architectural decisions

These are not up for re-debate inside Phase 1. They drive every mock that follows.

1. **One workspace admin shell.** Every tenant role lands on the same six parent pages. Per-role differentiation is **card visibility + drawer interactivity**, never a different page tree.
2. **Canonical route model:** `/{tenantSlug}/admin/*`. The slug is always present. The legacy unscoped `/admin/*` paths get redirected.
3. **Platform shell is separate.** It is not a super_admin view of `/admin`. It is its own chrome, its own navigation, on the app host. Out of scope for this map.
4. **`/admin/account` is renamed `/admin/workspace`.** The word "account" implied "my user account" — workspace meta is what actually lives there.
5. **My Profile is not a parent-page card.** It lives globally on the topbar avatar menu and opens as its own drawer. It is the only drawer with no parent card.
6. **Plan-locked cards are first-class.** A card hidden by a missing capability is invisible; a card gated by plan tier is **visible with a lock chip** and opens an upgrade modal. Locked ≠ hidden.
7. **Free starter-workspace owner is a first-class persona.** Not a degraded admin. A real workspace with a deliberately curated card set and visible locked opportunities.
8. **Talent / member experience is separate.** It reuses primitives (cards, drawers, sticky footers) but does not inherit this IA.

---

## 1. The six parent pages

| # | Slug                       | Purpose                                               |
|---|----------------------------|-------------------------------------------------------|
| 1 | `/{slug}/admin`            | Overview — what needs me right now                    |
| 2 | `/{slug}/admin/work`       | Inquiries + Bookings, single pipeline                 |
| 3 | `/{slug}/admin/talent`     | Roster, profiles, representation requests             |
| 4 | `/{slug}/admin/clients`    | Client list + relationships                           |
| 5 | `/{slug}/admin/site`       | Public site: identity, branding, design, pages, media |
| 6 | `/{slug}/admin/workspace`  | Team, plan, domain, settings, catalog, taxonomy       |

No tabs. No nested routes except one carve-out: `/{slug}/admin/work/[id]` for booking permalinks (renders a drawer-style page).

**My Profile** opens from the avatar menu in the topbar — drawer, no parent card, available to every authenticated user on every page.

---

## 2. Page-by-page card layout

Each page is a single-column header + grid of cards. Every card opens a drawer. Card kinds (per the handout §6):

- **Summary** — informational + opens drawer
- **Action** — clear CTA
- **Status** — health/progress/attention
- **Locked** — visible but plan-gated (chip + upgrade modal)
- **Placeholder** — coming-soon (use sparingly)

### 2.1 Overview

| Card                 | Type    | Capability                                          | Plan gate |
|----------------------|---------|-----------------------------------------------------|-----------|
| Today's pulse        | Status  | `view_dashboard`                                    | —         |
| Inquiries needing me | Status  | `view_dashboard`                                    | —         |
| Bookings this week   | Status  | `view_dashboard`                                    | —         |
| Recent talent activity| Summary| `view_talent_roster`                                | —         |
| Site health          | Status  | `agency.site_admin.identity.edit`                   | —         |
| Team activity        | Summary | `manage_memberships`                                | —         |

### 2.2 Work

| Card                 | Type    | Capability                                          | Plan gate |
|----------------------|---------|-----------------------------------------------------|-----------|
| Pipeline             | Summary | `view_dashboard`                                    | —         |
| Drafts & holds       | Summary | `coordinate_inquiry`                                | —         |
| Awaiting client      | Status  | `view_dashboard` (read), `send_client_offer` (act)  | —         |
| Confirmed bookings   | Summary | `view_dashboard`                                    | —         |
| Cancelled / archived | Summary | `view_dashboard`                                    | —         |
| New inquiry          | Action  | `create_inquiry`                                    | —         |

### 2.3 Talent

| Card                     | Type    | Capability                                       | Plan gate |
|--------------------------|---------|--------------------------------------------------|-----------|
| Roster grid              | Summary | `view_talent_roster`                             | —         |
| Representation requests  | Status  | `manage_talent_roster`                           | —         |
| Storefront visibility    | Summary | `publish_talent_to_storefront`                   | —         |
| Roster fields & catalog  | Summary | `manage_field_catalog`                           | —         |
| Add talent               | Action  | `manage_talent_roster`                           | —         |
| Hub publishing           | Locked  | `submit_hub_visibility`                          | **Network** |

### 2.4 Clients

| Card                  | Type    | Capability                                       | Plan gate |
|-----------------------|---------|--------------------------------------------------|-----------|
| Client list           | Summary | `view_client_list`                               | —         |
| Relationship history  | Summary | `view_client_list`                               | —         |
| Private client data   | Summary | `view_private_client_data`                       | —         |
| Filter configuration  | Summary | `manage_field_catalog`                           | —         |
| Add client            | Action  | `edit_client_relationship`                       | —         |

(Open question §8: is Clients a full parent page from day one, or a lighter card area until the CRM layer matures?)

### 2.5 Site

The most drawer-heavy page. The aesthetic system is already validated here.

| Card               | Type    | Capability                                       | Plan gate |
|--------------------|---------|--------------------------------------------------|-----------|
| Identity           | Summary | `agency.site_admin.identity.edit`                | —         |
| Branding           | Summary | `agency.site_admin.branding.edit`                | —         |
| Design system      | Summary | `agency.site_admin.design.edit`                  | **Agency** |
| Homepage           | Summary | `agency.site_admin.homepage.compose`             | —         |
| Pages              | Summary | `agency.site_admin.pages.edit`                   | —         |
| Navigation         | Summary | `agency.site_admin.navigation.edit`              | —         |
| Media library      | Summary | `agency.site_admin.media.upload`                 | —         |
| Translations       | Summary | `edit_cms_pages`                                 | —         |
| SEO & defaults     | Summary | `agency.site_admin.identity.edit`                | —         |
| Domain             | Summary | `manage_agency_settings`                         | **Studio** |
| Widgets / embeds   | Locked  | (cap TBD)                                        | **Studio** |
| API keys           | Locked  | (cap TBD)                                        | **Studio** |

(Open question §8: Domain on Site **and** Workspace as two entry points to one drawer, or pick one?)

### 2.6 Workspace

Replaces the cluster `settings + accounts + users + fields + taxonomy + locations`. **Profile is not here** — it's on the avatar menu.

| Card                    | Type    | Capability                                  | Plan gate |
|-------------------------|---------|---------------------------------------------|-----------|
| Team                    | Summary | `manage_memberships`                        | —         |
| Plan & billing          | Summary | `manage_billing`                            | —         |
| Domain                  | Summary | `manage_agency_settings`                    | **Studio** |
| Workspace settings      | Summary | `manage_agency_settings`                    | —         |
| Field catalog           | Summary | `manage_field_catalog`                      | —         |
| Taxonomy & locations    | Summary | `manage_field_catalog`                      | —         |
| Multi-agency manager    | Locked  | (cap TBD)                                   | **Network** |
| Danger zone             | Action  | `transfer_ownership`, `suspend_tenant`      | —         |

---

## 3. Plan-locked card system (first-class)

Locked cards are part of the IA, not an afterthought. They drive self-serve expansion.

### 3.1 Card states

| State        | Visible? | Interactive? | Visual cue                                |
|--------------|----------|--------------|-------------------------------------------|
| Available    | yes      | yes          | normal                                    |
| Read-only    | yes      | drawer opens read-only | normal, sticky footer hidden    |
| Locked (plan)| yes      | click → upgrade modal | lock icon + plan chip ("Studio")  |
| Hidden (cap) | no       | —            | —                                         |

**Rule:** capability missing → hidden. Plan tier missing → locked-visible. Don't hide and don't make people guess; show the opportunity, name the plan.

### 3.2 Plan tiers (working set)

Names from the handout: **Free / Studio / Agency / Network.** Real names and entitlements live in `web/src/lib/billing` once that module exists; this map only commits to the labels and the lock pattern.

### 3.3 Upgrade modal contract

Every locked card opens the same upgrade modal, parameterized by:
- current plan
- target plan(s) that unlock the feature
- one-line "why this matters" specific to the feature
- compact feature comparison
- CTA: self-serve upgrade button **or** "Talk to sales" depending on tier

### 3.4 Locked drawer (rare)

Some flows need the drawer to open even on a locked plan (e.g., to preview what's inside). When that happens the drawer renders read-only with a banner replacing the sticky footer ("This is a {Studio} feature — Upgrade to enable"). Default is to skip the drawer and go straight to the upgrade modal.

---

## 4. Per-role view (capability-gated)

Same shell, different cards rendered/interactive. Legend: ● visible & interactive · ○ visible read-only · ⓛ locked (plan) · — hidden.

### Overview
| Card                  | viewer | editor | coord | admin | owner |
|-----------------------|:------:|:------:|:-----:|:-----:|:-----:|
| Today's pulse         |   ●    |   ●    |   ●   |   ●   |   ●   |
| Inquiries needing me  |   ○    |   ○    |   ●   |   ●   |   ●   |
| Bookings this week    |   ○    |   ○    |   ●   |   ●   |   ●   |
| Recent talent activity|   ●    |   ●    |   ●   |   ●   |   ●   |
| Site health           |   —    |   —    |   —   |   ●   |   ●   |
| Team activity         |   —    |   —    |   —   |   ●   |   ●   |

### Work
| Card                  | viewer | editor | coord | admin | owner |
|-----------------------|:------:|:------:|:-----:|:-----:|:-----:|
| Pipeline              |   ○    |   ○    |   ●   |   ●   |   ●   |
| Drafts & holds        |   —    |   —    |   ●   |   ●   |   ●   |
| Awaiting client       |   ○    |   ○    |   ●   |   ●   |   ●   |
| Confirmed bookings    |   ○    |   ○    |   ●   |   ●   |   ●   |
| Cancelled / archived  |   ○    |   ○    |   ●   |   ●   |   ●   |
| New inquiry           |   —    |   —    |   ●   |   ●   |   ●   |

### Talent
| Card                     | viewer | editor | coord | admin | owner |
|--------------------------|:------:|:------:|:-----:|:-----:|:-----:|
| Roster grid              |   ○    |   ●    |   ●   |   ●   |   ●   |
| Representation requests  |   —    |   —    |   ●   |   ●   |   ●   |
| Storefront visibility    |   —    |   —    |   ●   |   ●   |   ●   |
| Roster fields & catalog  |   —    |   —    |   —   |   ●   |   ●   |
| Add talent               |   —    |   —    |   ●   |   ●   |   ●   |
| Hub publishing           |   ⓛ    |   ⓛ    |   ⓛ   |   ⓛ   |   ⓛ   |

### Clients
| Card                  | viewer | editor | coord | admin | owner |
|-----------------------|:------:|:------:|:-----:|:-----:|:-----:|
| Client list           |   ○    |   ●    |   ●   |   ●   |   ●   |
| Relationship history  |   ○    |   ○    |   ●   |   ●   |   ●   |
| Private client data   |   —    |   —    |   ●   |   ●   |   ●   |
| Filter configuration  |   —    |   —    |   —   |   ●   |   ●   |
| Add client            |   —    |   ●    |   ●   |   ●   |   ●   |

### Site
| Card               | viewer | editor | coord | admin | owner |
|--------------------|:------:|:------:|:-----:|:-----:|:-----:|
| Identity           |   —    |   —    |   —   |   ●   |   ●   |
| Branding           |   —    |   —    |   —   |   ●   |   ●   |
| Design system      |   —    |   —    |   —   |   ⓛ/●  |   ⓛ/●  |
| Homepage           |   —    |   ●    |   ●   |   ●   |   ●   |
| Pages              |   —    |   ●    |   ●   |   ●   |   ●   |
| Navigation         |   —    |   ●    |   ●   |   ●   |   ●   |
| Media library      |   —    |   ●    |   ●   |   ●   |   ●   |
| Translations       |   —    |   ●    |   ●   |   ●   |   ●   |
| SEO & defaults     |   —    |   —    |   —   |   ●   |   ●   |
| Domain             |   —    |   —    |   —   |   ⓛ/●  |   ⓛ/●  |
| Widgets / embeds   |   —    |   —    |   —   |   ⓛ/●  |   ⓛ/●  |
| API keys           |   —    |   —    |   —   |   ⓛ/●  |   ⓛ/●  |

(`ⓛ/●` means: shown locked on Free, interactive once the plan tier is met. Editor publishes? — see §8 open question on coordinator/editor publishing.)

### Workspace
| Card                  | viewer | editor | coord | admin | owner |
|-----------------------|:------:|:------:|:-----:|:-----:|:-----:|
| Team                  |   —    |   —    |   —   |   ●   |   ●   |
| Plan & billing        |   —    |   —    |   —   |   —   |   ●   |
| Domain                |   —    |   —    |   —   |   ⓛ/●  |   ⓛ/●  |
| Workspace settings    |   —    |   —    |   —   |   ●   |   ●   |
| Field catalog         |   —    |   —    |   —   |   ●   |   ●   |
| Taxonomy & locations  |   —    |   —    |   —   |   ●   |   ●   |
| Multi-agency manager  |   —    |   —    |   —   |   ⓛ    |   ⓛ    |
| Danger zone           |   —    |   —    |   —   |   —   |   ●   |

(My Profile is omitted from these tables — it lives on the avatar menu, available to every role.)

---

## 5. Persona walkthroughs

### 5.1 Free starter-workspace owner *(first-class persona)*

A real workspace, not a stripped admin. The free user logs in to a complete-feeling product with clear unlocks.

- **Lands on Overview.** Sees: Today's pulse, Recent talent activity, Site health. Inquiries/Bookings cards present but at zero state.
- **Talent:** Roster grid, Add talent. Hub publishing card visible **locked** (Network).
- **Clients:** present but lighter. Filter configuration **hidden** (no need until they have volume).
- **Site:** Identity, Branding, Homepage, Pages, Navigation, Media, Translations all available. Design system, Domain, Widgets, API keys **all visible locked** with plan chips. The page shows the full ambition of the product on day one.
- **Workspace:** Team, Plan & billing, Workspace settings, Field catalog, Taxonomy. Multi-agency manager **locked** (Network). Domain locked (Studio).
- **Tone:** "I can start now. I can see what grows later. Upgrading is one click."
- **Anti-pattern:** any "Upgrade required" wall before they can do real work.

### 5.2 Mature agency admin (Agency plan)

- All Site cards interactive except Multi-agency manager.
- All Workspace cards interactive except Plan & billing (owner-only) and Multi-agency manager.
- No locked chips visible on Site beyond Network features.
- **Tone:** the product feels like an operating system; almost nothing is locked.

### 5.3 Coordinator (any plan)

- Full Work + Talent ownership.
- Site: Homepage, Pages, Navigation, Media, Translations interactive. Identity/Branding/Design/Domain/SEO **hidden**.
- Workspace: nothing visible (except via avatar → My Profile).
- **Tone:** the product narrows to operations. No chrome they can't act on.

(Three personas mocked side-by-side validates the same shell holds up under different states — this is Phase 4 in the handout's mocking sequence.)

---

## 6. Drawer registry (deferred to Phase 2)

Phase 1 does not mock drawers. Listed here only so the surface area is visible. Numbers approximate.

**Peek:** Inquiry, Booking, Talent profile, Client profile, Activity.
**Edit:** Branding ✅, Identity, Design system, Domain ✅, Homepage compose, Pages, Navigation, Media, Translations, SEO, Field catalog, Taxonomy & locations, Workspace settings, Team ✅, Plan & billing ✅, Profile, Representation request review, Storefront visibility, Danger zone.
**Create:** New inquiry, New talent, New client.

(✅ = mocked in v1 prototype. Will be re-checked against Phase 1 shell rhythm before Phase 2.)

---

## 7. Route-by-route fate

Old paths (unscoped) → new paths (tenant-scoped).

| Current route                        | New location                                                |
|--------------------------------------|-------------------------------------------------------------|
| `/admin`                             | `/{slug}/admin` (Overview)                                  |
| `/admin/inquiries`                   | card on `/{slug}/admin/work`                                |
| `/admin/bookings`                    | card on `/{slug}/admin/work`                                |
| `/admin/clients`                     | `/{slug}/admin/clients`                                     |
| `/admin/directory/filters`           | card on `/{slug}/admin/clients`                             |
| `/admin/talent`                      | `/{slug}/admin/talent`                                      |
| `/admin/representation-requests`     | card on `/{slug}/admin/talent`                              |
| `/admin/site`                        | `/{slug}/admin/site`                                        |
| `/admin/site-settings/*`             | cards on `/{slug}/admin/site`                               |
| `/admin/translations`                | card on `/{slug}/admin/site`                                |
| `/admin/media`                       | card on `/{slug}/admin/site`                                |
| `/admin/settings`                    | cards on `/{slug}/admin/workspace`                          |
| `/admin/profile`                     | avatar menu drawer (no parent page)                         |
| `/admin/accounts`                    | Team card on `/{slug}/admin/workspace`                      |
| `/admin/users`                       | Team card on `/{slug}/admin/workspace`                      |
| `/admin/fields`                      | card on `/{slug}/admin/workspace`                           |
| `/admin/taxonomy`                    | card on `/{slug}/admin/workspace`                           |
| `/admin/locations`                   | card on `/{slug}/admin/workspace`                           |
| `/admin/analytics/*`                 | platform shell (out of scope here)                          |
| `/admin/ai-workspace/*`              | platform shell (out of scope here)                          |
| `/admin/docs/*`                      | platform shell (out of scope here)                          |
| `/admin/impersonation`               | platform shell (out of scope here)                          |
| `/admin/directory` (non-filters)     | cut — folded into Clients                                   |

Legacy unscoped paths get a one-release redirect to the tenant-scoped equivalent based on the user's active workspace, then deleted.

---

## 8. Open questions

These do **not** block Phase 1 mocks (parent shell + card grids). They block Phase 2 (drawer mocks). Decide before Phase 2.

1. **Coordinator publishing site copy.** Code today says `coordinator` has `publish_cms_pages` and `agency.site_admin.*.publish`. Handout flags this as worth re-validating. Confirm: keep coordinator-publishes, or restrict publish to admin+ and have coordinator stage like editor?
2. **Editor → admin draft review.** If editor stages and admin publishes, do we add a "Drafts pending review" card on Site for admin/owner? Or is the workflow async (chat/Slack)?
3. **Domain card placement.** Currently mapped to **both** Site and Workspace as two entry points to one drawer. Confirm or pick one.
4. **Clients as a full top-level page on day one** vs. a lighter card area until the CRM layer matures. Handout flags this as a product-owner call.
5. **Plan tier names + entitlement matrix.** This map uses **Free / Studio / Agency / Network** as working labels. Confirm names; confirm exact feature → tier mapping (currently best-guess on Domain=Studio, Design system=Agency, Hub/Multi-agency=Network).
6. **Plan & billing card for admin** — hidden entirely or visible read-only ("you're on Agency, owner manages billing")?
7. **Site health card scope** — does it monitor publish status, broken pages, missing SEO, all of the above?

---

## 9. What Phase 1 will deliver

Phase 1 mocks **only** the six parent pages as card grids. Goal: validate **shell rhythm, card hierarchy, locked-card language, free vs paid plan visibility, and consistency of the card system across all six pages.** No drawers.

Six mocks × at least 2 plan states each (Free starter + Agency mature). One additional comparison view: same Site page rendered for owner / coordinator / editor side by side, to prove the shell holds under role variation (this is the §5 walkthrough made visible).

After Phase 1 is approved, Phase 2 mocks the drawers in batches of ~6.

Phase 3 mocks the locked-card → upgrade-modal flow as its own focused pass.

Phase 4 mocks the three persona role-states side-by-side.

Phase 5 mocks the platform shell (separate document, separate map).
