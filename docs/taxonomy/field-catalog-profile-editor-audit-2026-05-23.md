# Field Catalog Profile Editor Audit - 2026-05-23

## Executive Summary

The field system has the right architectural direction, but the current product surface is not yet clean. There are two active eras in the codebase:

- The live database-driven catalog engine, centered on `profile_field_definitions`, `profile_field_recommendations`, `profile_field_groups`, workspace overrides, and `talent_profile_field_values`.
- A fixed profile shell with legacy/hardcoded sections and a stale `FIELD_CATALOG` file that still names several global concepts, including `skills`.

The database engine is capable of resolving universal, global, type-specific, and workspace-disabled fields. The profile editor also has dedicated homes for many of those concepts. The problem is presentation and governance: several global catalog fields have a dedicated editor section already, and when they are not suppressed they bleed into generic "About" or "Details" cards.

The specific reported issue was confirmed. `Skills & strengths` appeared on Details with no talent type selected because the database row `skills` is a `global` field with no active taxonomy assignment requirement. Since Details renders resolved catalog fields and the field was not suppressed, an untyped draft showed it as a Details field. That is not correct product behavior. `Skills & strengths` is not a true universal field. It is a legacy free-text alias for skills/strengths that now belong in Services/taxonomy or in type-specific structured fields.

Safe fix made in this pass:

- Hide the legacy `skills` catalog row from Details and route its product ownership to Services.
- Suppress `creator.*`, `media.*`, and `experience.*` global rows from About/Details when they have no active taxonomy group slug, because those concepts already have dedicated Media/Credits homes.
- Show an explicit empty state in Details: "Select a talent type in Services to see type-specific fields."
- Leave existing `skills` stored values untouched. There are existing rows in `talent_profile_field_values`, so this should be deprecated/migrated, not deleted.

No destructive data cleanup was performed.

## Scope And Sources

Primary route:

- Production requested route: `https://improntamodels.com/impronta/admin/roster`
- Production redirected to login in this session, so browser QA used the local Impronta workspace with the real dev auth path:
  - `http://localhost:3001/api/dev/signin?email=orantene%40gmail.com&password=12341234&next=%2Fadmin%2Froster`
  - `http://localhost:3001/impronta/admin/roster`

Primary code paths:

- Profile shell: `web/src/components/admin/shell/internal/drawers/profile-shell/TalentProfileShellDrawer.tsx`
- Section model: `web/src/components/admin/shell/internal/drawers/profile-shell/profile-shell-modules/profile-state.tsx`
- Live dynamic fields: `web/src/components/admin/shell/internal/live-category-fields-editor.tsx`
- Resolver: `web/src/lib/field-engine/resolve-talent-fields.ts`
- Effective visibility: `web/src/lib/field-engine/effective-visibility.ts`
- Tenant field settings: `web/src/lib/server-actions/admin-workspace-field-settings.ts`
- Platform catalog map: `web/src/app/(workspace)/platform/admin/catalog/page.tsx`
- Public profile field rendering: `web/src/app/t/[profileCode]/page.tsx`

Profiles tested:

| Profile | Code | Talent type state | Purpose |
|---|---:|---|---|
| Local QA | `TAL-92023` | No selected type | Reproduce no-type Details bug |
| Anto | `TAL-00036` | Commercial/lifestyle model | Model type-specific field set |
| Popi | `TAL-00039` | DJ/performer/singer related field set | Performer/DJ field set |
| QA Talent Dashboard Audit | `TAL-AUDIT-0512` | Multiple selected types | Multiple type merge behavior |

## Field Inventory

This inventory separates fixed shell fields from database catalog fields. "Fixed shell" means the field is rendered directly by the profile drawer state/modules, even if some data is later mirrored into catalog values. "Catalog" means it comes from `profile_field_definitions` through the field engine.

### Identity

| Field label | Source | Storage | Current visibility behavior | Type behavior | Recommendation |
|---|---|---|---|---|---|
| Stage / professional name | Fixed profile schema plus universal catalog definition `identity.stageName` | `talent_profiles` profile identity state, mirrored/defined in catalog | Public/profile-facing | Appears without type | Keep universal. This is the canonical public name. |
| First name | Fixed profile schema | `talent_profiles` identity/contact fields | Internal/profile editor | Appears without type | Keep universal but private/admin by default. |
| Last name | Fixed profile schema | `talent_profiles` identity/contact fields | Internal/profile editor | Appears without type | Keep universal but private/admin by default. |
| Legal name | Fixed profile schema plus universal catalog definition `identity.legalName` | `talent_profiles` or identity metadata | Private | Appears without type | Keep universal private/admin. Never public-toggleable. |
| Pronouns | Fixed profile schema plus universal catalog definition `identity.pronouns` | Profile identity metadata/catalog mirror | Public toggle shown | Appears without type | Keep universal, talent-controllable public/private. |
| Gender | Fixed profile schema | Profile identity metadata | Agency visibility shown | Appears without type | Keep optional and agency/private by default. Avoid public default. |
| Date of birth | Fixed profile schema plus universal catalog definition `identity.dob` | `talent_profiles` identity metadata | Private/agency, used to compute age | Appears without type | Keep universal private/admin. Public profile should render age only if explicitly allowed. |
| Nationality | Fixed profile schema plus universal catalog definition `identity.nationality` | Profile identity metadata | Agency by default | Appears without type | Keep optional, agency/private default. Operationally useful for bookings. |
| Country of residence | Fixed profile schema | Profile identity/location metadata | Not clearly public in UI | Appears without type | Keep, but clarify relationship to Location home base. |
| Email | Fixed profile schema plus universal catalog definition `identity.contactEmail` | Contact field | Private | Appears without type | Keep universal private/admin. Never public. |
| Phone | Fixed profile schema plus universal catalog definition `identity.contactPhone` | Contact field | Private | Appears without type | Keep universal private/admin. Never public. |
| WhatsApp | Fixed profile schema | Contact field | Private/agency implied | Appears without type | Keep optional private/admin. |
| Business line | Fixed profile schema | Contact field | Private/agency implied | Appears without type | Keep optional private/admin. |
| Reply time | Fixed shell service commitment field | Profile metadata | Public toggle shown | Appears without type | Keep universal if it is used in public cards/discover filters. Otherwise move to Availability. |
| Tagline | Fixed shell profile copy field | Profile metadata | Public copy | Appears without type | Keep universal public copy. |
| Show me on Tulala Discover | Fixed shell/platform visibility control | Directory/profile visibility settings | Internal/admin-controlled toggle | Appears without type | Keep in Identity or Admin, but copy should make tenant/public effects explicit. |

Identity is mostly coherent. The main risk is mixing public branding fields with sensitive legal/contact fields in one section. That is acceptable if visibility floors stay hard and legal/contact rows cannot be widened to public.

### Location

| Field label | Source | Storage | Current visibility behavior | Type behavior | Recommendation |
|---|---|---|---|---|---|
| Current location / home base | Fixed shell plus universal catalog definition `serviceArea.homeBase` | Profile location metadata and/or catalog value | Public/agency | Appears without type | Keep universal. This should be the canonical public location/filter anchor. |
| Service areas | Fixed shell/editor loading state | Service-area JSON/catalog bridge | Public-facing implied | Appears without type | Keep universal. Ensure it resolves cleanly and is filter-compatible. |
| Visiting / Away destinations | Fixed shell | Travel/location JSON | Public page copy says shown publicly | Appears without type | Keep universal but tenant can disable. This is useful for travel-heavy talent. |
| Seasonal windows | Fixed shell | Travel/location JSON | Public/agency unclear | Appears without type | Keep tenant-configurable. Good for seasonal talent, noisy for small rosters. |

Location overlaps with Logistics. Public geography belongs here. Travel documents, visas, licenses, and vehicles belong in Logistics.

### About

| Field label | Source | Storage | Current visibility behavior | Type behavior | Recommendation |
|---|---|---|---|---|---|
| Bio, language-specific | Fixed shell plus global catalog definition `bios` | Profile bio fields/localized metadata | Public | Appears without type | Keep universal/global public. This should be part of Universal Field Set V1. |
| Add language | Fixed shell editor control | Bio locale state | Editor-only | Appears without type | Keep. |
| Pick Talent Type to regenerate | Fixed shell AI/content helper | Editor-only | Editor-only | Appears without type | Keep only if regeneration depends on selected Services. Disable when no type. |
| Paste from clipboard | Fixed shell helper | Editor-only | Editor-only | Appears without type | Keep. |
| I love | Fixed shell personality field | Profile personality/preferences JSON | Public-facing implied | Appears without type | Keep as optional public personality. It should not be required for publish. |
| I avoid | Fixed shell personality field | Profile personality/preferences JSON | Public-facing implied | Appears without type | Keep only as soft public preference. Operational hard limits belong in Restrictions. |
| Languages | Fixed shell plus universal catalog definition `languages` | Structured language/profile catalog field | Public/agency | Appears without type | Keep universal. Consider moving to its own structured row inside About, as it is today. |

Before this fix, global `creator.*`, `media.*`, and `experience.*` rows could bleed into About/Details when no taxonomy group was active. The UI now suppresses those namespaces because Media, Credits, and Past clients already own those concepts.

### Services

| Field label | Source | Storage | Current visibility behavior | Type behavior | Recommendation |
|---|---|---|---|---|---|
| Primary category | Fixed taxonomy selector | Talent taxonomy assignment tables | Drives editor and public filters | Empty on no-type profile | Keep as the canonical type source. This must drive Details. |
| Skills in this category | Fixed taxonomy selector | Taxonomy skill assignments, not free-text Details | Public/filter-facing | Depends on selected category | Keep in Services. This is the correct home for skills/strengths. |
| Best fit contexts | Fixed taxonomy selector | Taxonomy context assignments | Public/filter-facing | Appears without type but empty | Keep in Services. It is search/ranking metadata, not About copy. |

Services is the right source of truth for taxonomy selection. Details should not invent free-text skill fields before Services is set.

### Details

| Scenario | Visible fields/groups | Source | Storage | Current visibility behavior | Recommendation |
|---|---|---|---|---|---|
| No talent type selected, before fix | `Skills & strengths` | Catalog row `skills`, tier `global`, section `skills` | `talent_profile_field_values` when edited | Public/agency allowed | Incorrect. Fixed by suppressing this legacy row from Details. |
| No talent type selected, after fix | Empty state: "Select a talent type in Services to see type-specific fields." | Details shell plus field engine result | No value storage | Not a field | Correct. Details should be empty until a type creates applicable details. |
| Model profile | Physical/Casting fields plus Model details | Type-specific catalog fields resolved through `profile_field_recommendations` | `talent_profile_field_values`, with some legacy mirror fields for measurements/media | Field cards have visibility controls where allowed | Keep type-specific. Consider making Polaroids and model measurements enabled only when model types are active. |
| Performer/DJ profile | Physical/Casting, Equipment/Tools, Operational Requirements, Music details, Performer details, Singer details | Type-specific catalog fields resolved from selected/parent taxonomy | `talent_profile_field_values` | Field cards have visibility controls | Keep. Group names are understandable, but broad physical/casting group should be tenant-controlled for non-model performers. |
| Multiple type profile | Deduped union of matching groups such as Equipment/Tools, Operational Requirements, Photo/Video details, Physical, Wellness details | Resolver union across assigned types | `talent_profile_field_values` | Single cards, no duplicate `skills` row after fix | Keep union behavior. Continue testing de-duplication with shared fields. |

Details is now doing the right high-level thing: no type means no type-specific details. The next cleanup is catalog lifecycle, especially deprecating `skills`.

### Logistics

| Field label | Source | Storage | Current visibility behavior | Type behavior | Recommendation |
|---|---|---|---|---|---|
| Passport status | Fixed shell/logistics field, also catalog-adjacent service namespace exists | Profile logistics/travel JSON | Agency | Appears without type | Keep universal optional, agency/private by default. |
| Driver's license | Fixed shell plus suppressed catalog key `service.has_drivers_license` | Profile logistics JSON/catalog mirror | Agency | Appears without type | Keep, but tenant/type control should hide for irrelevant workspaces. |
| Owns a vehicle | Fixed shell plus suppressed catalog key `service.owns_vehicle` | Profile logistics JSON/catalog mirror | Agency/private | Appears without type | Keep tenant/type configurable. |
| Work-eligible countries | Fixed shell | Logistics JSON | Agency | Appears without type | Keep agency/private. Useful for cross-border bookings. |
| Visas held | Fixed shell | Logistics JSON | Agency | Appears without type | Keep agency/private. |

Logistics is coherent, but too universal for every tenant. Platform should provide these fields, tenants should decide if their roster needs them.

### Availability

| Field label | Source | Storage | Current visibility behavior | Type behavior | Recommendation |
|---|---|---|---|---|---|
| Day grid open/busy/blocked | Fixed shell | `availability_data` JSON | Operational; public impact unclear | Appears without type | Keep private/agency by default unless public availability is explicitly designed. |
| Recurring pattern | Fixed shell | `availability_data` JSON | Operational | Appears without type | Keep, but connect to booking/inquiry logic or label as profile-only. |
| Vacation mode | Fixed shell | `availability_data` JSON | Operational | Appears without type | Keep private/agency by default. |

Availability is saved profile data, but it is not clearly integrated into booking/inquiry availability. Completion should not treat it like public profile quality unless the booking engine consumes it.

### Media

| Field label | Source | Storage | Current visibility behavior | Type behavior | Recommendation |
|---|---|---|---|---|---|
| Hello reel | Fixed shell media system | Media/profile asset storage | Public/portfolio | Appears without type | Keep global, tenant-configurable. |
| Video/social links | Fixed shell; catalog also has `media.social_links` and creator handles | Profile media/social JSON and catalog values | Public/agency | Appears without type | Keep in Media. Suppress duplicate catalog cards from About/Details. |
| Headshot/profile image | Core media system plus universal catalog definition `media.headshot` | Media asset/profile image storage | Public | Core profile field | Keep universal. This is not just a catalog field. |
| Cover/portfolio/showreel/social links | Catalog definitions plus fixed media/editor systems | Media JSON/assets and/or `talent_profile_field_values` | Public/agency | Global | Keep, but route all editing to Media so fields do not scatter. |

Media should remain a core profile system with catalog definitions as metadata. It should not be rendered as a generic dynamic field group in About.

### Albums

| Field label | Source | Storage | Current visibility behavior | Type behavior | Recommendation |
|---|---|---|---|---|---|
| Portfolio albums | Fixed shell media album system | Album/media storage JSON/bridge | Public portfolio implied | Appears without type | Keep global. Tenant can disable if a workspace uses simple profiles. |
| Main album | Fixed shell media album system | Album/media storage | Public portfolio implied | Appears without type | Keep. |
| Add album / Manage albums | Fixed shell controls | Media album storage | Editor-only | Appears without type | Keep. |

Albums and Media overlap but do not fully duplicate: Media is core hero/video/social, Albums organize galleries. The UI copy should make that division clear.

### Polaroids

| Field label | Source | Storage | Current visibility behavior | Type behavior | Recommendation |
|---|---|---|---|---|---|
| Front | Fixed shell polaroid system | Media/polaroid asset storage | Casting/public or agency unclear | Appears without type | Make model/type/tenant-controlled. |
| Side | Fixed shell polaroid system | Media/polaroid asset storage | Casting/public or agency unclear | Appears without type | Make model/type/tenant-controlled. |
| Back | Fixed shell polaroid system | Media/polaroid asset storage | Casting/public or agency unclear | Appears without type | Make model/type/tenant-controlled. |
| Smile | Fixed shell polaroid system | Media/polaroid asset storage | Casting/public or agency unclear | Appears without type | Make model/type/tenant-controlled. |
| No makeup | Fixed shell polaroid system | Media/polaroid asset storage | Casting/public or agency unclear | Appears without type | Make model/type/tenant-controlled. |

Polaroids are valuable for model casting but not universal. They should hide for non-model tenants/types unless enabled by workspace policy.

### Rates

| Field label | Source | Storage | Current visibility behavior | Type behavior | Recommendation |
|---|---|---|---|---|---|
| Rate visibility | Fixed shell | `rate_card_visibility` or rates JSON | Public/agency/on-request | Appears without type | Keep tenant-controlled. Default should be agency-only or on-request for most tenants. |
| Pricing mode | Fixed shell | Rates JSON | Public impact | Appears without type | Keep. |
| Per-type rate prompt | Fixed shell tied to Services | Rates JSON by talent type | Requires selected type | Keep. This correctly depends on Services. |
| Package bundles | Fixed shell | `package_rates_data` | Public/agency depending visibility | Appears without type | Keep tenant-controlled. |
| Travel included | Fixed shell | Rates/travel JSON | Public/agency | Appears without type | Keep, but avoid duplicate with Logistics. |
| Lodging included | Fixed shell | Rates/travel JSON | Public/agency | Appears without type | Keep, but avoid duplicate with Logistics. |
| Talent can edit | Fixed shell field lock control | Field lock/admin metadata | Admin-only | Appears without type | Keep admin-only. |

Rates should not be public by default. Public rate behavior should be a tenant-level policy, not a per-field surprise.

### Restrictions

| Field label | Source | Storage | Current visibility behavior | Type behavior | Recommendation |
|---|---|---|---|---|---|
| No nudity | Fixed shell quick limit | `limits_data` JSON | Clients see on brief | Appears without type | Keep operational/private or brief-visible, not generic public profile by default. |
| No fur | Fixed shell quick limit | `limits_data` JSON | Clients see on brief | Appears without type | Keep operational/private or brief-visible. |
| Lingerie case-by-case | Fixed shell quick limit | `limits_data` JSON | Clients see on brief | Appears without type | Keep operational/private or brief-visible. |
| No tobacco / vape | Fixed shell quick limit | `limits_data` JSON | Clients see on brief | Appears without type | Keep. |
| No alcohol | Fixed shell quick limit | `limits_data` JSON | Clients see on brief | Appears without type | Keep. |
| No religious imagery | Fixed shell quick limit | `limits_data` JSON | Clients see on brief | Appears without type | Keep. |
| Vegan only | Fixed shell quick limit | `limits_data` JSON | Clients see on brief | Appears without type | Keep. |
| Custom limit | Fixed shell quick limit | `limits_data` JSON | Clients see on brief | Appears without type | Keep with clear privacy. |

Restrictions duplicate the softer "I avoid" concept. Product rule: "I avoid" is public/personality preference; Restrictions are operational booking limits, private/agency or brief-visible by default.

### Credits

| Field label | Source | Storage | Current visibility behavior | Type behavior | Recommendation |
|---|---|---|---|---|---|
| Add credit | Fixed shell plus experience/credits catalog concepts | `credits_data` JSON and/or catalog values | Public trust-building implied | Appears without type | Keep public/agency. Should own structured work history. |

Credits should absorb "experience" catalog rows that are not specific enough for Details.

### Past Clients

| Field label | Source | Storage | Current visibility behavior | Type behavior | Recommendation |
|---|---|---|---|---|---|
| Add client | Fixed shell social proof system | `social_proof_data` JSON | Public trust-building implied | Appears without type | Keep, but define relationship to Credits. |
| Testimonials | Fixed shell social proof system | `social_proof_data` JSON | Public if approved | Appears without type | Keep public only after tenant/admin approval. |

Credits and Past clients overlap. Credits should be structured work entries. Past clients should be brand/client logos and approved testimonials.

### Trust

| Field label | Source | Storage | Current visibility behavior | Type behavior | Recommendation |
|---|---|---|---|---|---|
| Verification level | Fixed shell trust system | Profile verification state | Public badge/agency | Appears without type | Keep computed/admin-controlled. |
| Trust preview note | Fixed shell trust copy | Computed/editor state | Public preview | Appears without type | Keep. |
| Email verified | Fixed shell | Auth/contact verification state | Internal/admin | Appears without type | Keep admin/system-controlled. |
| Phone verified | Fixed shell | Verification state | Internal/admin | Appears without type | Keep admin/system-controlled. |
| ID submitted | Fixed shell | Documents/trust state | Private/admin | Appears without type | Keep private/admin. |
| Payout connected | Fixed shell | Billing/payout state | Private/admin | Appears without type | Keep private/admin. |
| Funded-account client | Fixed shell | Booking/payment-derived trust state | Public badge input/admin | Appears without type | Keep computed. |
| Bookings completed | Fixed shell | Booking count | Public badge input | Appears without type | Keep computed. |

Trust should not become an editable catalog bucket. It is mostly computed from verification, bookings, and files.

### Files

| Field label | Source | Storage | Current visibility behavior | Type behavior | Recommendation |
|---|---|---|---|---|---|
| Upload file | Fixed shell file system | File storage plus document metadata | Admin-only by default | Appears without type | Keep admin-only default. |
| Common files copy | Fixed shell helper | Editor-only | Editor-only | Appears without type | Keep. |
| Talent sees but does not edit unless shared | Fixed shell permission rule | Document permissions | Private/admin | Appears without type | Keep. Verify storage policies before public expansion. |

Files are correctly separate from Trust. Files are source documents; Trust is derived/computed status.

### Agency Fields

| Field label | Source | Storage | Current visibility behavior | Type behavior | Recommendation |
|---|---|---|---|---|---|
| No custom fields visible for tested Impronta profile | Fixed shell custom field region | Workspace custom field definitions when present | Agency/admin | No visible row in tested profile | Keep section, but it currently does not prove a complete tenant custom field system. |
| Add custom field control, where enabled | Fixed shell / tenant custom field UI | Workspace custom fields metadata | Admin-only | Tenant-level | Finish true tenant custom field creation, lifecycle, ordering, and public/private defaults. |

Tenant Field Catalog currently controls platform-provided fields. Fully custom tenant fields are still incomplete/coming soon.

### Admin

| Field label | Source | Storage | Current visibility behavior | Type behavior | Recommendation |
|---|---|---|---|---|---|
| Feature in directory | Fixed shell admin control | Directory/profile ranking metadata | Admin-only | Appears without type | Keep admin-only. |
| Internal notes | Fixed shell admin field | Admin notes/profile metadata | Admin-only | Appears without type | Keep admin-only. |
| Emergency contact | Fixed shell admin/ops field | Emergency contact metadata | Masked; coordinator-only during active bookings | Appears without type | Keep private/admin. |
| Profile ownership | Fixed shell account/claim system | Ownership/invite state | Admin-only | Appears without type | Keep. |
| Send claim invite | Fixed shell account action | Invite/account state | Admin-only | Appears without type | Keep. |
| Locked fields | Fixed shell permissions | Field lock metadata | Admin-only | Appears without type | Keep and connect to tenant field settings. |
| Recent activity | Fixed shell audit panel | Audit log | Admin-only | Appears without type | Keep. |

Admin fields are not mixed into public content. The main gap is making publish/completion logic honor admin/tenant catalog requirements.

## Taxonomy Audit

The current taxonomy is broad enough for a general service marketplace, not just an Impronta-style talent roster.

Observed active term scale:

| Kind | Count | Notes |
|---|---:|---|
| Parent categories | 19 | Models, Hosts & Promo, Performers, Music & DJs, Chefs & Culinary, Wellness & Beauty, Photo/Video/Creative, Influencers/Creators, and many operations/service categories. |
| Category groups | 75 | Used as middle layer for editor/public organization. |
| Talent types | 398 | Too many to expose as an undifferentiated roster selector. |
| Skills/attributes/contexts/credentials | 400+ combined | Useful, but should be curated per tenant/type. |

Public/talent-facing parents that make sense for Impronta-like rosters:

| Parent | Current shape | Recommendation |
|---|---|---|
| Models | Strong core. Includes fashion, editorial, runway, commercial, lifestyle, promo, content, specialty. | Keep, but reduce duplicate generic `model` leaves and clarify parent/group/leaf. |
| Hosts & Promo | Strong core but overlaps with promo model, brand ambassador, event staff. | Keep, but alias host/hostess/event host and clarify brand ambassador ownership. |
| Performers | Useful. Includes dancer, actor, stage/show acts. | Keep. Decide if Dancer is a child of Performer, not a parallel mental model. |
| Music & DJs | Useful. DJs, singers, musicians, bands. | Keep. DJ subtypes are good; equipment requirements should be type-specific. |
| Photo, Video & Creative | Useful for production rosters. | Keep optional per tenant. |
| Influencers & Creators | Useful, but overlaps with content model and UGC creator. | Keep, but model Content creator, Influencer, and UGC creator as related/aliased, not random siblings. |
| Wellness & Beauty | Useful for certain tenants. | Tenant-enable by default only if the workspace books these services. |
| Chefs & Culinary | Useful platform-wide, not core Impronta by default. | Tenant-enable, not default public roster for Impronta unless asked. |

Operational/service parents that should be platform-global but tenant-disabled by default for Impronta:

- Event Staff
- Hospitality & Property
- Travel & Concierge
- Transportation
- Home & Technical Services
- Security & Protection
- Sports & Fitness
- Kids & Family Services
- Speakers, Coaches & Experts
- Production & BTS
- Animals & Specialty Acts

Taxonomy issues:

| Issue | Example | Recommendation |
|---|---|---|
| Generic leaves duplicate parent labels | `Model` as parent/group/leaf concept | Keep generic as fallback, but hide/alias it when a more specific type is selected. |
| Gendered or near-synonym host labels | Host, hostess, event host, event hostess, guest experience host | Normalize display labels and keep synonyms as aliases/search terms. |
| Promo overlap | Promo model, brand ambassador, promotional ambassador, event staff | Decide whether booking intent is modeling, hosting, or staffing. Use aliases for synonyms. |
| Creator overlap | Content creator, influencer, UGC creator, social media model | Keep as related leaves under Creator, but share social metric fields. |
| Type list too wide for tenants | 398 talent types | Add tenant-enabled type sets. Do not expose all by default. |
| Type-specific fields can apply from multiple levels | Parent/category/leaf recommendations merge | Keep resolver union, but audit duplicate field recommendations by group. |

## Universal Field Set V1 Recommendation

Recommended universal public/core fields:

| Field | Default visibility | Owner | Notes |
|---|---|---|---|
| Stage/professional name | Public | Platform | Canonical public name. |
| Profile image/headshot | Public | Platform/media system | Required for public roster quality. |
| Bio/about, localized | Public | Platform | 2-3 sentence profile. |
| Languages | Public or agency, tenant policy | Platform | Structured language field. |
| Home base/current location | Public or agency, tenant policy | Platform | Search/filter anchor. |
| Service areas | Public or agency, tenant policy | Platform | Useful for bookings. |
| Primary talent type | Public/filter | Taxonomy | Required for intelligent Details. |
| Best-fit contexts | Public/filter | Taxonomy | Search/ranking metadata. |
| Availability summary | Private/agency by default | Tenant | Public only if product supports it. |
| Profile visibility/status | Admin/platform | Platform | Draft/live/hidden/public state. |
| Contact email/phone | Private/admin | Platform | Never public. |
| Legal name/DOB | Private/admin or agency | Platform | Universal in storage, not public profile content. |

Fields to remove from universal/global presentation:

| Field | Current state | Recommended action |
|---|---|---|
| `skills` / Skills & strengths | Global catalog row, appeared in Details without type | Hide from editor, mark deprecated, migrate real values into Services skills or bio/credits if useful. |
| Generic creator/media/experience catalog rows | Global, can bleed into About/Details | Route to Media or Credits; suppress from dynamic generic sections. |
| Polaroids | Fixed section visible without type | Make model/type/tenant controlled. |
| Driver/vehicle logistics | Visible for all profiles | Keep platform-available, tenant/type-controlled. |

## Duplicate And Overlap Table

| Field A | Field B | Problem | Recommended action |
|---|---|---|---|
| Skills & strengths | Services skills/specialties | Free-text legacy skill row competes with taxonomy skill selection | Hide/deprecate `skills`; Services owns skills. |
| Skills & strengths | Type-specific Details fields | Ambiguous generic Details field appears before type selection | Fixed in UI; do not show before type. |
| I avoid | Restrictions | Similar "things I do not do" meaning | Keep I avoid as soft public preference; Restrictions as operational/private or brief-visible limits. |
| Languages in About | `languages` catalog row | Same field has fixed and catalog representation | Keep one fixed structured UI; suppress duplicate dynamic card. |
| Media category in About | Media section | Portfolio/social fields can show in the wrong section | Fixed suppression fallback; Media owns editing. |
| Experience in About | Credits/Past clients | Experience belongs with proof/work history | Suppress from About; route to Credits/Past clients. |
| Website/social/portfolio | Media/social links | Same public links could live in two places | Media owns; About can mention in prose only. |
| Travel in Location | Travel docs in Logistics | Public geography vs operational travel eligibility mixed | Location owns where talent works; Logistics owns documents/eligibility. |
| Availability | Booking restrictions | Time availability vs terms/limits can blur | Availability owns schedule; Restrictions owns content/client/job limits. |
| Rates | Admin/internal pricing | Public price card and internal rate notes can mix | Rates UI needs public/agency/on-request defaults; admin/internal rates stay private. |
| Trust | Files | Verification status and source documents are different concepts | Keep separate; Trust computed, Files private/admin. |
| Credits | Past clients | Both build public trust | Credits are structured work entries; Past clients are client logos/testimonials. |
| Polaroids | Media albums | Both are images, but different booking use cases | Polaroids model-specific; Albums portfolio-wide. |

## Details Page Decision

Why did `Skills & strengths` appear with no talent type?

- The field definition `skills` exists in `profile_field_definitions`.
- It is `tier = global`, label `Skills & strengths`, default visibility public/agency, and not sensitive/admin-only.
- The resolver includes `universal` and `global` fields even when the talent has no taxonomy assignment.
- Details filtered resolved fields but did not suppress the `skills` row.
- Result: an untyped profile showed `0/1 complete` and one empty Details card.

Is that correct?

No. Details copy says it contains type-specific fields for the talent's categories. Showing a global free-text skills field before a category is selected contradicts that mental model and duplicates Services.

What changed?

- `skills` is now suppressed from dynamic Details and routed conceptually to Services.
- Details now shows a no-type empty state.
- Stored data was not deleted.

Recommended data lifecycle:

1. Mark `skills` deprecated or hidden in platform catalog.
2. Audit the 50 existing values in `talent_profile_field_values`.
3. Migrate useful values into bio/credits/taxonomy skill assignments where possible.
4. Keep legacy read-only access during migration.
5. Remove only after confirming no public/profile dependency.

## Tenant Field Catalog Control

Current tenant/workspace controls:

| Capability | Current state | Gap |
|---|---|---|
| Enable/disable platform fields | Supported through `workspace_profile_field_settings.enabled_override` | Needs clearer QA around editor/public/profile count effects. |
| Enable/disable platform groups | Supported through `workspace_field_group_settings.enabled_override` | Good, but group copy/order should be easier to preview. |
| Mark fields required | Supported as workspace override | Not fully unified with publish gate. |
| Relabel/helper copy | Supported for platform fields | Good. |
| Field privacy defaults | Supported through Field Privacy/effective visibility | UI should reflect hard floors for sensitive/admin-only fields. |
| True tenant custom fields | UI hints exist; not complete | Needs create/edit/lifecycle/order/storage implementation. |
| Tenant-enabled talent types | Taxonomy model supports workspace enablement conceptually | Needs complete admin UX and default type sets for Impronta. |
| Reorder display | Platform/group order mostly inherited | Need tenant-safe ordering where allowed. |

Current platform controls:

| Capability | Current state | Gap |
|---|---|---|
| View global catalog map | Supported at `/platform/admin/catalog` | Good read-only observability. |
| View field detail/risk | Supported | Good. |
| Export CSV/JSON | Supported | Good. |
| Create/edit global definitions | Migration/seed/code-driven, not Platform Admin UI | Needed before non-engineers can govern catalog. |
| Lifecycle state management | Partial through `deprecated_at` and flags | Needs explicit states: active, hidden, deprecated, tenant-only, platform-only, experimental, archived. |
| Global taxonomy management | Seed/code-driven and platform pages | Needs controlled admin workflow, alias support, and tenant enablement. |

Recommended control hierarchy:

| Actor | Should control |
|---|---|
| Platform Admin | Global field definitions, lifecycle state, taxonomy, default universal set, supported visibility modes, deprecation/migration, which fields are available to tenants. |
| Tenant Admin | Enabled talent types, enabled available fields, required/optional, default visibility within platform floors, display order where allowed, relabel/helper copy, tenant custom fields, tenant-specific internal tags. |
| Talent | Values for fields tenant/platform allow them to edit, plus narrower visibility where allowed. |
| Client/Public | Only live, approved, public fields after tenant/platform visibility and draft/publish gates. |

## Public Visibility And Privacy

Current architecture has a good visibility floor in `effective-visibility.ts`: admin-only and sensitive fields cannot be widened to public. Public profile rendering also filters live values, deprecated fields, tenant disabled fields, and orphaned type-specific values.

Risks found:

| Risk | Example | Recommendation |
|---|---|---|
| UI can imply public toggles broadly | Dynamic field cards expose visibility controls | Make hard floors visible in UI. Do not show a public option for sensitive/admin-only fields. |
| Catalog has inconsistent public flags | `experience.years_total` has agency default but public flag behavior should be reviewed | Run platform catalog risk triage before broad public launch. |
| Sensitive-but-public platform risks exist | Platform Catalog showed many risk warnings | Prioritize risk review for physical measurements, documents, rates, and contact fields. |
| Files privacy depends on storage policies | Files section says admin-only by default | Verify storage/RLS before expanding file sharing. |

## Completion And Publish Logic

Today there are two completion systems:

1. Section completion in the drawer, including Details counts from visible resolved catalog fields.
2. Publish readiness, which is still mostly hardcoded in the shell.

Observed publish gate behavior:

- Shows profile progress such as `4/18`.
- Shows "Add 3 to publish" for the no-type Local QA profile.
- Core publish requirements include fixed concepts such as public name, type, home base, photos, bio length, and language.
- Legacy model measurement logic still references old-style type assumptions.
- Tenant `required_override` from Field Catalog is not clearly unified with the publish gate.

Problems:

| Problem | Impact | Recommendation |
|---|---|---|
| No-type Details counted `Skills & strengths` before fix | Misleading `0/1` type-specific completion | Fixed by hiding `skills` and showing empty state. |
| Hardcoded publish requirements do not fully use resolver | Tenant-required fields may not block publish consistently | Move publish validation to a resolver-backed requirement list. |
| Disabled/deprecated/hidden fields could drift from counts | Bad onboarding and false incompleteness | Count only visible, enabled, active fields. |
| Type-specific requirements before type selection | Punishes profiles before taxonomy exists | Type-specific fields should count only after Services selection. |
| Public value of availability/rates unclear | Completion may reward low-value/sensitive data | Separate "profile quality" from operational completeness. |

Recommended publish/completion model:

- Universal minimum: stage name, primary type, home base/service area, profile image, bio, languages, visibility status.
- Tenant required fields: resolver-backed `required_override` after applying workspace/type/visibility filters.
- Type-specific requirements: only for selected types.
- Do not count hidden, deprecated, tenant-disabled, admin-only, or migration-only fields toward public completion.
- Keep "Add N to publish" tied to actual blocking requirements, not optional profile polish.

## Field Lifecycle Model

Recommended states:

| State | Meaning |
|---|---|
| active | Normal field. Can render and save. |
| hidden | Stored and readable by admins, not shown in editor/public. |
| deprecated | Still readable for migration/history, not used for new input. |
| tenant-only | Created by a tenant, not platform-global. |
| platform-only | System/internal field, not tenant editable. |
| experimental | Available only to selected tenants or admins. |
| archived | No longer in active UI; retained only for historical data. |

Immediate lifecycle recommendation:

- `skills`: mark hidden/deprecated after migration plan, do not delete.
- Global media/creator/experience rows: keep active definitions if public/profile needs them, but route editing to dedicated sections.
- Polaroids: platform active, tenant/type gated.

## Fixes Made

Files changed:

| File | Change |
|---|---|
| `web/src/components/admin/shell/internal/live-category-fields-editor.tsx` | Suppressed `skills` from dynamic Details, added namespace fallback suppression for `creator`, `media`, and `experience`, and changed the no-field Details empty state. |
| `docs/taxonomy/field-catalog-profile-editor-audit-2026-05-23.md` | Added this audit report. |

No database migrations or destructive data changes were made.

## QA Evidence

Routes tested:

| Route | Result |
|---|---|
| `http://localhost:3001/impronta/admin/roster` | Loaded local Impronta roster after dev auth. |
| `http://localhost:3001/impronta/admin/settings` | Opened tenant Field Catalog drawer. |
| `http://localhost:3001/platform/admin/catalog?q=skills` | Loaded Platform Catalog Map filtered to skills. |

Browser screenshots:

| Evidence | Path |
|---|---|
| No-type Details after fix | `/tmp/tulala-field-audit-details-no-type-after.png` |
| Performer/DJ Details | `/tmp/tulala-field-audit-popi-details.png` |
| Multiple-type Details | `/tmp/tulala-field-audit-multiple-details.png` |
| Tenant Field Catalog | `/tmp/tulala-field-audit-tenant-catalog.png` |
| Platform Catalog | `/tmp/tulala-field-audit-platform-catalog.png` |

Detailed section scrape:

- `/tmp/tulala-field-audit-localqa-sections.json`

Resolver checks:

| Profile | Result |
|---|---|
| `TAL-92023` no type | Resolved catalog fields still include platform globals, but rendered specialty Details count is `0`; `skills` hidden. |
| `TAL-00036` model | Model fields render; `skills` absent. |
| `TAL-00039` DJ/performer | Music/performer/equipment/ops fields render; `skills` absent. |
| `TAL-AUDIT-0512` multiple type | Union of photo/wellness/equipment/ops/physical fields renders; duplicate `skills` absent. |

Non-blocking browser console note:

- The local browser session showed two 404 resource errors during QA. The roster/editor pages still loaded and the field behavior was testable.

## Follow-Up Plan

Critical before more profile work:

1. Deprecate or hide the `skills` catalog row at the data lifecycle level after migration review.
2. Unify publish/completion validation with the field resolver and tenant `required_override`.
3. Add tenant-enabled talent type sets so Impronta does not inherit every platform service category by default.
4. Make Polaroids model/type/tenant controlled.
5. Triage Platform Catalog risk warnings for public/sensitive fields.

Important product polish:

1. Clarify Credits vs Past clients in UI and data model.
2. Clarify I avoid vs Restrictions copy and visibility defaults.
3. Keep media/social/portfolio editing in Media only.
4. Make Logistics fields tenant/type configurable by default.
5. Explain Details empty state near Services selection and ensure jump-to-empty skips empty Details with no type.

Future architecture:

1. Build Platform Admin write controls for field lifecycle, deprecation, and global taxonomy aliases.
2. Finish true tenant custom fields with lifecycle, ordering, storage, privacy defaults, and public rendering rules.
3. Add alias/synonym support for overlapping talent types.
4. Add automated tests for no-type Details, multi-type de-duplication, tenant-disabled fields, and publish requirement resolution.
5. Add a catalog migration dashboard for legacy fixed fields mirrored into database catalog definitions.
