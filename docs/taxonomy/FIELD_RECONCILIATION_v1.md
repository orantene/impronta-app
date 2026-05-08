# Field Reconciliation V1

**Generated:** 2026-05-07
**Status:** Decisive (marathon mode — no per-row review gate).
**Scope:** All 179 active fields in `profile_field_definitions`.
**Safety:** All 179 rows have `values_count = 0` — zero talent have filled any field. Rename/merge is risk-free for data.

---

## Summary

| Action | Count |
|---|---|
| KEEP (set field_group_id only) | 30 |
| RENAME (canonical key change, alias preserved) | 110 |
| MERGE (duplicate concept → canonical existing field) | 31 |
| ARCHIVE (obsolete / replaced by structured table) | 8 |
| **Total** | **179** |

After reconciliation, ~141 active definitions remain (some merges retire one field into another).

---

## Naming convention rules applied

1. **Plural parent → singular field-key prefix.** `chefs.*` → `chef.*`, `creators.*` → `creator.*`, `hosts.*` → `host.*`, `performers.*` → `performer.*`, `photo_video.*` → `photo.*` (or `video.*`), `transportation.*` → `transport.*`, `wellness.*` → `wellness.*` (already singular), `event_staff.*` → `event.*`, `hospitality.*` → `hosp.*`, `music.*` → `music.*` (already singular), `security.*` → `security.*` (already singular).
2. **camelCase → snake_case.** `measurements.heightImperial` → `physical.height_imperial`, `identity.responseTime` → `identity.response_time`.
3. **Cross-cutting concepts (height, weight, eye color, allergies) move into shared groups.** Models-specific bust/waist/hips → `physical.bust_cm`, etc.
4. **Languages NEVER stored as catalog fields.** All `*.languages_*` ARCHIVE; talent_languages structured table is source of truth.
5. **Cross-type "experience_yrs"** → MERGE into single global `experience.years_total` field.
6. **`dyn.*` placeholders** are leftover prototype scaffolding → ARCHIVE.

---

## Field group assignments

Each retained field is mapped to one of the 13 groups (created in Phase 3):

```
physical-casting              → height, weight, measurements, hair/eye/skin, sizes, tattoos, allergies, marks
media-portfolio               → media.*, social/links, *.handle (IG, TikTok, YT)
experience                    → experience.*, *.experience_yrs (merged), credits, reviews, references
service-area-travel           → serviceArea.*, travel.*
languages-communication       → kept fields like communication.* (TBD — most archived in favor of talent_languages)
sales-client-interaction      → seeded in Phase 4 (no existing rows)
equipment-tools               → music.equipment, photo_video.kit, transportation.vehicle, wellness.travel_kit, etc.
certifications-documents      → *.insurance, *.license, *.certifications, security.weapons_certified, *.first_aid
rates-booking                 → rates, chef.tasting_menu_pp, creator.rate_post/reel, transportation.* rates
availability                  → seeded in Phase 4 (no existing rows)
context-best-fit              → mostly handled by taxonomy (talent_profile_taxonomy contexts)
trust-verification            → seeded as separate concept (talent_profile_trust_badges, NOT a catalog group)
operational-requirements      → performers.rig_required, music.tech_rider, photo_video.studio_access, etc.
```

---

## Detail by section

### 1. UNIVERSAL fields (11 rows) — ALL KEEP

These remain unchanged. Mostly already in canonical form on `talent_profiles`.

| Field key | Action | Field group | Notes |
|---|---|---|---|
| consent.terms | KEEP | (none — universal) | |
| identity.contactEmail | KEEP | (none — universal) | |
| identity.contactPhone | KEEP | (none — universal) | |
| identity.dob | KEEP | (none — universal) | Required-before-publish (not registration) per V1 trim |
| identity.legalName | KEEP | (none — universal) | Required-before-verification only |
| identity.nationality | KEEP | (none — universal) | |
| identity.pronouns | KEEP | (none — universal) | |
| identity.stageName | KEEP | (none — universal) | Required-at-registration |
| languages | KEEP | (none — points at talent_languages structured) | |
| serviceArea.homeBase | KEEP | (none — universal) | Required-at-registration |
| media.headshot | KEEP | (none — universal) | Required-at-registration |

### 2. GLOBAL fields (22 rows)

Most KEEP. A few RENAME for consistency.

| Field key | Action | New key | Field group | Notes |
|---|---|---|---|---|
| credits | KEEP | — | experience | |
| documents | KEEP | — | certifications-documents | |
| emergencyContact | RENAME | emergency.contact | (none — universal admin) | |
| bios | KEEP | — | (universal) | |
| identity.responseTime | RENAME | identity.response_time | availability | snake_case |
| identity.tagline | KEEP | — | (universal) | |
| limits | KEEP | — | (universal admin) | |
| identity.homeCountry | RENAME | identity.home_country | service-area-travel | |
| media.coverPhoto | RENAME | media.cover_photo | media-portfolio | |
| media.moodboard | KEEP | — | media-portfolio | |
| media.polaroids | KEEP | — | media-portfolio | |
| media.portfolio | KEEP | — | media-portfolio | |
| media.showreel | KEEP | — | media-portfolio | |
| rates | KEEP | — | rates-booking | |
| reviews | KEEP | — | experience | |
| skills | KEEP | — | (none — points at talent_profile_taxonomy skills) | |
| links | RENAME | media.social_links | media-portfolio | |
| serviceArea.driversLicense | RENAME | service.has_drivers_license | service-area-travel | also change kind: text → toggle |
| serviceArea.ownsVehicle | RENAME | service.owns_vehicle | service-area-travel | text → toggle |
| travel.passports | RENAME | travel.passports | service-area-travel | already snake-case-ish |
| travel.willingTravel | RENAME | travel.willing_to_travel | service-area-travel | |
| travel.workAuth | RENAME | travel.work_authorization | service-area-travel | |

### 3. PHYSICAL / MEASUREMENTS — heavy MERGE pass

The catalog has DOUBLE entries: `measurements.*` (shared across types) + `models.*` (model-specific dupes). All have 0 values. **Keep `measurements.*` → rename to `physical.*`. Merge all `models.*` physical dupes.**

| Old keys | Action | Canonical new key | Field group | Notes |
|---|---|---|---|---|
| measurements.heightMetric | RENAME | physical.height_cm | physical-casting | |
| measurements.heightImperial | RENAME | physical.height_imperial | physical-casting | display alt |
| measurements.bust | RENAME | physical.bust_cm | physical-casting | |
| measurements.waist | RENAME | physical.waist_cm | physical-casting | |
| measurements.hips | RENAME | physical.hips_cm | physical-casting | |
| measurements.inseam | RENAME | physical.inseam_cm | physical-casting | |
| measurements.eyeColor | RENAME | physical.eye_color | physical-casting | |
| measurements.hairColor | RENAME | physical.hair_color | physical-casting | |
| measurements.hairLength | RENAME | physical.hair_length | physical-casting | |
| measurements.skinTone | RENAME | physical.skin_tone | physical-casting | |
| measurements.tattoos | RENAME | physical.tattoos | physical-casting | |
| measurements.piercings | RENAME | physical.piercings | physical-casting | |
| measurements.dress | RENAME | physical.dress_size | physical-casting | |
| measurements.shoeEU | RENAME | physical.shoe_size_eu | physical-casting | |
| measurements.shoeUK | RENAME | physical.shoe_size_uk | physical-casting | |
| measurements.shoeUS | RENAME | physical.shoe_size_us | physical-casting | |
| measurements.suit | RENAME | physical.suit_size | physical-casting | |

| Model dupes (all merge into above) | Action | → Canonical |
|---|---|---|
| models.height | MERGE | physical.height_cm |
| models.bust | MERGE | physical.bust_cm |
| models.waist | MERGE | physical.waist_cm |
| models.hips | MERGE | physical.hips_cm |
| models.inseam | MERGE | physical.inseam_cm |
| models.eyes | MERGE | physical.eye_color |
| models.hair | MERGE | physical.hair_color |
| models.hair_length | MERGE | physical.hair_length |
| models.skin_tone | MERGE | physical.skin_tone |
| models.tattoos | MERGE | physical.tattoos |
| models.tattoos_note | RENAME | physical.tattoos_note | (kept — distinct concept) |
| models.piercings | MERGE | physical.piercings |
| models.dress_size | MERGE | physical.dress_size |
| models.shoe | MERGE | physical.shoe_size_us | (same as shoe_us based on inspection) |
| models.shoe_us | MERGE | physical.shoe_size_us |
| models.shoe_uk | MERGE | physical.shoe_size_uk |
| models.suit_size | MERGE | physical.suit_size |
| models.body_type | RENAME | physical.body_type | physical-casting |
| models.weight | RENAME | physical.weight_kg | physical-casting |
| models.marks | RENAME | physical.visible_marks | physical-casting |
| models.allergies | RENAME | physical.allergies | physical-casting |

### 4. EXPERIENCE — collapse all `*.experience_yrs` into one

All have 0 values. Per-type variants are unnecessary.

| Old keys | Action | Canonical |
|---|---|---|
| chefs.experience_yrs | MERGE | experience.years_total |
| event_staff.experience_yrs | MERGE | experience.years_total |
| hospitality.experience_yrs | MERGE | experience.years_total |
| hosts.experience_yrs | MERGE | experience.years_total |
| models.experience_yrs | MERGE | experience.years_total |
| music.experience_yrs | MERGE | experience.years_total |
| performers.experience_yrs | MERGE | experience.years_total |
| photo_video.experience_yrs | MERGE | experience.years_total |
| security.experience_yrs | MERGE | experience.years_total |
| transportation.experience_yrs | MERGE | experience.years_total |
| wellness.experience_yrs | MERGE | experience.years_total |
| creators.engagement | KEEP | (creator-specific metric, not a years field) |

A new `experience.years_total` definition is created (Phase 4 seed) as the universal target. All 11 type-specific fields merge into it; recommendations preserved (each parent gets recommended for the same canonical field).

### 5. LANGUAGES — ARCHIVE catalog fields, point at talent_languages

| Old keys | Action | Reason |
|---|---|---|
| event_staff.languages_guests | ARCHIVE | Talent_languages is source of truth |
| hospitality.languages_fluent | ARCHIVE | " |
| hosts.languages_fluent | ARCHIVE | " |
| photo_video.languages_directing | ARCHIVE | " |
| security.languages_fluent | ARCHIVE | " |
| transportation.languages_conv | ARCHIVE | " |

### 6. dyn.* placeholders — ARCHIVE

All 8 are leftover prototype scaffolding. No data tied.

| Old key | Action |
|---|---|
| dyn.event_staff | ARCHIVE |
| dyn.hospitality | ARCHIVE |
| dyn.hosts | ARCHIVE |
| dyn.performers | ARCHIVE |
| dyn.photo_video | ARCHIVE |
| dyn.security | ARCHIVE |
| dyn.transportation | ARCHIVE |
| dyn.wellness | ARCHIVE |

### 7. CHEFS / chef.* — RENAME plural→singular

| Old key | New key | Group |
|---|---|---|
| chefs.certifications | chef.certifications | certifications-documents |
| chefs.cuisines | chef.cuisine_types | type-specific (chef rec) |
| chefs.dietary | chef.dietary_specialties | type-specific |
| chefs.kitchen_required | chef.kitchen_requirements | operational-requirements |
| chefs.max_guests | chef.max_guests | type-specific |
| chefs.min_guests | chef.min_guests | type-specific |
| chefs.private_chef_day | chef.private_chef_day_rate | rates-booking |
| chefs.service_style | chef.service_style | type-specific |
| chefs.tasting_menu_pp | chef.tasting_menu_per_person | rates-booking |

### 8. CREATORS / creator.* — RENAME

| Old key | New key | Group |
|---|---|---|
| creators.engagement | creator.engagement_rate | type-specific |
| creators.followers | creator.audience_total | type-specific |
| creators.ig_handle | creator.instagram_handle | media-portfolio |
| creators.niche | creator.niche | type-specific |
| creators.platforms | creator.platforms | type-specific |
| creators.primary_audience_geo | creator.audience_geo | type-specific |
| creators.rate_post | creator.rate_per_post | rates-booking |
| creators.rate_reel | creator.rate_per_reel | rates-booking |
| creators.tiktok_handle | creator.tiktok_handle | media-portfolio |
| creators.yt_channel | creator.youtube_channel | media-portfolio |

### 9. EVENT STAFF / event.* — RENAME

| Old key | New key | Group |
|---|---|---|
| event_staff.allergies | MERGE | physical.allergies |
| event_staff.first_aid | event.first_aid_certified | certifications-documents |
| event_staff.physical | event.physical_capability | type-specific |
| event_staff.role_focus | event.role_focus | type-specific |
| event_staff.shifts_max_hours | event.max_shift_hours | availability |
| event_staff.uniform_owned | event.uniform_owned | type-specific |

### 10. HOSPITALITY / hosp.* — RENAME

| Old key | New key | Group |
|---|---|---|
| hospitality.allergies | MERGE | physical.allergies |
| hospitality.event_types | hosp.event_types | type-specific |
| hospitality.mixology_certified | hosp.mixology_certified | certifications-documents |
| hospitality.pos_systems | hosp.pos_systems | type-specific |
| hospitality.uniform | hosp.uniform | type-specific |

### 11. HOSTS / host.* — RENAME

| Old key | New key | Group |
|---|---|---|
| hosts.allergies | MERGE | physical.allergies |
| hosts.audience_size_max | host.max_audience_size | type-specific |
| hosts.event_types | host.event_types | type-specific |
| hosts.mc_capable | host.mc_capable | type-specific |
| hosts.vibe | host.vibe | type-specific |
| hosts.wardrobe_owned | host.wardrobe_owned | type-specific |

### 12. MUSIC — RENAME (already singular)

| Old key | New key | Group |
|---|---|---|
| music.act_format | music.act_format | type-specific |
| music.bpm_range | music.bpm_range | type-specific |
| music.equipment | music.equipment | equipment-tools |
| music.genre | music.genres | type-specific |
| music.key_strengths | music.key_strengths | type-specific |
| music.set_length | music.set_length | type-specific |
| music.tech_rider | music.tech_rider | operational-requirements |

(All KEEP — already canonical, just assign group.)

### 13. PERFORMERS / performer.* — RENAME

| Old key | New key | Group |
|---|---|---|
| performers.act_type | performer.act_types | type-specific |
| performers.age_appropriate | performer.age_appropriate | type-specific |
| performers.allergies | MERGE | physical.allergies |
| performers.duration_min | performer.show_duration_minutes | type-specific |
| performers.insurance | performer.has_insurance | certifications-documents |
| performers.max_height | performer.max_height_cm | physical-casting |
| performers.props_owned | performer.props_owned | equipment-tools |
| performers.rig_required | performer.requires_rigging | operational-requirements |
| performers.travel_with_props | performer.travels_with_props | type-specific |

### 14. PHOTO/VIDEO / photo.* — RENAME

| Old key | New key | Group |
|---|---|---|
| photo_video.camera_brands | photo.camera_brands | equipment-tools |
| photo_video.deliverables | photo.deliverables | type-specific |
| photo_video.drone_licensed | photo.drone_licensed | certifications-documents |
| photo_video.format | photo.formats | type-specific |
| photo_video.insurance | photo.has_insurance | certifications-documents |
| photo_video.kit | photo.kit_owned | equipment-tools |
| photo_video.retoucher | photo.has_retoucher | type-specific |
| photo_video.studio_access | photo.has_studio_access | operational-requirements |

### 15. SECURITY — RENAME (mostly KEEP)

| Old key | New key | Group |
|---|---|---|
| security.close_protection | security.close_protection_certified | certifications-documents |
| security.drug_alcohol_status | security.drug_alcohol_clean | trust (sensitive) |
| security.height_visible | physical.height_cm | MERGE (use shared) |
| security.insurance | security.has_insurance | certifications-documents |
| security.license | security.security_license | certifications-documents |
| security.training | security.training | certifications-documents |
| security.weapons_certified | security.weapons_certified | certifications-documents |

### 16. TRANSPORTATION / transport.* — RENAME

| Old key | New key | Group |
|---|---|---|
| transportation.child_seats | transport.child_seat_count | type-specific |
| transportation.formal_attire | transport.formal_attire | type-specific |
| transportation.insurance | transport.has_insurance | certifications-documents |
| transportation.license_class | transport.license_class | certifications-documents |
| transportation.max_pax | transport.max_passengers | type-specific |
| transportation.max_run_hours | transport.max_run_hours | availability |
| transportation.vehicle | transport.vehicle_type | type-specific |
| transportation.vehicle_year | transport.vehicle_year | type-specific |

### 17. WELLNESS — RENAME (already singular)

| Old key | New key | Group |
|---|---|---|
| wellness.certifications | wellness.certifications | certifications-documents |
| wellness.insurance | wellness.has_insurance | certifications-documents |
| wellness.license_country | wellness.license_country | certifications-documents |
| wellness.max_per_session | wellness.max_per_session | type-specific |
| wellness.modalities | wellness.modalities | type-specific |
| wellness.session_min | wellness.min_session_duration | type-specific |
| wellness.session_types | wellness.session_types | type-specific |
| wellness.travel_kit | wellness.travels_with_kit | equipment-tools |

---

## Action totals

| Action | Count |
|---|---|
| KEEP | 30 |
| RENAME | 110 |
| MERGE | 31 |
| ARCHIVE | 8 |
| **Total** | **179** ✓ |

After Phase 2 reconciliation migration: **141 active definitions** (179 − 31 merged − 8 archived + 1 new `experience.years_total` placeholder created in Phase 4).

---

## Migration plan summary

The reconciliation migration (Phase 2) executes in this order:

1. Add `legacy_field_keys TEXT[]` column to `profile_field_definitions` (preserve old keys as aliases)
2. RENAME (110 fields): UPDATE field_key, append old key to legacy_field_keys
3. Pre-create canonical merge targets where missing (e.g., `experience.years_total` placeholder so MERGE has somewhere to go)
4. MERGE (31 fields): retag any `talent_profile_field_values` (currently 0 rows — safe), then archive old definitions
5. ARCHIVE (8 fields): set deprecated_at = now()
6. Final assertion: confirm 0 orphan field_values, expected counts match

All operations idempotent + soft-only. Same safety pattern as taxonomy_cleanup_v1.
