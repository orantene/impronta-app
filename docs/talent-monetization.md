# Talent Subscriptions & Premium Talent Pages — Architecture Direction

**Status:** Architecture direction. Author: founder (product direction); architecture written 2026-04-25, **revised 2026-04-25** with founder's resolved decisions.

This document is **directional** — it picks an architectural lane and reserves the right shapes so future implementation isn't blocked. It is not a fully locked spec; specific column names and migration shapes can shift during build. What's locked is the *direction*: how the third commercial lane integrates with the existing model without forking the data architecture.

This doc is part of the locked-product-logic set referenced from `OPERATING.md` §12. It complements:
- [`docs/talent-relationship-model.md`](talent-relationship-model.md) (talent / agency / hub / inquiry-ownership rules)
- [`docs/transaction-architecture.md`](transaction-architecture.md) (v1 payment model)

The founder's full directive (architecture-awareness, not build-now) was issued 2026-04-25 with the explicit framing: **"Same identity, stronger presentation."** That phrase is the architectural test for every decision in this doc.

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

## 3. Architectural direction — solo workspace, path-based public URL

**The directional decision: a talent's premium page is backed by a "solo workspace" — an `agencies` row with `kind='talent_solo'` that the talent owns — but exposed publicly via a single canonical platform URL: `tulala.digital/t/<slug>`.** The solo workspace is a backend abstraction (for plans, billing, transactions); it is **not** a user-facing tenant. Talents never navigate to a workspace admin shell.

### Two URL exposures, by tier

| Tier | Public URL |
|---|---|
| Talent Basic | `tulala.digital/t/<slug>` (path-based, on the platform domain) |
| Talent Pro | `tulala.digital/t/<slug>` — same canonical URL, richer page render |
| Talent Portfolio | `tulala.digital/t/<slug>` **and optionally** the talent's own custom domain (`sofiamendez.com`) — both surfaces resolve to the same content |

**There is no `<slug>.tulala.digital` or `<slug>.talents.tulala.digital` subdomain for talent pages.** The path-based URL is the canonical exposure. Custom domains are the **only** alternate public hostname, and only at Portfolio tier.

This locks an important product principle: **same identity, stronger presentation.** Upgrading doesn't move the URL; it just renders a richer page at the same address. Marketing/SEO continuity is preserved across tier changes.

### What this means architecturally

- **The `/t/[slug]` route already exists in the codebase** (`web/src/app/t/[profileCode]/page.tsx` — public route on the platform host). Premium tiers extend the same route's render path; they don't introduce new routes.
- **The solo workspace is invisible to end users.** It exists in the data model so that:
  - The talent's plan tier (`agencies.plan_tier`) has somewhere to live
  - Billing / subscription lifecycle reuses `agency_subscriptions` (when Stripe lands)
  - Booking transactions reuse `booking_transactions.source_tenant_id` cleanly
  - Capability checks via the access module work uniformly
- **Inquiries created on `/t/<slug>` resolve to the solo workspace.** Middleware doesn't carry the tenant context (the host is `tulala.digital` = marketing). The tenant is resolved at action-time by looking up `talent_profiles` from the slug → solo workspace from `talent_profiles.user_id` → setting `inquiries.tenant_id` accordingly.
- **Custom domain (Portfolio only) is an `agency_domains` row** with `tenant_id` = the talent's solo workspace, `kind='custom'`. Middleware host resolution sets the tenant header on requests to that hostname — same code path as agency custom domains.
- **Premium-only features are gated by `plan_capabilities` on the solo workspace.** Custom domain, advanced templates, video embeds — all keyed to the plan tier.

### Why this approach (not separate entities, not subdomain-per-talent)

- **Reuse over invention.** Existing tenant infrastructure (`agencies`, `agency_domains`, `agency_subscriptions`, `agency_branding`, `agency_talent_roster`, the access module, the transaction model) covers every requirement. A separate `talent_pages` + `talent_subscriptions` system would fork all of those. Rejected.
- **No subdomain proliferation.** The founder explicitly said "do not create lots of different talent subdomain models." A path-based canonical URL is one route, infinite slugs. Subdomain-per-talent would create N domains and N middleware-resolution paths. Rejected.
- **Marketing-host hosting is correct.** `tulala.digital` is the brand's home. Talent profiles being there reinforces that they're part of the platform discovery surface, not separate islands. Hubs and the discovery directory live there too.
- **AlsoTalent generalizes naturally.** Today's "Free workspace owner who is also a talent" pattern (see `talent-relationship-model.md` §5) becomes the default at talent-claim. Same shape, just always-on for claimed talents.

### What this doesn't mean

- The talent's UI surface is `/talent/*` (talent-self admin). Talents do **not** navigate to `/(workspace)/[slug]/admin/*` — that's for multi-member workspaces. Page management goes at `/talent/page`, `/talent/page/preview`, `/talent/account/billing`, etc. Behind the scenes those routes operate on the talent's solo workspace.
- A solo workspace **cannot have other members**. Trigger-enforced: at most one active `agency_memberships` row per `kind='talent_solo'` tenant, role=`owner`.
- A solo workspace **cannot host other talents**. The roster has at most one talent: the owner. Trigger-enforced.

### Alternatives considered and rejected

- **Subdomain per talent (`<slug>.talents.tulala.digital`).** Creates N hostnames in `agency_domains`, complicates middleware host-resolution, and contradicts the founder's "do not build multiple talent subdomain structures" directive. **Rejected.**
- **No solo workspace; talent identity entirely on `talent_profiles` plus a parallel `talent_subscriptions` table.** Forks plans, billing, transactions, RLS, and source-ownership. 2× code surface, 0× benefit. **Rejected.**
- **Premium page as an extension of an agency the talent is rostered with.** Couples talent monetization to agency relationship state. Founder explicitly said talent owns the page. **Rejected.**

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

### 4.4 Provisioning timing — at claim, not at create

**Founder-locked rule:** the basic profile exists at `talent_profiles` create time. **The solo workspace is provisioned at claim, not at create.**

| Lifecycle stage | What exists | Public page render |
|---|---|---|
| **Created (unclaimed)** | `talent_profiles` row only. No solo workspace. | `tulala.digital/t/<slug>` renders a basic auto-generated profile from `talent_profiles` data alone. |
| **Claimed** | `talent_profiles.user_id` set + `claimed_at`. **Solo workspace provisioned** with `plan_tier='talent_basic'`. | Same URL. Page now configurable by talent via `/talent/page`. Defaults are inherited from the basic auto-render. |
| **Upgraded to Pro** | Solo workspace `plan_tier='talent_pro'`. Premium-page modules unlock. | Same URL. Richer modules, layout, embeds rendered. |
| **Upgraded to Portfolio** | Solo workspace `plan_tier='talent_portfolio'`. Custom domain attachment unlocks. | `tulala.digital/t/<slug>` continues to work; **and** optionally the custom domain (`sofiamendez.com`) is attached via `agency_domains`. Both surfaces resolve to the same content. |

**Why provisioning at claim, not at create:**
- An unclaimed profile has no clear owner. Provisioning a solo workspace before that point creates a ghost tenant with no admin user, no subscription owner, no actor for capability checks.
- Pre-claim, the talent has no platform identity to receive subscriptions, transactions, or capability grants.
- Inquiries on `/t/<slug>` for unclaimed talent flow to the **creating workspace** (`talent_profiles.created_by_agency_id`) — that workspace vouched for the talent and can coordinate the inquiry until the talent claims.

**Provisioning at claim:**

```sql
-- Triggered when talent_profiles.user_id transitions from null → set
-- (i.e., on claim).

INSERT INTO agencies (slug, display_name, kind, plan_tier, status)
  VALUES (<derived-from-talent-slug>, <talent-display-name>,
          'talent_solo', 'talent_basic', 'active');

INSERT INTO agency_memberships (tenant_id, profile_id, role, status)
  VALUES (<new-workspace-id>, <talent-user-id>, 'owner', 'active');

INSERT INTO agency_talent_roster (tenant_id, talent_profile_id, source_type, status, agency_visibility, is_primary)
  VALUES (<new-workspace-id>, <talent-profile-id>,
          'platform_assigned', 'active', 'site_visible', true);

-- NO agency_domains insert at this stage. The canonical public URL is
-- tulala.digital/t/<slug>, which lives on the marketing host and is
-- handled by the existing /t/[profileCode] route. agency_domains rows
-- are created only when:
--   - The talent upgrades to Portfolio AND attaches a custom domain
```

Slug collisions on the workspace slug: derive from `talent_profiles.slug` with a numeric suffix as needed (`sofia-mendez`, `sofia-mendez-2`). The workspace slug is internal-only; users don't see it.

### 4.5 Pre-claim inquiry routing

When `tulala.digital/t/<slug>` is hit for an unclaimed talent and an inquiry is submitted:

- The inquiry's `tenant_id` is set to `talent_profiles.created_by_agency_id` (the workspace that created the profile).
- The inquiry shows a "from talent's auto-generated page" source badge in the workspace's admin so the operator knows the entry surface.
- If `created_by_agency_id` is null (e.g., platform-seeded talent), the inquiry is routed to the platform support tenant (super_admin's tenant — TBD; an open data question).

When the talent claims, future inquiries on the same URL are routed to the talent's solo workspace. **In-flight pre-claim inquiries stay with the creating workspace** — they're already in motion and reassigning ownership mid-conversation breaks the source-ownership invariant.

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

The most important rule from `talent-relationship-model.md` §6 remains unchanged: **the surface that received the inquiry owns it.** With talent-solo workspaces in play, "surface" extends from "host" to "host + path-based talent route":

| Surface | Inquiry tenant_id |
|---|---|
| `acme.tulala.digital` (any path) | Acme Agency |
| `hub-models.tulala.digital` (any path) | Models Hub |
| `tulala.digital/t/<slug>` for **claimed** talent | The talent's solo workspace |
| `tulala.digital/t/<slug>` for **unclaimed** talent | The creating workspace (`talent_profiles.created_by_agency_id`) — see §4.5 |
| `sofiamendez.com` (custom domain on Portfolio tier) | The talent's solo workspace |
| `tulala.digital/<other-marketing-paths>` | No tenant (marketing surfaces; no inquiry creation here) |

### Path-based tenant resolution

`tulala.digital/t/<slug>` lives on the marketing host. The middleware's host-resolution returns `kind='marketing'` with `tenant_id=null` for the request. That's correct for the page render (marketing host serves public pages).

But when an inquiry is **submitted** from that page (POST to inquiry creation), the tenant_id must be derived from the slug, not the host. The flow:

1. Server action receives the POST with `slug` from the URL params.
2. Look up `talent_profiles` by slug.
3. If `talent_profiles.user_id` is set (claimed): the tenant_id is the talent's solo workspace.
4. Else (unclaimed): the tenant_id is `talent_profiles.created_by_agency_id`, or fallback to platform tenant if null.
5. Insert the inquiry with that tenant_id.

This is a **slug-driven tenant lookup**, distinct from the host-driven lookup that handles agency / hub / custom-domain pages. Both paths exist; they serve different surfaces.

### Multi-source talent — same identity, multiple sources

Per `talent-relationship-model.md` §7, the same talent can have inquiries flowing in from many surfaces. With this model, they're:

- Each agency they're rostered at — inquiries on agency URLs
- Each hub they appear in — inquiries on hub URLs
- Their own personal page — inquiries on `tulala.digital/t/<slug>` (their solo workspace)
- Their custom domain (Portfolio) — same solo workspace as the canonical URL

All independent. Each transaction belongs to its source. The talent sees the unified inbox at `/talent/inquiries` with source badges per the existing rules.

---

## 7. Custom domain integration (Portfolio tier only)

A talent's custom domain is **just an `agency_domains` row** where `tenant_id` is the talent's solo workspace.

```
agency_domains:
  hostname: 'sofiamendez.com'
  kind: 'custom'
  tenant_id: <sofia's solo workspace id>
  status: 'pending' → 'dns_verification_sent' → 'verified' → 'ssl_provisioned' → 'active'
```

The DNS / SSL / verification machinery is the same as for an agency's custom domain. The only difference is plan-gating: `talent_portfolio` plan grants the `talent.page.connect_custom_domain` capability (see §11) that allows custom-domain attachment.

| Plan | Can attach custom domain? | `max_custom_domains` |
|---|---|---|
| Talent Basic | No | 0 |
| Talent Pro | No | 0 |
| Talent Portfolio | Yes (1) | 1 |

The custom domain coexists with the canonical `tulala.digital/t/<slug>` URL — both resolve to the same content. The custom domain is the marketing surface; the canonical URL preserves SEO continuity and platform discoverability.

## 7a. Exclusivity vs personal page — page ownership ≠ distribution control

**Founder-locked rule:** the talent always owns their personal page. **But ownership is separate from distribution control.**

### Page ownership (always with the talent)

- The talent's solo workspace, the page content, the custom domain (if Portfolio): always belong to the talent. Agency relationships do not affect ownership.
- If an agency relationship ends (talent exits, contract terminates, agency goes inactive), the talent keeps the page. No data is taken from them.
- The talent retains `talent.page.edit`, `talent.page.publish`, `talent.subscription.upgrade/downgrade` capabilities at all times.

### Distribution / visibility control (relationship-dependent under exclusivity)

When a talent is in an active **exclusive** agency relationship (`agency_talent_roster.is_exclusive = true`), the agency may control:

- **Public visibility of the personal page.** The agency can require the page to be hidden from public view during the contract.
- **Inquiry routing from the personal page.** Inquiries created from `tulala.digital/t/<slug>` may be routed to the agency's inbox instead of the talent's solo workspace.
- **Contact CTA presence.** Whether the public page surfaces "Contact" / "Book" buttons.
- **Distribution surfaces.** Whether the page can be linked from other platform discovery (hubs, search results).

These controls live on the `agency_talent_roster` relationship (deferred fields, see §12). When the exclusive relationship ends, the controls revert to the talent automatically.

The agency-side capability for managing these is `agency.roster.set_personal_page_distribution` (see §11). The talent's `talent.page.publish` capability remains, but in the active exclusive period the publish action may have a "subject to agency visibility settings" notice — the page can be edited and saved, but its public render obeys the agency's distribution flags.

### What this does NOT mean

- An agency cannot **take** the talent's page. Ownership stays with the talent always.
- An agency cannot edit the talent's page content. Editing remains a talent capability.
- An agency cannot delete the talent's solo workspace.
- An agency cannot revoke the talent's subscription. The talent pays for their own plan; the agency doesn't manage talent billing.

Exclusivity is about **distribution alignment** during the contract. The platform mediates that alignment via the deferred distribution-control fields on the relationship row, not by reassigning ownership.

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
| `agency.roster.set_personal_page_distribution` | talent | role + relationship | admin+ on an agency with an active exclusive relationship to the talent (see §7a) |
| `platform.talent_plans.configure` | platform | platform_role | super_admin |

9 capability keys for talent monetization. Registry: 67 → 75 (initial 8) → 76 (added `agency.roster.set_personal_page_distribution` per the exclusivity-distribution refinement).

The relationship gate for the talent-self capabilities is: caller has an active `agency_memberships(role='owner')` row in the talent's solo workspace, and the solo workspace's `plan_tier` permits the action. The plan-gate piece is part of normal `plan_capabilities` checking once plan-capability enforcement turns on (Track C).

The relationship gate for `agency.roster.set_personal_page_distribution` is: caller has admin+ in the agency, AND there's an active `agency_talent_roster` row linking the agency to the talent with `is_exclusive = true`.

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

### Scenario 1 — Talent Basic, claimed, no upgrades

Sofia signs up, claims her profile. A solo workspace is provisioned with `plan_tier='talent_basic'`. Her personal page is at `tulala.digital/t/sofia-mendez`.

She isn't rostered in any agency. She's auto-included in the default model hub (per Free-equivalent distribution rules, see `talent-relationship-model.md` §8b — talent-tier auto-distribution mirrors workspace-Free behavior).

Inquiries on `tulala.digital/t/sofia-mendez` → her solo workspace owns them. Inquiries on the model hub's URL → owned by the hub.

She pays nothing. She's the customer of `talent_basic`.

### Scenario 2 — Talent Pro upgrade

Sofia upgrades to `talent_pro` ($12/mo placeholder). Her URL stays `tulala.digital/t/sofia-mendez` — **same identity, stronger presentation**. The page now renders with:
- Richer layout
- Bigger gallery
- Video embeds
- Social-link surfacing
- Stronger portfolio module

No URL change. No SEO discontinuity. No inquiry-routing change. Just a richer render at the canonical URL.

### Scenario 3 — Talent Portfolio upgrade with custom domain

Sofia upgrades to `talent_portfolio` ($29/mo placeholder). She attaches `sofiamendez.com` via DNS verification + SSL provisioning. Both URLs work:
- `tulala.digital/t/sofia-mendez` (canonical, preserves platform discoverability)
- `sofiamendez.com` (her own brand surface)

Both render the same content. Inquiries from either go to the same solo workspace. The custom domain is the only host-based exposure for talent pages — no subdomains.

### Scenario 4 — Agency-rostered model with a Portfolio page (non-exclusive)

Vivian is rostered (non-exclusive) at Acme Agency. She's also a `talent_portfolio` subscriber. Her solo workspace has the custom domain `vivianrose.com`.

She has THREE active surfaces:
- `acme.tulala.digital/t/vivian-rose-acme-slug` (Acme's roster surface — Acme owns this inquiry source)
- `tulala.digital/t/vivian-rose` (her canonical personal page — her solo workspace owns this source)
- `vivianrose.com` (custom domain pointing to the same solo workspace as `/t/vivian-rose`)
- Plus any hub she's also in

Each surface is an independent inquiry source. Acme sees "Also at: Vivian's personal page" in their roster view (non-exclusive transparency, see `talent-relationship-model.md` §4). Vivian's `/talent/inquiries` aggregates inquiries from all sources with source badges.

### Scenario 5 — Exclusive talent with a personal page

Ela is on an exclusive relationship at Acme Agency. Her hub presence is agency-controlled. She also subscribes to `talent_pro` for her personal page at `tulala.digital/t/ela-dance`.

**Page ownership stays with Ela.** Acme cannot edit her page, cannot revoke her subscription, cannot delete her solo workspace.

**Distribution control under exclusivity:** Acme can set `agency_talent_roster.personal_page_visible = false` to hide the page during the contract, OR set `personal_page_inquiry_routing = 'to_agency'` so inquiries from `/t/ela-dance` route to Acme's workspace instead of Ela's solo workspace. These are managed via `agency.roster.set_personal_page_distribution`.

Ela can edit her page anytime (her own capability). The publish UI shows a "subject to agency distribution settings" banner so she understands why her edits may not be publicly visible.

When Ela exits the exclusive relationship, the distribution flags reset to defaults (visible, route to talent). Her edits remain. The page resumes normal operation under her sole control.

### Scenario 6 — Pre-claim inquiry on auto-generated page

Acme Agency creates a talent profile for a friend, Maria, who hasn't joined Tulala yet. `talent_profiles` row exists, `user_id` is null, `created_by_agency_id` = Acme.

Tulala renders `tulala.digital/t/maria-friend` from the basic auto-generated profile. A client visits that URL and submits an inquiry.

The inquiry's `tenant_id` = Acme (the creating workspace, per §4.5). Acme's coordinators see the inquiry in their inbox; they handle it on Maria's behalf until Maria claims.

When Maria claims, future inquiries on the same URL route to her solo workspace. The Acme-owned inquiry stays with Acme — already in motion.

---

## 14. Resolved decisions (founder, 2026-04-25)

These were the open questions in the prior version of this doc. Founder has now resolved them. Captured here as the binding answers; see the session transcript for the full rationale.

| # | Question | Answer |
|---|---|---|
| 1 | Exclusivity vs personal page ownership | **Talent always owns the page.** Ownership ≠ distribution control. Under exclusive relationship, agency controls visibility / inquiry-routing / distribution; talent always retains content edit + subscription + page-keep-on-exit. See §7a. |
| 2 | Talent-plan pricing | **Talent Pro = $12/mo. Talent Portfolio = $29/mo.** Placeholder values pending billing-launch decision. Encoded in `plan-catalog.ts`. |
| 3 | Custom-domain availability | **Only Talent Portfolio.** Talent Pro is upgraded profile only. Creates a clear product jump. |
| 4 | Default talent-page URL pattern | **`tulala.digital/t/<slug>`** (path-based, on the platform domain). Same URL across all tiers. Custom domain (Portfolio) is the only host-based exposure. **No subdomains.** |
| 5 | Auto-provisioning trigger | **Solo workspace at claim, not at create.** Basic profile exists at create (`talent_profiles` row + auto-rendered page). Premium personal-page layer activates at claim/upgrade. Pre-claim inquiries flow to the creating workspace. |

## 14a. Remaining open questions

Smaller decisions still pending; not blockers for any current work.

1. **What happens to the solo workspace if the talent's profile is soft-deleted?** Direction: archive the workspace (`agencies.status='archived'`); preserve data; allow recovery on re-claim. Alternative (cleaner): hard-cascade delete. Pending decision before the deletion flow is built.

2. **Transaction fee for talent-tier bookings.** `platform_fee_basis_points` lives per-plan. Talent tiers can have different fees than workspace tiers. Final values TBD; affects pricing strategy more than architecture.

3. **AlsoTalent bundle flow.** A user with both a workspace subscription and a talent subscription — separate purchases (default, cleaner) or bundle? Decision deferred until billing wiring.

4. **Pre-claim inquiry routing fallback** when `talent_profiles.created_by_agency_id` is null (e.g., platform-seeded talent). Direction: route to a platform support tenant. Tenant identity TBD.

5. **Source badge specificity.** When an inquiry is from `tulala.digital/t/<slug>`, the talent's inbox shows "from your personal page." When the same talent has a custom domain attached (Portfolio), do inquiries from the canonical URL vs the custom domain show different badges? Probably yes (it's useful UX), but not architecturally required.

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

## 16. Page-builder integration

The premium talent-page templates (Pro / Portfolio) consume the existing page-builder subsystem at `web/src/components/edit-chrome/`. The invariants in [`page-builder-invariants.md`](page-builder-invariants.md) are binding here:

- **All theming for premium-page templates goes through the token registry** (`lib/site-admin/tokens/registry.ts`). New "premium-only" knobs (e.g., portfolio-grid-column-count, hero-video-aspect-ratio) get registry entries with `agencyConfigurable: true` + Zod validators. Plan-tier gating layers on top via the access module's `plan_capabilities` (Track C); the registry doesn't fork by audience.
- **Talent-page editor** (`/talent/page` and related) composes inspector kit primitives (`InspectorGroup`, `KIT.input`, `KIT.label`, `VisualChipGroup`, `ColorRow`). Don't re-style fields ad-hoc.
- **The `/t/<slug>` route is a public storefront render** in this subsystem's terms. The canvas-is-storefront rule applies: edit mode is a flag on the same render, not a separate iframe. Talent's "Edit page" CTA navigates to `/t/<slug>` in edit mode where edit-chrome takes over.
- **CAS** applies to any new operator-edited talent-page tables (e.g., a future `talent_page_config` if the data outgrows `agency_branding` + `cms_sections`). `version` column + `expectedVersion` round-trip + `VERSION_CONFLICT` refetch.
- **Cache-tag entries** for talent-page surfaces (e.g., `talent-page`) are added to `cache-tags.ts` when needed. Bare-string tags are banned.

## 17. Reference

This doc is the canonical source for this direction. Code, schema, or copy that conflicts must be raised as a Decision-Log amendment before being changed.

The user's full statement that established this direction is in the session transcript dated 2026-04-25 (immediately after the transaction-architecture directive).
