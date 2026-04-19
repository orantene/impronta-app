# Phase 0 Deliverable 1 — Entity Ownership Map

**Purpose.** For every table (and every meaningful field or column-set) in the platform, name: governance zone, who creates, who edits, who approves, who sees, which search layer reads it, and what the Phase 1 migration has to do to it. This is the spec Phase 1–3 use for migrations, RLS, and serialization.

**Sources.** Plan §2 (Five Governance Zones), §3 (Canonical + Overlay), §4 (Ownership Model — new tables), §4.5 (Schema Impact Map), §11–11.5 (Hub visibility + representation), §14–14.5 (Audit/event model), §16–16.6 (Inquiry/coordinator), §24 (Cross-surface leakage).

**Legend.**
- **Zone:** 1 Platform Core · 2 Agency Private · 3 Shared Governed · 4 User-Owned · 5 Derived/Computed
- **Surfaces:** H = Hub (`talenthub.io`) · M = Marketing (`studiobooking.io`) · A = Agency storefront · X = Central app/admin
- **Search layer:** see deliverable 5.
- **Phase 1 action:** `keep` · `add tenant_id` (nullable → backfill → NOT NULL → index) · `new` · `provenance` · `split` · `rls-update`.

---

## 1. Zone summary (Plan §2)

| Zone | Who can touch | Examples |
|---|---|---|
| 1 — Platform Core | Platform only | Global taxonomy, field definitions (core scope), hub rules, plans, `platform_audit_log` |
| 2 — Agency Private | That agency only | Branding, CMS, staff memberships, inquiries, bookings, overlays, local fields |
| 3 — Shared Governed | Agency proposes, platform approves | Hub visibility, field promotion, custom domain, taxonomy promotion, syndication |
| 4 — User-Owned | Talent/client directly | Password, consent, notification prefs, personal contact visibility |
| 5 — Derived/Computed | No one edits | AI scores, completeness, rankings, embeddings, usage counters |

**Anti-pattern to enforce in code review:** if a field's zone is 1 or 3, agency-side write paths must not exist; if zone is 5, no admin edit UI may exist; if zone is 2, no cross-tenant read path may exist.

---

## 2. Canonical identity tables (stay global, no `tenant_id`)

| Table | Zone | Who creates | Who edits | Who approves publication | Who sees | Search layers | Phase 1 action |
|---|---|---|---|---|---|---|---|
| `profiles` | 1 (identity) + 4 (user-owned fields) | Self-signup / agency invite / platform | Self (own record); agency/platform within capability | n/a | Self + scoped staff | admin-all, agency-admin (if linked), hub (public projection only) | `keep` RLS `self_or_staff`; no tenant_id |
| `talent_profiles` | 1 (identity + core global fields) | Self-signup / agency (via flow) / platform | Platform (core fields); agency **only** via governed workflow (revision, hub approval) | Platform (for hub eligibility), agency (for roster presentation only via overlay) | Platform all; agency for rostered; public for hub-approved+public | hub, agency-public (via roster), agency-admin | `provenance`: add `created_by_agency_id`, `created_by_user_id_provenance`, `source_type` |
| `talent_profile_taxonomy` | 1 | Platform | Platform | Platform | All | hub, agency-public, agency-admin | `keep` |
| `taxonomy_terms` | 1 | Platform | Platform | Platform | All | hub, agency-public, agency-admin | `keep` |
| `field_groups` | 1 | Platform | Platform | Platform | Staff | agency-admin | `keep` |
| `field_definitions` (core scope) | 1 | Platform | Platform | Platform | Staff | agency-admin | `keep` core; Phase 6 adds `scope` + `owner_agency_id` for local fields |
| `field_values` (global scope) | 1 | Platform/talent via schema-gated flow | Per field `who_edits_values` | Platform (schema) | Per `hub_visible`/`internal_only` | hub (if `ai_visible`), agency-public, agency-admin | `keep` |
| `locations`, `countries` | 1 | Platform | Platform | Platform | All | hub, agency-public, agency-admin | `keep` |
| `search_queries` | 1 + 2 (split) | System | System | n/a | Platform all; agency own | hub, agency-admin (own) | Phase 1 add **optional** `tenant_id` (NULL = hub search) |
| `talent_embeddings` | 1 + 5 (derived) | System (platform pipeline) | System only | n/a | System | hub | `keep`; indexes only global `ai_visible` fields |
| `media_assets` | 1 (owned by `talent_profile_id`) | Talent/agency via upload flow | Owner + capability-holders | Platform (approval states) | Per approval + visibility | hub (approved public), agency-public (rostered), agency-admin | `keep`; tenant context derived via roster (not a direct column) |
| `staff_permissions` | 1 → 2 (split in Phase 2) | Platform | Platform today; Phase 2 adds tenant scoping | Platform | Staff | agency-admin | Phase 2: add tenant scoping |
| `ai_provider_instances`, `ai_tenant_controls`, related AI tables | 1 | Platform | Platform | Platform | Platform | agency-admin (own) | `keep`; seed update — replace `DEFAULT_AI_TENANT_ID` with real agency IDs once tenant #1 row exists |

**Rule (L6, L7).** Agency presentation overrides never live on `talent_profiles`. They live in `agency_talent_overlays` (see §4 below). Agency-local field values live in `agency_field_values` (Phase 6). This is load-bearing.

---

## 3. Tenant-scoped operational tables (existing — Phase 1 adds `tenant_id`)

Plan §4.5. Every row: add nullable `tenant_id` → backfill with tenant #1 UUID (`00000000-0000-0000-0000-000000000001`) → `SET NOT NULL` → index → RLS update (Phase 2, not Phase 1).

| Table | Zone | Who creates | Who edits | Who approves | Who sees | Search layers | Phase 1 action |
|---|---|---|---|---|---|---|---|
| `inquiries` | 2 | Client (self-submit or via agency site) / agency staff / hub routing | Capability `manage_inquiries` within tenant | n/a (workflow gates instead) | Tenant staff; platform via support mode (§16) | agency-admin | `add tenant_id` (NOT NULL post-backfill) |
| `agency_bookings` | 2 | Derived from inquiry (booking conversion) | Capability `manage_bookings` | n/a | Tenant staff; platform via support mode | agency-admin | `add tenant_id` |
| `booking_talent`, `booking_activity_log` | 2 (inherits via booking) | System / capability | Capability | n/a | Staff scoped via booking | agency-admin | `add tenant_id` (inherits parent) — enforce via RLS join + column for index performance |
| `inquiry_participants` | 2 | Staff with `manage_roster` | Same | n/a | Tenant staff; platform support | agency-admin | `add tenant_id` (inherits) |
| `inquiry_messages` | 2 — **trust-critical** (§6 support-mode rules) | Thread participants | Author (edit window) / capability | n/a | Thread participants; platform only via explicit `openThreadInSupportMode()` action (logged) | agency-admin (scoped) | `add tenant_id`; RLS must also gate platform reads via open-thread audit row |
| `inquiry_message_reads` | 2 + 5 (unread derivation) | System | System | n/a | Message recipient | agency-admin | `add tenant_id` |
| `inquiry_offers`, `inquiry_offer_line_items` | 2 | Capability `create_offers` | Same | `approve_internal_offers` (agency internal) + client approval (external, via approvals table) | Tenant staff + client for their own | agency-admin | `add tenant_id` |
| `inquiry_approvals` | 2 | Client (per-participant) / staff on behalf | Client | n/a | Tenant staff + client | agency-admin | `add tenant_id` |
| `inquiry_events` | 2 (facts) | System (engine emits) | System only (append-only) | n/a | Tenant staff; platform support | agency-admin | `add tenant_id`; **append-only** semantics preserved (Plan §14.5) |
| `inquiry_action_log` | 2 (attempts + failures + overrides) | System + staff (on override) | Append-only | n/a | Tenant staff; platform support | agency-admin | `add tenant_id` (Plan §14.5 + §16.7) |
| `inquiry_requirement_groups` | 2 | Staff (inquiry creation/edit) | Capability `manage_inquiries` pre-booking; locked post-booking (L32) | n/a | Tenant staff | agency-admin | `add tenant_id`; immutability post-booking enforced (already shipped via BEFORE INSERT trigger) |
| `inquiry_coordinators` | 2 — **operational source of truth** (L30) | Capability `manage_inquiries` (primary) / `admin` (reassign) | Same | n/a | Tenant staff; platform support | agency-admin | `add tenant_id`; **do not read from legacy `inquiries.coordinator_id`** |
| `cms_pages`, `cms_posts`, `cms_navigation_items`, `cms_redirects` | 2 for `tenant_id <> NULL`; 1 for `tenant_id IS NULL` (platform hub/marketing) | `edit_cms_content` | Same | n/a | Public (if published) + tenant staff | hub (platform pages), agency-public (tenant pages), agency-admin | `add tenant_id`; also `split`/clarify via `cms_pages.context` enum (`platform_hub`, `platform_marketing`, `agency_storefront`, `admin_internal`) — Plan §12.5 |
| `cms_page_revisions`, `cms_post_revisions` | 2 (inherit) | System on save | System | n/a | Tenant staff | agency-admin | `add tenant_id` (inherits); cascade delete with parent (already) |
| `collections`, `collection_items` | 2 | `edit_cms_content` | Same | n/a | Public (if published) | agency-public, agency-admin | `add tenant_id` |
| `notifications` | 2 (user-scoped within tenant) | System (derived from events + unread — Plan §15, L27) | System | n/a | Recipient | agency-admin (recipient's) | `add tenant_id` |
| `activity_log` | 2 | System + staff | Append-only | n/a | Tenant staff; platform support | agency-admin | `add tenant_id` (do **not** collapse into `platform_audit_log` — Plan §14.5) |
| `saved_talent` | 2 (cart is per-agency when rostered; hub-wide for hub directory) | Client | Client | n/a | Owner + assisting staff | agency-public, agency-admin, hub | `add tenant_id` (nullable = hub-wide saved list) |
| `directory_filter_panel_items`, `directory_sidebar_layout` | 2 | `edit_navigation` (or admin-level equivalent) | Same | n/a | Tenant staff (admin); public (on storefront) | agency-public, agency-admin | `add tenant_id` |
| `settings` | 1 for `tenant_id IS NULL`; 2 for `tenant_id = agency.id` | Platform (global); agency admin (scoped by mutability) | Per mutability (see deliverable 4) | Platform for `request_based` keys | Platform all; agency own | agency-admin | `add tenant_id` (nullable); RLS split `NULL` vs tenant rows |
| `translation_audit_events` | 2 | System | System | n/a | Tenant staff | agency-admin | `add tenant_id` |
| `app_locales` | 1 | Platform | Platform | Platform | All | agency-admin | `keep` (global registry); agency-supported list lives on `agencies.supported_locales` |
| `client_accounts`, `client_account_contacts` | 2 | Agency coordinator+ (or import) | Capability | n/a | Tenant staff | agency-admin | `add tenant_id` (subject to O6 resolution) |
| `analytics_events`, `analytics_daily_rollups`, `analytics_funnel_steps`, `analytics_search_sessions`, `analytics_kpi_snapshots` | 2 (per-tenant) + 1 (platform rollups where applicable) | System | System | n/a | Platform all; agency own | agency-admin | `add tenant_id` |
| `ai_search_logs` | 2 (tenant context via AI tables) | System | System | n/a | Tenant + platform | agency-admin | `add tenant_id` (or confirm it already has one) |
| `failed_engine_effects` | 2 | System | System | n/a | Tenant staff + platform | agency-admin | `add tenant_id` |
| `talent_submission_snapshots`, `talent_submission_consents`, `talent_submission_history`, `talent_workflow_events` | 2 (submission is per-agency) | System + agency staff | System | Platform (when syncing to hub) | Tenant staff; platform (review) | agency-admin | `add tenant_id` |

**Derived-tables pattern.** Tables marked *(inherits)* are joined to the parent (`inquiry_id`/`booking_id`) for RLS checks. A physical `tenant_id` column is still added for index performance and to keep serialization DTOs predictable — but the parent's tenant remains authoritative. Plan §16 + §4.5.

---

## 4. New agency-scoped tables (Phase 1 adds)

Plan §4. Creation order fixed in Plan §4.5 "Migration/Backfill Order."

| Table | Zone | Purpose | Who creates | Who edits | Who approves | Who sees | Search layers |
|---|---|---|---|---|---|---|---|
| `agencies` | 1 (tenant record + lifecycle state) | The tenant row | Platform (onboarding flow or seed) | Platform (lifecycle); owner limited fields (display name, template) | Platform | Platform all; tenant staff own row (filtered) | admin-platform |
| `agency_memberships` | 2 (who belongs + role) | Membership + role + status | `manage_agency_users` (invite) | Same | Owner (for ownership transfer) | Tenant staff; platform | agency-admin |
| `agency_domains` | 2 (subdomain) + 3 (custom domain — governed via DNS) | Domain mapping | Owner (`manage_agency_domains`) | Owner | Platform (DNS verification is implicit approval) | Tenant staff; platform | agency-admin |
| `agency_talent_roster` | 2 | Assignment + visibility status | `manage_roster` | Same | Platform (for `hub_visibility_status` sync) | Tenant staff; platform | agency-admin |
| `agency_talent_overlays` | 2 — **presentation only** (L7) | Display headline, local bio, tags, featured, sort, pricing notes, portfolio subset | `manage_roster` | Same | n/a | Tenant staff + rendered public (filtered) | agency-public, agency-admin — **never hub** (§24 allowlist) |
| `agency_client_relationships` | 2 | Per-agency client record (notes, tags, status, source) | `manage_inquiries` or `view_private_client_data` | Same | n/a | Tenant staff | agency-admin |
| `agency_branding` | 2 | Colors, logo, fonts | `edit_branding` | Same | Platform (only if plan-gated fields added later) | Tenant staff + rendered public | agency-public, agency-admin |
| `agency_entitlements` | 1 | Plan limits + feature gates | Platform (plan-driven) | Platform | Platform | Tenant staff (read); platform | agency-admin |
| `agency_usage_counters` | 5 (derived) | Metering for billing | System | System only (Plan §24 anti-pattern: never hand-edit) | n/a | Tenant staff (read); platform | agency-admin |
| `platform_audit_log` | 1 | Cross-tenant audit — distinct from `activity_log` (Plan §14.5) | System + platform support actions | Append-only | n/a | Platform; agency (filtered — only rows referencing their tenant, read-only) | admin-platform |

---

## 5. Shared/governed tables (Phase 6–7 adds)

| Table | Zone | Purpose | Created by | Who approves | Phase |
|---|---|---|---|---|---|
| `agency_field_values` | 2 (value) + governed by field definition zone | Agency-local field values (multi-entity: talent, client, inquiry, booking) | `manage_agency_fields` + value editor | n/a (value); platform for field promotion | 6 |
| `talent_representation_requests` | 3 | Unified governed request table for talent representation. Rows with `target_type = 'agency'` are agency applications (reviewed by agency admin); rows with `target_type = 'hub'` are hub visibility requests (reviewed by platform reviewer). Same status vocabulary; reviewer differs by `target_type`. **L44.** | Talent (self) or agency admin via `submit_hub_visibility` for hub rows | Agency admin (`target_type = 'agency'`); `platform_reviewer`+ (`target_type = 'hub'`) | 7 |
| `field_promotion_requests` | 3 | Local → global field proposals | Agency admin | Platform admin/reviewer | 6 |
| `taxonomy_promotion_requests` | 3 | Local tag → global term proposals | Agency admin | Platform admin/reviewer | 6 |
| `duplicate_candidates` | 1 | Duplicate detection queue (talent) | System | Platform (or explicit agency "new person" confirmation, logged) | 7 |

**Note (L44).** There is no separate `hub_visibility_requests` table in V1. The earlier plan drafts used that name; the unified `talent_representation_requests` subsumes it. Roster lifecycle's `hub_visibility_status` field (`agency_talent_roster.hub_visibility_status`) remains — it is the **effect** of an accepted `target_type = 'hub'` request, not a queue. Agency roster invitations (agency invites existing talent) create roster rows directly and do **not** flow through this table (see `03-state-machines.md` §5).

---

## 6. Zone 4 — User-owned data (cross-cuts several tables)

Plan §2. These never transfer to agency or platform ownership even when an agency interacts with the user.

| Owner record | Fields |
|---|---|
| `profiles` | Password / auth credentials; consent settings; notification preferences; personal contact visibility |
| `talent_profiles` (freelancer-owned period) | Pre-agency profile content; source_type = `freelancer_signup` |
| Notification prefs (wherever stored) | Mute settings, channel opt-outs |

**Rule.** Agencies do not overwrite user consent or notification choices; they can request/recommend, not set.

---

## 7. Zone 5 — Derived/computed (never hand-edited)

Plan §2 critical rule. These are regenerated from source.

| Field | Source |
|---|---|
| `agency_usage_counters.counter_value` | Background counter sync job |
| `inquiry_requirement_groups.quantity_filled` | Derived from `inquiry_participants` where `requirement_group_id` matches |
| Per-group `selected` / `offered` / `approved` counters | Derived from participants / offers / approvals (Plan §16.5 canonical counters) |
| AI relevance / match scores | AI pipeline |
| Profile completeness percentages | Derived from `field_values` + `media_assets` |
| Ranking scores, featured weights | Index / overlay calculation |
| Moderation risk flags | Moderation engine |
| Search index snapshots, embeddings | Platform indexing pipeline |
| "Latest activity" timestamps | Derived from events/messages |
| Notifications (L27) | Derived from `inquiry_events` + unread state — **not** a second workflow engine |

**Anti-pattern:** Admin UI that edits any of the above → ticket to remove.

---

## 8. Cross-surface serialization contract (Plan §24, L39)

For every public-facing read, a per-surface DTO is required. No raw table dumps on public routes.

| Surface | DTO function (naming convention) | Must include | Must NEVER include |
|---|---|---|---|
| Hub (`talenthub.io`) | `toHubTalentCard()`, `toHubProfilePublic()` | `talent_profiles` global fields with `hub_visible = true` + `ai_visible = true`, global taxonomy terms, approved media | Any column from `agency_talent_overlays`; agency-local field values; local tags; internal scores; commercial/pricing notes; moderation/eligibility flags |
| Agency storefront (A) | `toStorefrontTalentCard()`, `toStorefrontProfile()` | Canonical identity + `agency_talent_overlays` for this tenant + rostered global fields | Other tenants' overlays/rosters; hub-only internal states (`pending_hub_review` etc.) not productized as client-safe copy |
| Agency admin (X) | `toAdminInquiryDTO()`, `toAdminTalentDetailDTO()` | Everything tenant-scoped; platform-annotation flags when in support mode | Cross-tenant rows (never — RLS gates this) |
| Platform marketing (M) | `toMarketingPageDTO()` | `cms_pages` where `tenant_id IS NULL AND context = 'platform_marketing'` | Hub directory content; tenant storefront content |

**Enforcement stack (all three required):** API/server action layer + RLS + serialization DTO. Contract tests per surface prevent drift when fields are added.

---

## 9. Tables that explicitly stay global (never get `tenant_id`)

Plan §4 "Tables That Stay Global" + §4.5 "Existing Tables: Remain Global."

- `profiles`
- `talent_profiles` (adds provenance columns only)
- `talent_profile_taxonomy`
- `taxonomy_terms`
- `locations`, `countries`
- `field_groups`
- `field_definitions` (core scope; agency-local scope added in Phase 6 as rows, not columns)
- `field_values` (global scope; agency-local values live in `agency_field_values`)
- `talent_embeddings`
- `media_assets` (owned by `talent_profile_id`; tenant context is derived)

Adding `tenant_id` to any of these is a Decision Log event, not a casual migration.

---

## 10. Provenance required on cross-tenant or shared records

Plan §4. Every shared/governed record must know where it came from.

| Table | Provenance columns |
|---|---|
| `talent_profiles` | `created_by_agency_id`, `created_by_user_id_provenance`, `source_type` (`legacy`, `agency_created`, `freelancer_signup`, `platform_import`, `bulk_import`) |
| `agency_talent_roster` | `source_type` (`agency_added`, `agency_created`, `freelancer_claimed`, `platform_assigned`, `imported`), `added_by` |
| `agency_client_relationships` | `source_type` (`inquiry`, `direct`, `imported`, `referral`) |
| `inquiries` | `origin` (`client_direct`, `agency_added`, `hub_routed`), `hub_referral_id` (Plan §16) |

---

## 11. Four log layers (do not collapse)

Plan §14.5, L26, Charter §10 rule 7.

| Log | Scope | Reader | Writer | Retention |
|---|---|---|---|---|
| `platform_audit_log` | Security/compliance across tenants | Platform + agency (filtered) | System + platform actions (support-mode reads, emergency overrides, legal holds) | Long, immutable |
| `activity_log` | Tenant-scoped operational activity (user-visible timeline) | Tenant staff | System + capability-gated staff actions | Tenant policy |
| `inquiry_events` | Inquiry engine **facts** (state transitions, message posts, offer creations) | Tenant staff | Engine only (append-only) | Tenant retention; informs derived notifications (L27) |
| `inquiry_action_log` | Inquiry engine **attempts** — successes, failures, overrides (`booking_convert_override`, etc.) | Tenant staff + platform support | Engine + staff on override | Tenant retention |

**Rule:** Do not collapse these into a single table. They serve different readers and carry different semantics.

---

## 12. Open items this doc does not yet resolve

These depend on open decisions (see `../open-decisions.md`):

- **O6** — Client relationship model. Table lists assume global `client_profiles` + `agency_client_relationships` overlay; if the resolution changes to per-agency records, §3 and §4 rows for client tables must be rewritten.
- **O7** — Person as both talent AND agency staff. Affects `profiles` / `agency_memberships` / `talent_profiles` foreign key constraints.
- **Phase 1 — realtime tenancy, storage bucket tenancy, agency secrets, rate limiting** (Charter §10 #10). These are not tables per se but need ownership decisions before they're introduced. Flagged here so the ownership map is updated when they land.

---

## 13. Change control

When a new table is introduced (Phase 1–8 or later):
1. Add a row to the appropriate section above.
2. Classify zone (1–5). If ambiguous, raise in Decision Log before merging.
3. Declare who creates / edits / approves / sees.
4. State Phase 1 migration action (most new tables = `new`; modifications to existing rows = `add tenant_id` / `provenance`).
5. For any public-facing surface, reference the DTO that serializes it (§8).
6. Cross-link to the Plan section that defined it.
