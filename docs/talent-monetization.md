# Talent Subscriptions & Premium Talent Pages — Architecture Direction

**Status:** Architecture direction (not yet locked at the implementation level). Author: founder (product direction); architecture written 2026-04-25.

This document is **directional** — it picks an architectural lane and reserves the right shapes so future implementation isn't blocked. It is not a fully locked spec; specific column names and migration shapes can shift during build. What's locked is the *direction*: how the third commercial lane integrates with the existing model without forking the data architecture.

This doc is part of the locked-product-logic set referenced from `OPERATING.md` §12. It complements:
- [`docs/talent-relationship-model.md`](talent-relationship-model.md) (talent / agency / hub / inquiry-ownership rules)
- [`docs/transaction-architecture.md`](transaction-architecture.md) (v1 payment model)

The user's directive: *"This is not a build-now request. It is an architecture-awareness request. I want this included in the execution plan thinking early."* This doc is the response.

---

## 1. Tulala's three commercial lanes

After this directive, Tulala has three independent revenue lanes — they must coexist cleanly, not fork the codebase.

| Lane | What's monetized | How | Customer |
|---|---|---|---|
| **1. Workspace subscriptions** | Workspace operating capacity (seats, custom domain, plan capabilities, hub authority) | Recurring fee | Agency / Studio / Network owner |
| **2. Transaction fees** | Successful bookings | Platform fee % per transaction | Whoever is the source workspace owner of the booking |
| **3. Talent subscriptions** *(new)* | Premium personal page (richer presentation, custom domain, extra modules) | Recurring fee | Individual talent |

Lane 1 is the existing `plans` (workspace subscriptions) — `free / studio / agency / network`. Lane 2 was just locked in [`transaction-architecture.md`](transaction-architecture.md). Lane 3 is what this doc establishes.

The architectural test: **adding a fourth lane later (e.g., featured-listing fees, hub-membership dues) should require zero refactor.** If our model is right, more lanes = more rows in shared tables, not more parallel systems.

---

## 2. The talent product ladder

Three tiers, names TBD; the architecture treats them as plan keys regardless of final naming.

| Tier (working name) | Includes | Doesn't include |
|---|---|---|
| **Talent Basic** *(default; included free)* | Standard profile in agency rosters / hubs / discovery. Inquiry flow. Default Tulala-hosted personal page at `<slug>.tulala.digital` with a basic layout. | Custom domain. Premium templates. Video/audio embeds. Advanced layouts. SEO controls. |
| **Talent Pro** | Pro presentation: richer layout, video/audio embeds, social links surfacing, better media gallery, stronger portfolio presentation. Personal page upgraded. | Custom domain. Page-builder. Multi-page. |
| **Talent Portfolio** *(or "Signature")* | Custom domain. Guided one-page builder. Multi-template choice. SEO controls. Branded mini-site feel. | Multi-tenant operator features (memberships, etc.) — those are workspace-tier territory. |

Public naming may change. The plan keys (`talent_basic`, `talent_pro`, `talent_portfolio`) are stable internal contracts going forward.

---

## 3. Architectural option chosen — solo workspace approach

**The directional decision: a talent's premium page is hosted on a "solo workspace" — an `agencies` row with `kind='talent_solo'` that the talent owns.** The talent subscription is just that workspace's `plan_tier` set to one of the talent-audience plan keys.

### What this means

- **Every talent automatically has a solo workspace.** Created at `talent_profiles` creation time (or on first claim). Default plan: `talent_basic`. Default URL: `<slug>.tulala.digital`.
- **Upgrading is a plan change on that workspace.** `talent_basic → talent_pro → talent_portfolio`. Same `agency_subscriptions` mechanism (when Stripe lands) handles billing.
- **Premium-only features are gated by `plan_capabilities` on the solo workspace.** Custom domain, advanced templates, video embeds — all keyed to the plan.
- **Custom domain is just an `agency_domains` row** with `tenant_id` = the talent's solo workspace, `kind='custom'`. Reuses every existing piece of domain infrastructure (DNS verification, SSL, middleware host resolution, RLS).
- **Inquiries on the talent page are owned by the solo workspace.** Source-ownership rule applies as-is. The talent IS the operator of that source.
- **Transactions on the talent page flow through the standard transaction architecture.** Receiver-selection on a solo-workspace booking has fewer candidates (the talent themselves, since there are no other staff), but the same code path.

### Why this lane (and not a separate `talent_pages` entity)

Three reasons:

1. **Reuse over invention.** We already have `agencies` + `agency_domains` + `agency_memberships` + `agency_branding` + `cms_pages` + the access module + the transaction model. A separate `talent_pages` table forks the architecture: two of every concept (two domain registries, two plan systems, two RLS surfaces). Painful, error-prone, no clear win.
2. **AlsoTalent already handles dual-presence.** Today's "Free workspace owner who is also a talent" pattern (see `talent-relationship-model.md` §5) is *exactly* this shape. We're generalizing the always-on case: every claimed talent has a solo workspace; some upgrade.
3. **Source ownership stays clean.** If the talent page were its own entity outside the workspace model, source-ownership rules would need a parallel implementation. With the solo-workspace approach, every URL belongs to a tenant; every inquiry belongs to a workspace; the rules already in `talent-relationship-model.md` §6 apply unchanged.

### What this doesn't mean

- The talent's surface (`/talent/*`) is **not** the same UI as the workspace admin (`/(workspace)/[slug]/admin`). Talents don't navigate to `/admin` to upgrade their page — the talent surface adds page-management routes (`/talent/page`, `/talent/page/preview`, etc.). Behind the scenes those routes operate on the talent's solo workspace.
- A solo workspace **cannot have other members**. The talent is the sole owner. `agency_memberships` for a `kind='talent_solo'` workspace has at most one row, role=`owner`. Trigger-enforced.
- A solo workspace **cannot host other talents**. The roster has at most one talent: the owner. Trigger-enforced.

### Alternatives I considered and rejected

- **Separate `talent_pages` table + `talent_subscriptions` table.** Two parallel systems for what is structurally the same thing (a tenant with a public surface and a plan). Increases code surface 2×. Rejected.
- **Hosting premium-page features inside `talent_profiles` as JSONB columns.** Can't host a custom domain there. Forks domain logic. Plan-gating becomes a per-column concern. Rejected.
- **Premium talent page as an extension of an agency.** Couples the talent's monetization to the agency relationship. The user explicitly said the talent owns this. Rejected.

---

## 4. Data model implications

The schema is already 90% there. What changes:

### 4.1 New `agencies.kind` value: `talent_solo`

Today's `agencies` rows have `kind` derived from `template_key` (or future explicit enum). Add `'talent_solo'` as a recognized kind alongside `'agency' | 'hub' | 'marketing' | 'app'`. (See `agency_domains.kind` for the parallel concept on the domain side.)

A trigger / constraint enforces solo-workspace invariants on `kind='talent_solo'` rows:
- At most one active `agency_memberships` row per solo workspace, role=`owner`
- At most one active `agency_talent_roster` row per solo workspace
- The owner of the membership must equal the user_id of the rostered talent (i.e., it's their own workspace)

### 4.2 Plan catalog — new `audience` field

`plans.audience` (TEXT, CHECK: `'workspace' | 'talent'`) distinguishes which kind of tenant a plan applies to. Existing 5 plans get `audience='workspace'`. Three new plans:

```
plans:
  ('talent_basic',     audience='talent', rank=0,  monthly_price_cents=0,    is_self_serve=true,  is_visible=false)
    -- Default for every talent. Free. Hidden from pricing page (it's the
    -- baseline; users don't "pick" it explicitly).
  ('talent_pro',       audience='talent', rank=1,  monthly_price_cents=900,  is_self_serve=true,  is_visible=true)
  ('talent_portfolio', audience='talent', rank=2,  monthly_price_cents=2900, is_self_serve=true,  is_visible=true)
```

Pricing values are placeholders; final pricing TBD.

`agencies.plan_tier` for solo workspaces references one of the talent-audience plans. The same FK constraint covers both audiences.

### 4.3 No new tables

This is the strongest signal that the architectural choice is right. The premium-talent-page lane requires:
- Zero new tables
- Zero new RLS surfaces
- Zero new domain-resolution paths
- Zero new payment infrastructure

Just data: new plan rows, new `kind` value, a few invariant triggers, and the auto-creation of a solo workspace at talent claim time.

### 4.4 Auto-provisioning solo workspaces

When a `talent_profiles` row is created and claimed (`talent_profiles.user_id` set), a solo workspace is auto-provisioned:

```
INSERT INTO agencies (slug, display_name, kind, plan_tier, status)
  VALUES (<derived-from-talent-name>, <talent-display-name>, 'talent_solo', 'talent_basic', 'active');

INSERT INTO agency_memberships (tenant_id, profile_id, role, status)
  VALUES (<new-workspace-id>, <talent-user-id>, 'owner', 'active');

INSERT INTO agency_talent_roster (tenant_id, talent_profile_id, source_type, status, agency_visibility, is_primary)
  VALUES (<new-workspace-id>, <talent-profile-id>, 'platform_assigned', 'active', 'site_visible', true);

INSERT INTO agency_domains (tenant_id, hostname, kind, status, is_primary)
  VALUES (<new-workspace-id>, '<slug>.tulala.digital', 'subdomain', 'active', true);
```

Slug collisions: append a numeric suffix (`maria-2`, `maria-3`).

For an unclaimed talent profile (created by someone else), auto-provisioning runs at claim time, not at create time. Pre-claim, the talent has no public personal page on Tulala — they appear only in the creating workspace's roster.

### 4.5 Existing talent-monetization-related capabilities (already in the registry)

The capabilities I added in §11 below complement existing ones already in the registry:
- `talent.profile.claim` (already there) — when claimed, the auto-provisioning runs
- `talent.visibility.manage_self` (already there) — gated by relationship state
- The premium-page-specific capabilities are listed in §11 below

---

## 5. Plan namespace + audience-aware presentation

Today's `getVisiblePlans()` / `getUpgradePathFromPlan()` functions in `web/src/lib/access/plan-catalog.ts` need an `audience` parameter so the right plans surface in the right UIs:

```ts
getVisibleWorkspacePlans(): PlanDef[]   // for marketing pricing page
getVisibleTalentPlans(): PlanDef[]      // for talent self-upgrade UI
getUpgradePathFromPlan(currentKey): PlanDef[]
   // audience derived from the current plan's audience field;
   // returns same-audience plans with higher rank
```

A workspace owner browsing the upgrade modal sees workspace plans only. A talent browsing their own upgrade flow sees talent plans only. They never mix.

Special plans (e.g., `legacy`) keep their existing `audience='workspace'` (legacy was for the original Impronta workspace).

---

## 6. Source-ownership extension

The most important rule from `talent-relationship-model.md` §6 remains unchanged: **the workspace whose URL received the inquiry owns it.** With talent-solo workspaces in play, the rule extends naturally:

- Inquiry on `acme.tulala.digital` → owned by Acme Agency
- Inquiry on `hub-models.tulala.digital` → owned by the Models Hub
- Inquiry on `maria-dance.tulala.digital` → owned by Maria's solo workspace
- Inquiry on `mariadance.com` (Maria's custom domain) → owned by Maria's solo workspace (same tenant; resolved via `agency_domains`)

The same talent can have all four inquiry sources active simultaneously. Each is independent. Each transaction belongs to its source.

When Maria upgrades to `talent_portfolio` and connects `mariadance.com`, that's one new `agency_domains` row pointing to her solo workspace. Middleware host resolution handles it identically to any other custom domain. No new code.

---

## 7. Custom domain integration

A talent's custom domain is **just an `agency_domains` row** where `tenant_id` is the talent's solo workspace.

```
agency_domains:
  hostname: 'mariadance.com'
  kind: 'custom'
  tenant_id: <maria's solo workspace id>
  status: 'pending' → 'dns_verification_sent' → 'verified' → 'ssl_provisioned' → 'active'
```

The DNS / SSL / verification machinery is the same as for an agency's custom domain. The only difference is plan-gating: `talent_portfolio` plan grants the `agency.site_admin.identity.edit` (or a new `talent.page.connect_custom_domain` capability — see §11) that allows custom-domain attachment. Lower talent tiers can't add a custom domain.

`max_custom_domains` plan-limit: `talent_basic`=0, `talent_pro`=0, `talent_portfolio`=1.

### What about an agency's exclusive talent who also has a Portfolio page?

This is the interesting one. Per `talent-relationship-model.md` §4, an exclusive agency controls the talent's hub/distribution visibility. But the talent's solo workspace and personal premium page are owned by the talent, not the agency.

**Architectural answer: exclusivity does not extend to the talent's solo workspace.** A talent on `roster_join_mode='exclusive'` at Acme Agency:
- Cannot freely add themselves to other agencies (per existing rules)
- Cannot freely add themselves to other hubs (per existing rules)
- **Can** continue to operate their solo workspace and premium page, including connecting their own custom domain

Exclusivity is about **agency representation**, not about talent identity ownership. Tulala does not let an agency contract revoke a talent's right to host their own page. (Agencies can negotiate that off-platform; the platform doesn't enforce it.)

This is a meaningful product position. The user can override during prototype review if a different stance is preferred — but the directional default is: **talent always owns their solo workspace, regardless of agency relationship.**

---

## 8. Coexistence with agency / hub representation

The same talent simultaneously:
- Has a `talent_profiles` row (canonical identity)
- Has a solo workspace (always; auto-provisioned at claim)
- Is rostered in 0..N agencies (`agency_talent_roster` rows in those workspaces)
- Is in 0..N hubs (`agency_talent_roster` rows in hub workspaces)
- May have a custom domain on their solo workspace (if `talent_portfolio`)
- May have inquiries flowing in from any of those surfaces independently

The architecture supports all of this without modification because every surface is a workspace, every relationship is an `agency_talent_roster` row, every inquiry is owned by the source workspace.

The talent's `/talent/*` UI aggregates across these — multi-source inquiry inbox, "you're rostered at: …" lists, "your premium page is at: …" — using cross-workspace queries scoped to the talent's identity (`talent_profiles.user_id = auth.uid()`).

The agency's roster row for this talent shows "Also at: <other workspaces>" per `talent-relationship-model.md` §4 (non-exclusive only). This list will now include the talent's solo workspace too, surfaced as "Maria's personal page" — the relationship type makes it visually distinct from another agency's representation.

---

## 9. Transaction integration

A booking that originates on the talent's solo workspace (someone inquired through their personal premium page):
- `inquiries.tenant_id` = solo workspace
- `agency_bookings.tenant_id` = solo workspace
- `booking_transactions.source_tenant_id` = solo workspace
- Receiver-selection candidates per `transaction-architecture.md` §4.2: agency-level account (the talent's own, since they own the workspace) + the talent's profile-level payout account (also them) + the talent's `talent`-typed payout account (also them)
- All three options are the same person — UI should consolidate ("This is you") rather than show three separate identical-looking rows
- Platform fee applies per the solo workspace's plan (e.g., `talent_pro` might have a different fee than `talent_portfolio`)

The transaction architecture handles this without modification. The UI consolidation is a presentation concern, not an architecture concern.

### Open question — fee structure for talent-tier transactions

Should `talent_*` plans have different `platform_fee_basis_points` than `workspace` plans? Probable yes (talent tiers are paying $9-$29/mo and may not absorb the same % as a $149/mo agency tier). This is a pricing decision, not an architecture decision — `platform_fee_basis_points` is per-plan, so each talent plan can have its own value.

---

## 10. UX implications

### Talent surface (`/talent/*`)

Existing talent surface gains:
- **Premium page editor** (`/talent/page`) — visible on `talent_pro+`; gated copy/locked-card on `talent_basic`
- **Page templates** (`/talent/page/templates`) — only on `talent_portfolio`
- **Custom domain** (`/talent/page/domain`) — only on `talent_portfolio`
- **Subscription / billing** (`/talent/account/billing`) — visible always; current tier + upgrade CTA
- **Multi-source inquiry inbox** (existing per `talent-relationship-model.md` §6, now with talent-solo-workspace inquiries appearing alongside agency/hub ones)

### Premium page itself (the public-facing surface)

- Default URL: `<talent-slug>.tulala.digital`
- Custom domain (Portfolio): the talent's own
- Rendered by the same `(public)` route group that renders agency public sites — it's just another tenant
- Templates and modules selected from `cms_sections` on the solo workspace
- Inquiry CTA hits the same inquiry creation flow, scoped to the solo workspace

### Workspace admin (`/(workspace)/[slug]/admin`)

For agency owners viewing their roster:
- Each rostered talent's row may show "Also has personal page at: <slug>.tulala.digital" (or custom domain when set)
- For non-exclusive: the row shows the talent's own page in the "Also at:" list
- Visual differentiation: personal page entries render with a "personal page" icon, distinguishing from "represented by another agency"

### Pricing surfaces

- Marketing pricing page (`/pricing`) shows **workspace plans only** (`getVisibleWorkspacePlans`)
- Talent self-upgrade modal shows **talent plans only** (`getVisibleTalentPlans`)
- Comparison logic (which features unlock at which tier) is plan-driven and audience-aware

---

## 11. Capability keys

Reserved now as locked product contracts. Most have no callers in v1 — the prototype's premium-page placeholder UI can reference them as it gets built.

| Key | Category | Gating | Granted to |
|---|---|---|---|
| `talent.subscription.upgrade` | billing | relationship | Talent who owns the solo workspace |
| `talent.subscription.downgrade` | billing | relationship | Same |
| `talent.page.edit` | site | relationship | Same (when plan permits, i.e. `talent_pro+`) |
| `talent.page.publish` | site | relationship | Same |
| `talent.page.set_template` | site | relationship | Same (when plan permits, i.e. `talent_portfolio`) |
| `talent.page.enable_module` | site | relationship | Same (when plan permits) |
| `talent.page.connect_custom_domain` | site | relationship | Same (when plan permits, i.e. `talent_portfolio`) |
| `platform.talent_plans.configure` | platform | platform_role | super_admin |

8 new capability keys. Registry: 67 → 75.

The relationship gate for these is: caller has an active `agency_memberships(role='owner')` row in the talent's solo workspace, and the solo workspace's `plan_tier` permits the action. The plan-gate piece is part of normal `plan_capabilities` checking once plan-capability enforcement turns on (Track C).

---

## 12. Out of scope for v1

Same simplification logic as the transaction architecture: ship narrow, grow without retrofit.

- **Multi-page mini-site for talent.** v1 Portfolio = one page (with sections). Multi-page is later.
- **Talent-side e-commerce / direct booking.** Booking still goes through the inquiry/offer/coordinator flow. No "buy now" button bypassing it.
- **Talent-page analytics dashboard.** Reserved by the existing analytics module; talent-side analytics surface is later.
- **Per-region pricing for talent plans.** USD-only at launch.
- **Talent referrals.** Distinct concern; later.
- **Affiliated-talent partial-page sharing.** Bands sharing one page across multiple users — interesting case but later.
- **Auto-claiming when a talent appears in multiple workspaces.** v1: claim happens once via the existing claim flow.
- **Talent-tier-specific payment provider rules.** All providers per the transaction architecture work for any audience.

---

## 13. Reference scenarios

### Scenario 1 — Free-tier dancer with a personal Tulala page

A dancer signs up. She has a `talent_profiles` row (claimed; `user_id` set). A solo workspace is auto-provisioned at `marial.tulala.digital` with `plan_tier='talent_basic'`. Her personal page is the basic-template render of her profile.

She isn't rostered in any agency. She's auto-included in the default model hub (per Free distribution rules, see talent-relationship-model.md §8b). Inquiries on her personal page → her solo workspace. Inquiries on the model hub's URL → owned by the hub.

She doesn't pay anything. She's the entire customer of `talent_basic`.

### Scenario 2 — Studio-tier band with a Pro page

A band on `talent_pro`. They have a Tulala-hosted page at `chordgrid.tulala.digital` with rich layout — Spotify embeds, YouTube videos, upcoming shows, social links. They're not rostered anywhere else.

They pay $9/mo (placeholder). The premium-page features are unlocked because their solo workspace's `plan_tier='talent_pro'` includes the relevant capabilities.

Booking inquiries arrive through their page. Source-ownership rules → their solo workspace owns each inquiry. Receiver = themselves (the workspace owner). Standard transaction flow.

### Scenario 3 — Agency-rostered model with a Portfolio page

A model is rostered (non-exclusive) at Acme Agency. She's also a `talent_portfolio` subscriber on her own. Her solo workspace has a custom domain `vivianrose.com`.

She has THREE active surfaces:
- `acme.tulala.digital/t/vivian-rose` (Acme's roster card linking to a profile view scoped to Acme)
- `vivianrose.com` (her solo workspace, custom-domain, rich premium page)
- (any hub she also appears in)

Three independent inquiry surfaces. Three independent source-ownership contexts. Acme can see "Also at: Vivian's personal page" in their roster view per the non-exclusive transparency rules. Vivian's own talent surface aggregates inquiries from all sources.

### Scenario 4 — Exclusive talent with a personal page

A dancer on an exclusive relationship at Acme Agency. Her hub presence is fully agency-controlled. But she also subscribes to `talent_pro` for her personal page at `eladance.tulala.digital`.

Per §7's directional answer: **the personal page is hers**. Acme Agency controls hub distribution but does not control her solo workspace. Inquiries on her personal page belong to her solo workspace; she manages them; she is the receiver. Acme is unaffected by this surface.

If Acme's contract with the talent prohibits running a personal page, that's an off-platform enforcement matter. Tulala doesn't model it.

This is the **scenario most likely to draw founder feedback** — please confirm or override the directional default before any UI starts implying it.

---

## 14. Open questions for product

These are decisions I'm flagging for explicit founder ratification before implementation. The architecture works either way — the chosen direction influences UX copy and minor capability gating but not the underlying schema.

1. **Confirm: exclusively-represented talent retain solo-workspace ownership.** §7's directional default. If you want exclusivity to optionally extend to the personal page (i.e., the agency can lock it), say so — that adds a `agency_talent_roster.controls_personal_page` flag and gating on `talent.page.*` capabilities for affected talents.

2. **Talent-plan pricing.** Placeholder values used here ($9/mo, $29/mo). Final pricing TBD before billing wiring.

3. **Custom-domain availability tier.** Today: only `talent_portfolio`. Alternatives: `talent_pro` also gets one (matching workspace `agency` plan). Pricing decision.

4. **Default talent-page URL pattern.** Today: `<slug>.tulala.digital`. Alternative: `<slug>.talents.tulala.digital` (sub-subdomain) to visually distinguish solo-workspace pages from agency pages. Architecturally identical — middleware doesn't care; just a routing convention.

5. **Auto-provisioning trigger.** When does the solo workspace get created — at `talent_profiles` creation, or only at claim? Current direction: at claim (unclaimed talents have no public solo page). Alternative: at creation (the workspace exists immediately, just without a claimer; only claimed talents get login). Decision affects the claim flow's complexity.

6. **What happens to the solo workspace if the talent's profile is removed?** Current direction: archived (`agencies.status='archived'`). Recovery on re-claim is possible but manual. Alternative: hard-deleted with the talent profile.

7. **Transaction fee for talent-tier bookings.** Per-plan field `platform_fee_basis_points` supports it; pricing decision.

8. **Combined upgrade flow when AlsoTalent.** A user who is both a Free workspace owner AND a talent — can their `talent_pro` upgrade also bump their workspace to `studio` in one purchase? Or are they always separate purchases? Default: separate (cleaner). Alternative: bundle deals (later).

---

## 15. Locked vs deferred

### Locked now (architectural direction)

- Three commercial lanes coexist via shared infrastructure
- Talent's premium page = solo workspace with talent-audience plan
- Plan namespace gets `audience` field; talent plans coexist with workspace plans in one table
- Source-ownership rules apply unchanged
- Custom domain support = `agency_domains` rows on the solo workspace
- Auto-provisioning of solo workspace at talent claim
- 8 capability keys reserved (locked product contracts)
- Out-of-scope list (§12)

### Deferred (planned, not built yet)

- All migrations: `agencies.kind` extension, `plans.audience` column, talent plan rows, auto-provisioning trigger, solo-workspace invariant triggers
- Premium-page templates + modules system (extends existing CMS sections / themes)
- Talent self-upgrade UI on `/talent/account/billing`
- Premium-page editor on `/talent/page/*`
- Custom-domain UI on `/talent/page/domain`
- Pricing decisions (placeholder values throughout this doc)
- Resolution of the 8 open questions in §14

---

## 16. Reference

This doc is the canonical source for this direction. Code, schema, or copy that conflicts must be raised as a Decision-Log amendment before being changed.

The user's full statement that established this direction is in the session transcript dated 2026-04-25 (immediately after the transaction-architecture directive).
