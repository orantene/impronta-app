# Multi-Skill Talent Profile — Plan v1

**Date:** 2026-05-07
**Goal:** Replace the current 1-primary + 2-secondary `talent_type` model with a **3-parent / up-to-9-skill** model, where each skill has a proficiency rating, years of experience, and an optional verification badge.
**Trigger source:** Roster Drawer Audit (2026-05-07) — gap C2 + product expansion.

---

## Executive Summary

**The model:**
- Talent picks **1 primary parent_category** (e.g., Performers)
- Plus **up to 2 secondary parent_categories** (e.g., Music & DJs, Models)
- Within those 3 parents, talent picks **up to 9 talent_types total** (level 3 in the taxonomy)
- Each talent_type gets a **proficiency rating** (5-tier: beginner / intermediate / advanced / expert / master)
- Plus optional **years of experience**
- Plus optional **admin/agency verification** (✓ stamp on the rating)

**Real-world example — Carmen Díaz extended:**
```
PRIMARY · Performers (3 of 5 sub-types)
  ★ Fire Performer        — Master · 8 yrs · ✓ verified by Impronta
  ★ Latin Dancer          — Expert · 5 yrs
  ★ Cabaret Act           — Advanced · 3 yrs

SECONDARY · Music & DJs (2 of 2 sub-types)
  ★ Wedding Singer        — Intermediate · 2 yrs
  ★ Reggaeton DJ          — Beginner · just starting

SECONDARY · Influencers & Creators (3 of 9-cap remaining)
  ★ Travel Creator        — Expert · 4 yrs · ✓ verified by Impronta
  ★ Lifestyle Influencer  — Advanced · 4 yrs
  ★ Brand Collaborator    — Intermediate · 2 yrs

TOTAL: 8 of 9 skills · 1 primary parent · 2 secondary parents
```

The "Trust ladder" badge gates Master/Expert claims when verification matters (chefs, drivers, security).

---

## Section A — Schema model

### A1. Existing schema (good news — most of it's there)

`talent_profile_taxonomy` already has:
- `relationship_type` (CHECK: primary_role / secondary_role / specialty / skill / context / credential / attribute)
- `proficiency_level` (CHECK: beginner / intermediate / advanced / expert / master) ← **5-tier already built in**
- `years_experience` (NUMERIC) ← **already there**
- `verified_at` (TIMESTAMPTZ) ← **already there**
- `display_order` (INT) — for sorting which skills appear first
- `is_primary` (BOOLEAN) — currently per-row, needs reinterpretation

### A2. Proposed semantics (new interpretation, mostly no schema change)

| Concept | Storage |
|---|---|
| Primary parent_category | All `relationship_type='primary_role'` rows MUST share the same `taxonomy_term.parent_id` chain ending at one parent_category |
| Secondary parent_categories | All `relationship_type='secondary_role'` rows come from up to 2 distinct parent_category ancestors |
| Selected talent_types | One row per (talent_profile_id, taxonomy_term_id) for each level-3 type the talent picks |
| Proficiency | `proficiency_level` per row |
| Years experience | `years_experience` per row |
| Display order | `display_order` per row — talent picks "featured" skill (lowest display_order) |
| Verification | `verified_at` + new `verified_by_user_id` UUID (admin/agency staff who verified) + new `verified_scope TEXT` (agency_id or 'platform') |

### A3. Schema changes required (small)

```sql
-- Track who verified, plus scope (platform-wide vs agency-specific)
ALTER TABLE talent_profile_taxonomy
  ADD COLUMN IF NOT EXISTS verified_by_user_id UUID,
  ADD COLUMN IF NOT EXISTS verified_by_tenant_id UUID REFERENCES agencies(id),
  ADD COLUMN IF NOT EXISTS verification_note TEXT;

-- Replace the secondary-cap trigger with a richer validator
DROP TRIGGER IF EXISTS trg_enforce_talent_taxonomy_secondary_cap ON talent_profile_taxonomy;

CREATE OR REPLACE FUNCTION public.enforce_talent_skill_caps()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_total_skills INT;
  v_distinct_secondary_parents INT;
  v_primary_parent_count INT;
BEGIN
  -- Skip non-role rows (context, skill, attribute, credential, specialty)
  IF NEW.relationship_type NOT IN ('primary_role', 'secondary_role') THEN
    RETURN NEW;
  END IF;

  -- Compute counts excluding the row being updated (for UPDATE ops)
  SELECT
    count(*) FILTER (WHERE relationship_type IN ('primary_role','secondary_role')),
    count(DISTINCT (
      SELECT t2.id FROM taxonomy_terms t2
      WHERE t2.id = (SELECT parent_id_chain_to_level_1(t.id))
    )) FILTER (WHERE relationship_type = 'secondary_role')
  INTO v_total_skills, v_distinct_secondary_parents
  FROM talent_profile_taxonomy tpt
  JOIN taxonomy_terms t ON t.id = tpt.taxonomy_term_id
  WHERE tpt.talent_profile_id = NEW.talent_profile_id
    AND (TG_OP = 'INSERT' OR tpt.taxonomy_term_id <> OLD.taxonomy_term_id);

  -- Cap 1: total skills ≤ 9
  IF v_total_skills >= 9 THEN
    RAISE EXCEPTION 'Talent already has 9 skills (max). Remove one before adding another.'
      USING ERRCODE = '23514';
  END IF;

  -- Cap 2: distinct secondary parent_categories ≤ 2
  IF NEW.relationship_type = 'secondary_role' AND v_distinct_secondary_parents >= 2 THEN
    -- Allow if the new row's parent matches an existing secondary parent
    IF NOT EXISTS (
      SELECT 1
      FROM talent_profile_taxonomy tpt
      JOIN taxonomy_terms t ON t.id = tpt.taxonomy_term_id
      WHERE tpt.talent_profile_id = NEW.talent_profile_id
        AND tpt.relationship_type = 'secondary_role'
        AND parent_id_chain_to_level_1(t.id) = parent_id_chain_to_level_1(NEW.taxonomy_term_id)
    ) THEN
      RAISE EXCEPTION 'Talent can have at most 2 secondary parent categories.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  -- Cap 3: all primary_role rows must share the same parent_category
  IF NEW.relationship_type = 'primary_role' THEN
    SELECT count(DISTINCT parent_id_chain_to_level_1(t.id))
    INTO v_primary_parent_count
    FROM talent_profile_taxonomy tpt
    JOIN taxonomy_terms t ON t.id = tpt.taxonomy_term_id
    WHERE tpt.talent_profile_id = NEW.talent_profile_id
      AND tpt.relationship_type = 'primary_role';
    IF v_primary_parent_count > 1 THEN
      RAISE EXCEPTION 'All primary skills must share the same parent category.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_talent_skill_caps
BEFORE INSERT OR UPDATE OF relationship_type, taxonomy_term_id ON talent_profile_taxonomy
FOR EACH ROW EXECUTE FUNCTION public.enforce_talent_skill_caps();

-- Helper: walk parent_id chain up to level-1 parent_category
CREATE OR REPLACE FUNCTION public.parent_id_chain_to_level_1(p_term_id UUID)
RETURNS UUID LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_id UUID := p_term_id;
  v_term RECORD;
BEGIN
  LOOP
    SELECT id, parent_id, term_type, level INTO v_term
    FROM taxonomy_terms WHERE id = v_id;
    EXIT WHEN v_term IS NULL OR v_term.parent_id IS NULL OR v_term.term_type = 'parent_category';
    v_id := v_term.parent_id;
  END LOOP;
  RETURN v_id;
END;
$$;
```

**Result:** zero data migration needed. Existing assignments keep working (Carmen's `Influencer` as `primary_role` → fits the new model: her primary parent is `influencers-creators`, with 1 of 5 possible primary skills). She can add up to 8 more.

### A4. Helper view for the resolver + UI

Single view that aggregates a talent's skills + parents:

```sql
CREATE OR REPLACE VIEW public.talent_skills_resolved AS
SELECT
  tpt.talent_profile_id,
  tpt.taxonomy_term_id AS skill_term_id,
  t.slug AS skill_slug,
  t.name_en AS skill_name,
  parent_id_chain_to_level_1(t.id) AS parent_category_id,
  pc.slug AS parent_category_slug,
  pc.name_en AS parent_category_name,
  tpt.relationship_type,                    -- 'primary_role' | 'secondary_role'
  tpt.proficiency_level,                    -- beginner..master
  tpt.years_experience,
  tpt.display_order,
  tpt.verified_at IS NOT NULL AS is_verified,
  tpt.verified_by_tenant_id,
  tpt.verification_note,
  tpt.created_at,
  tpt.updated_at
FROM talent_profile_taxonomy tpt
JOIN taxonomy_terms t ON t.id = tpt.taxonomy_term_id
LEFT JOIN taxonomy_terms pc ON pc.id = parent_id_chain_to_level_1(t.id)
WHERE tpt.relationship_type IN ('primary_role', 'secondary_role');
```

The resolver and UI both query this view directly.

---

## Section B — Proficiency Rating Design

### B1. The 5-tier system (already in DB)

| Level | Label | When to pick | UI weight |
|---|---|---|---|
| `beginner` | **Beginner** | Just starting / learning / open to gigs | 1 dot |
| `intermediate` | **Intermediate** | Done it a few times, comfortable | 2 dots |
| `advanced` | **Advanced** | Regular paid work | 3 dots |
| `expert` | **Expert** | Top of category, signature skill | 4 dots |
| `master` | **Master** | Industry-leading | 5 dots |

### B2. UI for proficiency

The user asked about stars / 1-10 / 1-100. **5-tier dots are best** because:
- 1-10 invites grade inflation ("everyone says 8")
- 1-100 is impossible to calibrate consistently
- Stars are saturated (Yelp/Amazon associations)
- Semantic labels self-anchor

**Component spec:**
```
Fire Performer
○ ○ ○ ○ ○   ← unselected
● ○ ○ ○ ○   ← Beginner
● ● ○ ○ ○   ← Intermediate
● ● ● ○ ○   ← Advanced
● ● ● ● ○   ← Expert
● ● ● ● ●   ← Master
```

**On hover/click:** dot shows label and short description:
- Click dot 4 → "Expert · top of category, signature skill"
- Click dot 5 → "Master · industry-leading work"

**Mobile/touch:** swipe or tap to set level.

### B3. Verification badge

When admin/agency staff verifies a proficiency claim:
- Render a small **✓** stamp next to the dots
- Tooltip: "Verified by Impronta · 2026-04-12"
- Only shown when `verified_at IS NOT NULL`
- Different visual when `verified_by_tenant_id` matches the viewing tenant ("Verified by you") vs another tenant ("Verified by Other Agency")

### B4. Years of experience (optional)

Small numeric input next to the proficiency dots:
```
Fire Performer    ● ● ● ● ●  ✓verified  ·  8 yrs
```

If empty, just show proficiency. Years is optional but adds context.

### B5. "Featured skill" slot

Talent picks ONE skill from their 9 to feature on the public profile card / search results / agency thumbnail. This is the `display_order = 0` row.

UI: drag-to-reorder list, top one is "featured". Or explicit "★ Feature this skill" toggle per row.

---

## Section C — UI/UX for the Multi-Skill Picker

### C1. The picker, redesigned

Inside the Services tab, replace the current chip-grid with:

```
┌────────────────────────────────────────────────────────────┐
│ TALENT TYPES                                  3 / 9 skills │
│ One primary category. Up to two secondary categories.       │
│ Up to 9 skills total across all three.                      │
├────────────────────────────────────────────────────────────┤
│ ★ PRIMARY · Influencers & Creators           [change ▾]    │
│   ───────────────────────────────────────────────          │
│   ✓ Lifestyle Influencer    ● ● ● ● ○  Expert    4 yrs ✓   │
│   ✓ Travel Creator          ● ● ● ● ○  Expert    3 yrs ✓   │
│   ✓ Brand Collaborator      ● ● ● ○ ○  Advanced  2 yrs     │
│   + Add another skill in this category                     │
│                                                            │
│ ◆ SECONDARY 1 · Performers                  [change ▾] [×] │
│   ───────────────────────────────────────────────          │
│   ✓ Cabaret Act             ● ● ● ○ ○  Advanced  2 yrs     │
│   + Add another skill in this category                     │
│                                                            │
│ + Add second secondary category                            │
└────────────────────────────────────────────────────────────┘
```

### C2. Adding a skill — flow

1. Click **+ Add another skill in this category** under any parent → opens search drawer scoped to that parent's talent_types
2. Search "fire" → "Fire Performer" appears with breadcrumb "Performers / Specialty Performers / Fire Performer"
3. Click → row inserts with default proficiency = `beginner` and "Set proficiency" prompt
4. Click on the new row → inline proficiency editor opens (5 dots)
5. Set proficiency, optionally add years
6. Done — autosaves immediately

### C3. Switching primary parent

The `[change ▾]` button next to PRIMARY opens a category picker. If the user switches from "Influencers & Creators" to "Performers":
- All current primary skills MUST migrate (since they no longer match the new primary parent)
- Modal: "Switching primary will move your 3 current Influencer skills to a secondary slot, OR remove them. What do you want?"
- Options: **Move to secondary** (if a slot is free) / **Remove all** / **Cancel**

### C4. The 9-cap & 2-secondary-parent enforcement (UI)

When user is at 9 skills:
- All "+ Add another skill" buttons → grey out, tooltip "9 of 9 skills used. Remove one to add another."

When user is at 2 secondary parents:
- "+ Add second secondary category" hides
- If user tries to add a skill from a 3rd parent: "Pick a category that's already in your roster, or remove one secondary first."

### C5. Display priority on profile/card

Talent's **featured skill** (display_order = 0) shows on:
- Roster card (where currently "No type set" / "Influencer" appears)
- Search result snippet
- Inquiry form pre-fill ("They're a Master Fire Performer")

Other skills show on profile expanded view as a stack.

### C6. Filter & Search implications

Client searches for "Fire Performer":
- Results sort by `proficiency_level DESC`, then `years_experience DESC`, then verification status
- Filter chip: "Expert+ only" — toggles off Beginner/Intermediate
- Filter chip: "Verified only" — toggles off unverified
- Result card shows the matched skill prominently (even if not the talent's featured skill)

### C7. Visual polish — tier color coding

Each tier gets a subtle tone:
- Beginner: warm grey
- Intermediate: cool grey
- Advanced: indigo
- Expert: green/teal
- Master: gold (premium feel)

Verified badge: green check on a darker pill background.

---

## Section D — Resolver + Field Architecture Implications

### D1. Field resolution stays the same — but…

The field resolver (Phase 6 work) walks talent_profile_taxonomy → expands to parents → merges field recommendations. With more skills, the field count goes UP. Carmen with 8 skills across 3 parents will have ~80-120 type-specific fields.

**Resolution priority:** with multiple skills per category, fields recommended for ANY of those skills (or their parent_category) appear. Standard union.

### D2. Proficiency-gated field depth (NEW IDEA)

A talent at `master` level for Fire Performer should fill in deep fields (insurance, tech rider, signature acts). A `beginner` Fire Performer might only need basics.

**Proposal:** introduce optional `min_proficiency` on `profile_field_recommendations`:
- `master.tech_rider` → only renders when proficiency = 'master' or 'expert'
- Otherwise hidden as "unlocks at Expert level"

Optional V2 — adds value but increases complexity. **Defer.**

### D3. Search-relevance scoring

Define a search-relevance score per talent for a given skill query:
```
score = 100 if exact talent_type match
      + 50  if proficiency == 'master'
      + 30  if proficiency == 'expert'
      + 10  if proficiency == 'advanced'
      + 30  if verified_at IS NOT NULL
      + min(years_experience * 2, 30)
```

Used by the discovery / inquiry-matching engine. Not in the catalog; lives in search service.

---

## Section E — Migration, Risks, Decisions

### E1. Migration plan

1. **Backfill existing data:** all current `primary_role` and `secondary_role` rows already fit the new model. Set `proficiency_level` defaults:
   - If `verified_at IS NOT NULL` → `'expert'`
   - Else → `'intermediate'`
   - Talent can adjust later
2. **Drop old trigger, create new trigger** (atomic in one migration)
3. **No data loss** — purely additive change

### E2. Migration file

Single migration: `20260907200000_multi_skill_talent_v1.sql`. Schema diff is small:
- 3 new columns on `talent_profile_taxonomy`
- 2 new functions
- 1 new trigger replacing the old one
- 1 new view
- 1 backfill UPDATE for proficiency defaults

### E3. Decisions you need to make

**D1. Cap structure for the 9 skills** — choose one:
- (a) Soft cap: up to 9 total, no per-parent split → most flexible
- (b) Per-parent cap: e.g. ≤5 primary, ≤2 each secondary → enforces depth-vs-breadth
- (c) Hardcoded: 5 + 2 + 2 = 9 → predictable but rigid

**My vote: (a)** — soft cap of 9 total, hard cap of 1 primary + 2 secondary parents.

**D2. Default proficiency for new skill** — choose one:
- (a) `beginner` (default to lowest, force explicit upgrade)
- (b) `intermediate` (assume the talent wouldn't pick if they didn't have some experience)
- (c) `null` (force user to pick before proceeding)

**My vote: (b)** with prompt "Set your proficiency" within 24h of adding.

**D3. Who can verify?**
- (a) Platform staff (Tulala) only
- (b) Agency staff for talents on their roster
- (c) Both — agency-scope and platform-scope verifications coexist

**My vote: (c)** — talent shows "Verified by Impronta" when on Impronta's site, "Tulala-verified" platform-wide. Maps to existing `talent_profile_trust_badges.scope` model.

**D4. Show proficiency dots publicly?**
- (a) Always public — transparent
- (b) Public only for `expert`/`master`, hide lower
- (c) Talent toggles per skill

**My vote: (c)** — talent decides. Default ON for `expert`/`master`, OFF for lower (so a beginner doesn't get filtered out by clients searching for "Expert+").

---

## Section F — SELF-AUDIT: gaps and errors I found

After writing the plan, I went back and stress-tested it. Here's what I'd add or fix:

### F1. 🔴 The Phase 6 type-leak bug (C1) BECOMES MUCH WORSE in this model

**The problem:** my Phase 6 resolver includes fields if `field_group_id ∈ (active groups for talent's parents)`. With 3 parents and 9 skills, the active groups expand massively. Chef fields leak to Carmen even harder.

**Must fix C1 first.** Change resolver to: type-specific fields require BOTH (a) field_group active AND (b) a recommendation matching one of the talent's terms.

### F2. 🔴 Some current talent_types ARE generic fallbacks (`is_generic_fallback=true`)

Like "Dancer", "DJ", "Singer" — flagged in `taxonomy_cleanup_v1`. These should NOT be selectable as one of the 9 skills (they'd waste a slot). UI must filter `is_generic_fallback=false` from the picker.

### F3. 🟡 The new trigger doesn't handle DELETE cleanly

If talent deletes a skill, the cap counts are still valid. But DELETE doesn't fire the BEFORE INSERT/UPDATE trigger. Not a bug but worth noting — no constraint needed on DELETE.

### F4. 🟡 Switching primary parent mid-session loses skill data

The flow in C3 says "switch primary → migrate primary skills to secondary OR remove". But in DB, that means rapid-fire UPDATE rows changing `relationship_type`. Audit trail lost.

**Fix:** add a `talent_profile_taxonomy_history` audit table (separate, optional V2). For V1, the history isn't critical.

### F5. 🟡 Resolver may double-count in deduplication

A talent with `chef.cuisine_types` recommended for both `chefs-culinary` parent AND specific `private-chef` talent_type would have 2 recommendation rows for the same field. Resolver needs to dedupe — already partially handled by `recsByField` Map but the merging logic only takes the strongest, doesn't union.

**Verify** the dedup is tight after fixing C1.

### F6. 🟡 Public-card display: which skill wins when "featured" not set?

If talent has 8 skills but never sets a featured one, what shows on their roster card?

**Fix:** computed default — highest `proficiency_level` (master > expert > …) → tie-break on most recent `verified_at` → tie-break on `created_at` ASC. Document this rule.

### F7. 🟡 Search-term mismatch with new skills hierarchy

A client searching "Cabaret" might want a Performer with Cabaret experience. The current search wouldn't pick up a "Cabaret Act"-rated talent unless it joins through proficiency.

**Fix:** enrich search index with all `skill_name` + `proficiency_level` per talent. Already covered in D3 but worth flagging that the search service needs updating.

### F8. 🟡 Trust ladder vs proficiency conflation risk

User sees "Master Fire Performer · ✓ verified" — they may interpret "verified" as identity verified. But `verified_at` here is **proficiency-verified** ("we've seen them perform and confirmed Master level"), distinct from identity/document verification (which lives in `talent_profile_trust_badges`).

**Fix:** different visual + clear copy:
- Proficiency verification → small ✓ next to dots, tooltip "Skill verified by [tenant]"
- Identity/license verification → trust badges on profile header

### F9. 🟡 Generic-fallback talent_types CAN'T be skill_term_ids

Cross-ref to F2. The picker should filter them. But if data already has them (Carmen has `Influencer` which is generic — `is_generic_fallback=true`), the migration backfill must convert these to a real type or leave them as-is and warn the user.

**Fix:** post-migration dashboard for tenants showing "X talent have generic-fallback skills — review and pick specific types".

### F10. 🟡 9-skill cap might be too conservative for some talent

A truly multi-talented person (model + actor + DJ + chef) could have 12+ valid skills. Hard cap of 9 forces them to drop expertise.

**Fix:** plan-tier gated cap. Free: 5. Studio: 9. Agency: 15. Network: unlimited. Aligns with existing plan-tier-caps table from earlier work.

### F11. 🔴 RLS / permissions check

Currently no RLS on `talent_profile_taxonomy`. If talent X tries to add a skill via the talent-side API, they should only update their own profile. Agency admin can update talents on their roster.

**Must add RLS policy** before exposing to talent users (currently only admin-side editing).

### F12. 🟡 Inquiry workflow integration

When client books "Fire Performer" via an inquiry, the booking should record WHICH skill was booked + at WHICH proficiency. This becomes earned-trust data (booking_count per skill, completion_rate per skill).

**Plan:** add `inquiry.requested_skill_id UUID` (FK to talent_profile_taxonomy.taxonomy_term_id) + `inquiry.requested_proficiency_min TEXT`. Powers the metrics layer (V2).

### F13. 🟡 What about talent who don't have any verified skills

A new talent on the platform has 0 verifications. They show "Master" with no checkmark. What signals trustworthiness?

**Fix:** combine with the `last_active_at` + `total_completed_bookings` we added to `talent_profiles`. Show "★ ★ ★ ★ ★ Master · 8 bookings · Active 2 days ago" — the activity + completion data substitutes for verification.

### F14. 🔵 Agency-specific proficiency overrides

An agency might want to display a talent's proficiency differently on THEIR site (e.g., "Beginner" privately, "Pro" publicly to clients). Two-layer pattern like the photo curation.

**Defer to V2.** Adds `agency_talent_skill_overrides` table. Not needed for V1.

### F15. 🔵 Skill expiry / freshness

A "Master Latin Dancer" who hasn't booked in 18 months might not really be Master anymore. Auto-decay model? Ask talent to reconfirm proficiency annually?

**Defer to V2.** Adds `proficiency_set_at TIMESTAMPTZ` and a periodic prompt.

### F16. 🟡 Backfill default proficiency wisdom

Setting all existing primary_role to `intermediate` might shock talent who consider themselves Master. Better:
- Send a one-time prompt to all claimed talent: "Help us calibrate — set your skill levels"
- Until they respond, render proficiency as "Unrated" (greyed dots) instead of "Intermediate"

**Fix:** treat `proficiency_level IS NULL` as "Unrated" UI state, separate from any tier.

### F17. 🟡 Audit data: "Hosts & Promo" parent is awkward for skill model

Some parent_categories are awkward to think of as skills. "Hosts & Promo" — is "Restaurant Hostess" a skill or just a job? It's a job. Same for "Event Staff", "Hospitality & Property", "Transportation".

**No fix needed**, but the language might shift: "Roles" or "Services" works better than "Skills" for those parents. The UI can switch labels per parent category if needed.

### F18. 🟡 Self-claim of Master level abuse

Talent self-claims `master` proficiency to game search rankings. Without verification, "Master" means little.

**Fix:** require admin/agency verification to display as `master` or `expert` publicly. Self-set Master shows internally as "Master (unverified)" with light grey dots; clients see only verified levels above Advanced.

### F19. 🔵 Translation of proficiency labels

Spanish: Principiante / Intermedio / Avanzado / Experto / Maestro. Add to a frontend i18n file. Not blocking.

### F20. 🟡 Auditor concern: this overlaps with `skill` term_type already in the catalog

The taxonomy has `term_type='skill'` rows (e.g., "Brand Activation", "Social Media") used as `relationship_type='skill'` on talent_profile_taxonomy. These are DIFFERENT from the talent_types we're discussing.

**Distinction:**
- talent_type (level 3) → "what they're booked as" (Fire Performer, Wedding DJ)
- skill (separate term_type) → "what they're good at" (Brand Activation, Social Media — abstract competencies)

The new model uses talent_types only. The skill term_type continues to live alongside as `relationship_type='skill'` rows. These are tags/competencies, not bookable roles.

**No conflict.** But the UI should differentiate visually — dots only for talent_type rows, not for skill rows.

---

## Section G — Final action plan

### G1. Migration order

```
✅ taxonomy_cleanup_v1 (applied)
✅ field_reconciliation_v1 (applied)
✅ field_architecture_v1 (applied)
✅ field_seeds_v1 (applied)
   ⏳ resolver_typeleak_fix (Phase 6.1 — fix C1) ← BLOCKS THIS PLAN
   ⏳ multi_skill_talent_v1 (this plan — schema + trigger + view)
   ⏳ multi_skill_seed_proficiency (backfill, "Unrated" state)
```

### G2. UI build order

1. Fix C1 in resolver (admin-taxonomy.ts) — required before more skills land
2. Build new SkillSlotPanel React component (replaces current chip-grid in Services tab)
3. Build ProficiencyDotPicker component (5-dot interactive)
4. Wire `talent_skills_resolved` view into the picker
5. Update LiveCategoryFieldsPanel to deduplicate fields properly
6. Update roster card to read featured skill (`display_order=0`)
7. Wire admin "Verify proficiency" button (creates `verified_at` + `verified_by_tenant_id`)
8. Update search/filter UI (Expert+ filter, Verified-only filter)

### G3. What I want approved

- ✅ The 1 primary parent + 2 secondary parents + up to 9 skills total model — confirm Section A2
- ✅ Cap structure: soft 9-total, hard 1+2 parent constraint — Section E3 D1 vote (a)
- ✅ Default proficiency for new skill: `intermediate` with calibration prompt — Section E3 D2 vote (b)
- ✅ Verification scope: agency + platform — Section E3 D3 vote (c)
- ✅ Public visibility: talent toggles per skill — Section E3 D4 vote (c)
- ✅ Plan-tier-gated cap: Free 5 / Studio 9 / Agency 15 / Network unlimited — Section F10 fix
- ✅ Self-claimed `master` displays as "Master (unverified)" greyed-out, not full master — Section F18 fix
- ✅ "Unrated" UI state for `proficiency_level IS NULL` — Section F16 fix
- ✅ Skill verification distinct from identity verification badges — Section F8 fix

Reply with go-ahead (or pushback per item) and I'll write the migration + components.

---

## Section H — TL;DR for skim readers

- **Model:** 1 primary category + 2 secondary categories + up to 9 talent_types total. Each talent_type gets a 5-tier proficiency (beginner/intermediate/advanced/expert/master), optional years of experience, and optional admin/agency verification.
- **Schema impact:** 3 new columns + 1 new view + new trigger replacing old one. **No data migration.** Existing assignments fit the new model directly.
- **UI impact:** rebuild the talent type picker as 3 stacked "category cards" with up to ~3-5 skill rows each. Each row has dots for proficiency + ✓ for verification + years.
- **Resolver impact:** field type-leak bug (C1) gets worse with more skills — must fix first.
- **Self-audit found 20 gaps**, all addressed in Section F. Most blocking: F1 (resolver bug), F2 (filter generic-fallbacks), F11 (RLS).
- **Plan-tier gated:** Free 5 / Studio 9 / Agency 15 / Network unlimited.
- **Verification model:** distinct from identity badges — proficiency-only ✓ next to dots.

Total V1 effort estimate: 3-4 working days end to end (migration + 4 components + resolver fix).
