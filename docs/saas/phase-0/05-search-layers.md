# Phase 0 Deliverable 5 — Search Layer Definitions

**Purpose.** Define the three distinct search layers the platform operates, what each indexes, what each MUST NEVER include, and which DTOs each uses. This is the spec Phase 6 (field governance) and Phase 7 (hub approval) build their indexing pipelines against, and the contract Phase 2 serializers enforce.

**Sources.** Plan §9 (Three-Layer Search Architecture), §10 (AI tenancy), §11 (Hub visibility), §12.5 (Hub directory rendering), §22.9 (Future enforcement gates), §24 (Cross-surface leakage), §28 (Performance — index-driven hub). Locks: L3, L5, L8, L9, L39.

---

## 1. The three layers

| Layer | Surface | Audience | Scope | Index owner |
|---|---|---|---|---|
| **Hub search** | `talenthub.io` (Surface B) | Public + authenticated users across agencies | Governed, global-only | Platform pipeline |
| **Agency public site search** | `{slug}.studiobooking.io` and tenant custom domains (Surface A) | Public visitors of a specific agency | Tenant-scoped, within that agency's roster | Per-tenant index (shared infra in V1) |
| **Agency admin search** | `app.studiobooking.io/a/{slug}/...` (Surface D, agency workspace) | Tenant staff (with support-mode extensions) | Full tenant scope — drafts, private, inactive | Per-tenant; reuses same physical index with wider scope filter |

Hub and agency public search are **separate product experiences** with separate trust surfaces. They MUST NOT share index rows without an explicit allowlist pass (see §2 below).

---

## 2. Cross-layer rule (load-bearing — L8, L39)

**Agency-local fields, agency-local tags, agency-local taxonomy, and agency-local overlay content never enter hub search.** Period.

- Hub index reads only from `talent_profiles` global fields (scope = `global`, `ai_visible = true`), global `taxonomy_terms`, and approved media.
- Hub serializer allowlist — `toHubTalentCard()` / `toHubProfilePublic()` — denies `agency_talent_overlays.*` keys by schema, not by omission. Add a column to overlays → it stays out of hub unless explicitly allowlisted via a Decision Log change.
- Agency-public and agency-admin indexes may include agency-local data, but can never include **another tenant's** local data. RLS + per-tenant index partition ensures this.

The Plan §22.9 gate "cross-tenant RLS zero-leak" + "cross-surface serialization contract (hub responses contain zero overlay keys)" is the test form of this rule.

---

## 3. Hub search (`talenthub.io`)

**Purpose.** Network-wide discovery of approved talent across all agencies. Platform-governed, SEO-visible, AI-indexed.

### Indexes

- **Talent:** `talent_profiles` WHERE `workflow_status = 'approved' AND visibility = 'public'` AND there exists a matching `talent_representation_requests` row with `target_type = 'hub'` and `status = 'accepted'` for the target hub surface (L44).
- **Fields:** `field_values` for `field_definitions` WHERE `scope = 'global' AND hub_visible = true AND ai_visible = true`.
- **Taxonomy:** `taxonomy_terms` global vocabulary only.
- **Media:** approved media metadata (alt text, dimensions) from `media_assets`; binary content served via CDN.
- **Embeddings:** `talent_embeddings` — platform pipeline; indexes only global + hub-visible content.

### Reads

- Faceted filters driven by governed taxonomy + `filterable` global fields.
- Free-text search on public bio / governed fields.
- AI / semantic via `talent_embeddings`.
- "Explore Talent" directory (Plan §12.5) + "Talent Profile (Public View)" page.

### Must NEVER include

- Any column from `agency_talent_overlays` (display_headline, cover_media_asset_id, local_bio, local_tags, booking_notes, availability_notes, internal_score, sort_override, pricing_notes, portfolio_media_ids, metadata).
- Any `agency_field_values` row (Phase 6).
- Commercial / pricing notes.
- Internal moderation / eligibility flags.
- Agency-internal ranking overrides.
- Any data from talents whose `talent_profiles.workflow_status` is not `approved`.

### Performance contract (Plan §28)

Hub search must be **index-driven** — materialized views, search index tables, or a dedicated indexing pipeline. **Never** per-request heavy joins across all agencies. Extraction to a separate deployment is reserved for future scale (L5); the data model supports it without refactor.

### Moderation override

Platform can force-hide any profile from hub at any time. This must be honored by the index update pipeline within the SLO documented in Plan §28. Moderation flags live on `talent_profiles` / governance tables (Zone 1), never on overlays.

### DTO

`toHubTalentCard(talentProfile, hubContext): HubTalentCard` — allowlist projection. Contract test: iterate the DTO output keys; assert none match the overlay key list above.

---

## 4. Agency public site search

**Purpose.** Discovery within one agency's roster. Tenant-scoped, template-rendered, SEO-visible on that agency's hostnames only.

### Indexes

- **Talent:** `agency_talent_roster` WHERE `agency_id = <resolved tenant>` AND `status = 'active'` AND `agency_visibility IN ('site_visible', 'featured')`.
- **Fields:** canonical global `field_values` for rostered talent + `agency_field_values` WHERE `agency_id = <resolved tenant>` (Phase 6).
- **Filter panel:** `directory_filter_panel_items` + `directory_sidebar_layout` for this tenant — governed taxonomy + tenant-configured facets.
- **Sort / featured:** `agency_talent_overlays.sort_override` + `agency_visibility = 'featured'` for pinning.
- **Ranking overrides:** `agency_talent_overlays.internal_score` where the agency's template exposes it.

### Reads

- Agency storefront directory.
- Storefront talent profile page (agency-branded view of a canonical profile).

### Must NEVER include

- Other agencies' roster members, overlays, or inquiries.
- Hub-only internal states (e.g. `pending_hub_review`) unless explicitly productized as client-safe copy.
- Draft / inactive roster rows.
- Content from `cms_pages` where `tenant_id <> <resolved tenant>`.
- Any hub-queued `tenant_id IS NULL` inquiries.

### Public agency search is separate from hub search

Even though a rostered talent with hub visibility = `approved` appears in **both** the hub directory and the agency storefront, the two surfaces:

- Use different DTOs (`toHubTalentCard()` vs `toStorefrontTalentCard()`).
- Apply different filter configurations (governed-only vs agency-configurable).
- Apply different sort defaults (hub: platform ranking; agency: `sort_override` + agency default).
- May show different headline / bio (canonical global vs `agency_talent_overlays.display_headline` / `local_bio`).

### DTO

`toStorefrontTalentCard(talentProfile, roster, overlay): StorefrontTalentCard` — includes canonical identity + this tenant's overlay + rostered global fields.

### Tenant resolution (fail-hard — L37, Plan §22.7)

If the hostname does not resolve to a concrete tenant (unknown custom domain, typo'd slug), the storefront returns an error page. **Never** falls back to tenant #1 or to any default agency.

---

## 5. Agency admin search

**Purpose.** Full-scope operational search inside the agency workspace. The engine staff rely on for queue triage, roster lookup, inquiry discovery, booking lookup.

### Indexes

- **Everything in tenant scope:**
  - `inquiries` + derived tables (participants, messages*, offers, approvals, events, action log, requirement groups, coordinators).
  - `agency_bookings` + derived.
  - `agency_talent_roster` — all statuses (active, inactive, pending, removed for audit).
  - `agency_talent_overlays`.
  - `agency_client_relationships`.
  - `cms_pages`, `cms_posts`, `cms_navigation_items`, `collections` — all statuses including drafts.
  - `agency_field_values`, tenant-scoped `field_definitions` (Phase 6).
  - `activity_log`, `notifications` for the current user's scope.
  - Analytics rollups scoped to tenant.

*Messages: visibility subject to coordinator / participant rules (Plan §16) and, for platform users, to support-mode thread rules (Plan §6 / deliverable 2 §7).

- **Internal notes:** where the acting user has `view_private_client_data` / equivalent capability.
- **Operational states:** every draft, paused, archived state (not just published).

### Reads

- Admin global search (keyboard shortcut / top-of-dashboard).
- Queue + inbox filtering.
- Inquiry / booking / talent / client listing and drill-down.

### Must NEVER include

- Another tenant's rows. RLS enforces; app layer asserts `tenantId = currentTenant` before composing results.
- Message content from threads the actor has not opened (in platform support mode).
- Rows owned by an agency in `suspended` / `archived` status unless the acting platform user is in a support mode with read visibility.

### Platform support extension

When a platform user is in read-only or assisted-edit support mode inside an agency workspace, their admin search is scoped to that agency. The banner colour (deliverable 2 §6) reflects mode. They cannot pivot across tenants from within an agency context — that requires returning to platform context.

### DTO

`toAdminInquiryDTO()`, `toAdminTalentDetailDTO()`, `toAdminClientDTO()`, etc. Each DTO projects only tenant-scoped fields; none attach cross-tenant data.

---

## 6. Per-agency search quality affordances (Plan §9)

- Agencies can **pin featured results** on their storefront via `agency_talent_overlays.sort_override` + `agency_visibility = 'featured'`.
- Agencies can **override sort order locally** via the same column.
- **Platform can force-rank or force-hide** any profile from hub — overrides the agency's preferences at the hub layer only.
- **Agency-local tags / fields never pollute hub search results.** Plan §9 rule, re-stated.

---

## 7. AI indexing rules (Plan §10)

Intersection of search and AI. Layer-specific.

| Feature | Hub search | Agency public search | Agency admin |
|---|---|---|---|
| Semantic / vector search | Yes (platform pipeline) | Yes if `entitlements.ai_enabled` AND agency-local embedding pipeline | Yes if enabled |
| AI-drafted inquiry suggestions | — | — | Yes if enabled (scoped to agency data only) |
| Match / recommendations | Hub-level matching | Agency-filtered display over hub results | Agency-scoped candidate suggestions |
| Embedding generation | Platform | Platform (agency keys not in V1 per D11) | Platform |

**Rules.**

- AI pipelines MUST carry tenant context and MUST NEVER cross tenant boundaries.
- Tenant-confidential data (agency notes, local pricing, internal scores) are **never** sent to a cross-tenant AI context.
- Platform-confidential data (moderation reasons, internal flags) is used only in moderation AI paths and never surfaced.
- AI-generated content is always draft (L20). Never auto-publish.

---

## 8. Index update pipeline (cross-cuts)

Each layer's index is populated by background jobs. Plan §21 requires every background job to be tenant-aware.

| Index | Trigger sources | Update semantics |
|---|---|---|
| Hub talent index | Hub visibility approval; `talent_profiles` global-field updates; moderation actions; media approval | Rebuild partitions on accept/revoke; incremental on field update |
| Hub embeddings (`talent_embeddings`) | Same as above | Platform pipeline only |
| Agency-public index (per tenant) | Roster add/remove; overlay edit; field value change; CMS publish | Incremental per tenant |
| Agency-admin index (per tenant) | All tenant-scoped mutations | Incremental per tenant; broader scope than public |

**Back-pressure and retries.** Plan §28 requires per-tenant budgets so one busy agency cannot starve the hub indexing pipeline.

---

## 9. Testing & enforcement (Plan §20, §22.9, §24)

- **Cross-tenant RLS zero-leak** — for every tenant-scoped table, user from tenant A cannot read tenant B. Included in the three launch gates.
- **Hub DTO contract test** — Programmatic assertion: iterate `toHubTalentCard` output keys; intersect with overlay column list; expected intersection = empty.
- **Storefront cross-tenant test** — Render tenant A storefront as authenticated tenant-B staff; expected: no tenant-B data bleeds through; no admin-only fields appear.
- **Admin support-mode thread test** — platform_support reads inquiry list; message content hidden; opening a thread produces a `thread_content_read` audit row.
- **Index partition test** — per-tenant roster count in the public index equals `SELECT COUNT(*) FROM agency_talent_roster WHERE agency_id = <tenant> AND status = 'active' AND agency_visibility IN ('site_visible','featured')`.
- **Fail-hard resolution** — unknown slug / unregistered custom domain → storefront 404, never tenant #1 rendered.

---

## 10. Phase sequencing

- **Phase 1** — schema additions (`tenant_id` on operational + CMS + analytics tables). Index pipeline is not yet re-architected.
- **Phase 2** — `withTenantScope()` + RLS. Admin search reads become tenant-scoped naturally.
- **Phase 3** — admin UI honours tenant context; admin search filters by tenant.
- **Phase 4** — agency-public storefront middleware + rendering; public index wired per tenant.
- **Phase 6** — agency-local fields enter agency-public + agency-admin indexes; still excluded from hub.
- **Phase 7** — hub visibility request workflow → hub index accept/revoke paths go live; moderation integration.

---

## 11. Change control

- Any proposal to widen hub index scope (e.g. allow a specific overlay column to enter hub) is a Plan Decision Log event and requires an explicit `hub_visible = true` flag on the field + reviewer approval.
- Per-tenant index separation is an architectural boundary. Consolidation proposals require Decision Log entry + performance evidence.
- Agency-local fields entering hub is explicitly prohibited (L8) — do not loosen without re-opening that Locked Decision.
