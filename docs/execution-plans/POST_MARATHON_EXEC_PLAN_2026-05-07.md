# Post-Marathon Execution Plan — Drawer + Multi-Skill V1.5

**Created:** 2026-05-07
**Owner:** Claude (data + migrations + code) + user (review gates)
**Predecessor:** Multi-skill talent V1 marathon (taxonomy_cleanup_v1 → field_reconciliation_v1 → field_architecture_v1 → field_seeds_v1 → multi_skill_talent_v1, all applied)

---

## Overview

This plan addresses every gap surfaced in the post-marathon audit (Q1-Q7, M1-M8, S1-S6) plus 12 additional items I noticed but hadn't formalized. Total 33 work items grouped into 8 sequential phases.

**Top-level goal:** turn the multi-skill catalog into a complete product — input AND output, talent-side AND admin-side, with safety + scale.

| Phase | Theme | Effort | Critical? |
|---|---|---|---|
| 1 | Polish round (Q1-Q7 + ADD-2) | 1-2 days | Yes — tactical UX wins |
| 2 | Component refactor + tests (architecture cleanup) | 1-2 days | Yes — prevents future regressions |
| 3 | Search & Discovery (S1) | 3-5 days | **Highest leverage** |
| 4 | Trust & verification harmonization (M8 + S4) | 1 day | Reduces dual-system confusion |
| 5 | Earned-trust metrics layer (S2) | 2 days | Differentiator |
| 6 | Booking ↔ skill integration (S5 + S6) | 2-3 days | Closes the loop |
| 7 | Multi-tenant overrides + RLS (S3 + ADD-7 + ADD-10) | 2-3 days | Required before talent self-edit |
| 8 | Strategic V2 items (S6 + ADD-4 + ADD-12) | 5+ days | Plan-tier-gated, separate slice |

**Total V1.5 effort: ~15-20 working days end-to-end.** Phases 1-3 give the highest ROI for time invested.

---

## PHASE 1 — Polish round (1-2 days)

Tactical fixes. Every item ships in <4 hours.

### 1.1 — Q1: Re-seed talent photos
**Problem:** Carmen's `00-card.jpg` storage_path resolves to a mountain landscape. Other talents share identical headshots due to seed dedup.
**Fix:** Build a re-seed script that downloads ~30 distinct portrait photos and uploads them per talent, fixing storage_path metadata.
**Files:** `web/scripts/reseed-talent-photos.mjs` (new)
**Approach:**
1. Script generates per-talent unique paths
2. Fetches photos from Pexels/Unsplash API (with attribution)
3. Calls Supabase Storage API to upload
4. Updates `media_assets` metadata
**Effort:** 3 hr
**Acceptance:** Each of the 27 Impronta talents shows a unique portrait in the roster grid.

### 1.2 — Q2: Restore "Career interests"
**Problem:** When C2 cleanup removed legacy ServicesEditor, the `<details>` "Career interests" block went with it. Real product feature lost.
**Fix:** New compact section under SkillSlotPanel: "↗ Open to grow into" with chip picker for talent_types NOT currently a skill.
**Files:** `_skill-slot-panel.tsx` (add `CareerInterestsSection` component)
**DB:** reuses existing `relationship_type='aspiration'` (or create new value) on `talent_profile_taxonomy` — verify existing usage.
**Effort:** 2 hr
**Acceptance:** Below the 3 SkillSlotPanel cards: "Open to grow into:" + chip picker. Adds rows with `relationship_type='aspiration'`.

### 1.3 — Q3: Featured skill discoverability tooltip
**Problem:** ★ button + FEATURED pill aren't self-explanatory.
**Fix:** Tooltip on ★ ("This skill shows on your roster card and search results"). On hover of any non-featured ★, "Click to feature this skill on roster card."
**Files:** `_skill-slot-panel.tsx` (`SkillRow` `title=` attribute on the ★ button)
**Effort:** 30 min
**Acceptance:** Hover ★ shows tooltip explaining the function.

### 1.4 — Q4: Empty-state nudge for "Unrated"
**Problem:** Existing skills sit at `proficiency_level=NULL` ("Unrated") forever. New admins don't know dot-clicking is the gesture.
**Fix:** When `proficiency_level=NULL` AND created >24h ago, show inline hint: "↓ Tap a dot to set level."
**Files:** `_skill-slot-panel.tsx` (`SkillRow`)
**Effort:** 30 min
**Acceptance:** Old unrated skills show a one-time pulse hint pointing to the dot picker.

### 1.5 — Q5: Verification confirmation + attribution
**Problem:** One-click verification is too cheap. UI doesn't show who/when verified.
**Fix:**
1. Add confirmation dialog: "Verify [talent] at [Expert] level for [Fire Performer]? You're staking your agency's reputation."
2. Show "Verified by [user] · [date]" tooltip on the ✓ Verified pill.
3. Optional: text input "Why are you verifying?" → stored in `verification_note`.
**Files:** `_skill-slot-panel.tsx` (`SkillRow` Verify button + new `VerifyConfirmDialog`)
**Server actions:** Already supported (verifySkill takes `note` param).
**Effort:** 2 hr
**Acceptance:** Click Verify → dialog → confirm → stamp shows attribution on hover.

### 1.6 — Q6: "Saved Xs ago" timer cleanup
**Problem:** Counter runs forever; "Saved 9m ago" looks broken.
**Fix:** After 60 seconds, collapse to "Saved" with checkmark. Reset to "Just now" on next save.
**Files:** Find + update the autosave indicator in `_drawers.tsx`
**Effort:** 1 hr (need to find the component first)
**Acceptance:** Indicator stops counting at 60s, shows static "Saved ✓" until next change.

### 1.7 — Q7: Single completion meter
**Problem:** Three independent counters on the drawer (Add 2 things to publish · 1 of 9 skills · 59 fields across 6 groups · 0 required to publish). Confusing.
**Fix:** Single sticky progress ring at drawer top. Click → expand to see breakdown by category (Identity / Skills / Media / Bio / etc.).
**Files:** New `_completion-meter.tsx` component, replaces the "Add 2 things to publish" banner.
**Logic:** Pulls from `getFieldsForTalent` (required_before_publish field count vs filled), skill count, media count.
**Effort:** 4 hr
**Acceptance:** One progress ring at top. Click → drawer of "what's missing" pointing at each section.

### 1.8 — ADD-2: Backfill prompt for existing talents
**Problem:** 26 of 27 Impronta talents have no skills set. Admins won't know to backfill.
**Fix:** Roster banner: "26 talents missing skills. Bulk backfill →" → opens a dedicated drawer with talent list + suggest skills based on existing `primary_role` (legacy) data.
**Files:** New `BulkSkillBackfillDrawer` in `_drawers.tsx`
**Effort:** 4 hr
**Acceptance:** Roster page shows backfill prompt; flow lets admin set primary skill + level for each talent in <30 sec each.

**Phase 1 total: ~17 hours = 2 working days.**

---

## PHASE 2 — Component refactor + tests (1-2 days)

Architectural cleanup. Doesn't ship new features but prevents regressions.

### 2.1 — Component splits
**Problem:** `_skill-slot-panel.tsx` is ~600 lines with 5 nested components.
**Fix:** Split into:
- `_proficiency-dot-picker.tsx` — exports `ProficiencyDotPicker` + `ProficiencyLabel`
- `_add-skill-search.tsx` — exports the modal picker
- `_skill-row.tsx` — exports `SkillRow` + `SkillCategoryCard`
- `_skill-slot-panel.tsx` — keeps the orchestrator + state hooks
**Files:** 4 new files, 1 trimmed
**Effort:** 2 hr
**Acceptance:** All imports resolve, typecheck clean, browser smoke test passes.

### 2.2 — Drawer file breakdown
**Problem:** `_drawers.tsx` is 25k+ lines. Surgical edits are getting risky.
**Fix:** Phase out into per-section files:
- `_drawer-section-identity.tsx`
- `_drawer-section-services.tsx`
- `_drawer-section-location.tsx`
- `_drawer-section-media.tsx`
- `_drawer-section-about.tsx`
- `_drawer-section-availability.tsx`
- `_drawer-section-rates.tsx`
- `_drawer-section-trust.tsx`
- `_drawers.tsx` keeps the orchestrator + ProfileShellDrawer wrapper

**Approach:** One section per migration to limit blast radius. Don't try in one go.
**Effort:** 1 day (across 8 sessions)
**Acceptance:** `_drawers.tsx` shrinks from 25k to ~5k lines. Each section file is independently testable.

### 2.3 — `useLiveMode` hook
**Problem:** `bridgeTenantIdentity?.tenantId && payload.talentId` repeated in many places.
**Fix:** Extract to `useLiveMode()` hook returning `{ enabled: boolean, tenantId: string | null, talentId: string | null }`.
**Files:** `_drawers.tsx` consolidation
**Effort:** 30 min
**Acceptance:** All gates use the hook; no raw `bridgeTenantIdentity?.tenantId` checks remain.

### 2.4 — Server action splits
**Problem:** `admin-talent-skills.ts` has 9 functions. `admin-talent-extras.ts` has 13 functions.
**Fix:** Group by responsibility — read/write/verify per file.
**Files:** Multiple new files in `web/src/lib/server-actions/`
**Effort:** 1 hr
**Acceptance:** Each file <250 lines.

### 2.5 — Resolver query consolidation
**Problem:** `getFieldsForTalent` does 6 sequential queries.
**Fix:** Combine into 2-3 queries with LEFT JOINs.
**Files:** `admin-taxonomy.ts`
**Effort:** 2 hr
**Acceptance:** Same output, fewer round-trips. Profile drawer loads ≤500ms (was ~1s).

### 2.6 — Test scaffolding (the biggest gap)
**Problem:** Zero automated tests for the multi-skill system.
**Fix:** Three layers:

#### 2.6a — Unit tests for resolver + caps
- `admin-taxonomy.test.ts` — getFieldsForTalent with various talent types verifies type-leak fix
- `admin-talent-skills.test.ts` — addSkill / updateSkill / cap enforcement
- DB constraint test: insert 10th skill via raw SQL → expect rejection from trigger

#### 2.6b — Server action integration tests
- `admin-talent-skills.integration.test.ts` — full flow with test DB

#### 2.6c — E2E browser test
- `e2e/multi-skill-flow.spec.ts` (Playwright) — open drawer → add skill → set proficiency → verify → confirm DB state

**Files:** Multiple test files
**Effort:** 4-6 hr
**Acceptance:** CI runs tests on every PR; resolver type-leak fix has a regression test.

**Phase 2 total: ~12 hours = 1.5 working days.**

---

## PHASE 3 — Search & Discovery (3-5 days) — **HIGHEST LEVERAGE**

S1 from the audit. Without this, all the catalog work has no consumer.

### 3.1 — Search service skeleton
**Problem:** Catalog has 195+ fields, 9 skills/talent, 5 proficiency tiers, verification flags. Nothing queries them.
**Fix:** New `web/src/lib/server-actions/search-talent.ts`:

```ts
searchTalent({
  query?: string,         // free-text → matches name, bio, skill names + aliases
  skill_slugs?: string[], // talent must have at least one matching skill
  parent_categories?: string[],
  min_proficiency?: ProficiencyLevel,
  verified_only?: boolean,
  contexts?: string[],    // weddings, beach clubs, etc.
  service_areas?: string[],
  available_dates?: { start: Date, end: Date },
  rate_max?: number,
  sort: 'relevance' | 'recent' | 'rate_low' | 'rate_high',
  tenant_id?: string,     // when set, scope to that tenant's roster
}) → ResolvedSearchResult[]
```

**Ranking algorithm:**
```
score = 100 if exact talent_type match
      + 50  if proficiency = master
      + 30  if proficiency = expert
      + 10  if proficiency = advanced
      + 30  if verified_at IS NOT NULL
      + min(years_experience * 2, 30)
      + 20  if last_active_at < 7 days
      + 10  if context match
```

**Effort:** 2 days
**Acceptance:** Server action returns ranked results for arbitrary queries.

### 3.2 — M7: Alias-aware skill search
**Problem:** AddSkillSearch only matches `name_en ILIKE`. Aliases ignored.
**Fix:** Update `getTalentTypesUnderParent`:
```sql
WHERE name_en ILIKE %query% OR query = ANY(aliases) OR query = ANY(search_synonyms)
```
**Files:** `admin-talent-skills.ts`
**Effort:** 1 hr
**Acceptance:** Searching "wedding dj" returns DJ talent_type (its alias).

### 3.3 — Discovery UI (Roster filter chips → real)
**Problem:** Top filter chips ("Creators & Influencers", "Music & DJs", "Performers") are static + don't reflect multi-skill.
**Fix:**
- Replace chips with full filter drawer
- Filters: Skill (multi-select with proficiency floor), Verified, Service area, Available now, Sort
- Wire to `searchTalent` server action
- Update result count + breakdown live

**Files:** `_pages.tsx` (Roster page filters), new `_roster-filter-drawer.tsx`
**Effort:** 1 day
**Acceptance:** Roster page becomes a real filter UI; result count updates as you filter.

### 3.4 — "Search talent for inquiry" panel
**Problem:** When agency creates a new inquiry, they need to pick which talent fits. Currently chooses by name only.
**Fix:** New "Find talent for this inquiry" sub-component using `searchTalent`. Pre-fills filters from inquiry brief (e.g., inquiry says "wedding photographer in Tulum" → filters auto-set).
**Files:** Inquiry workspace component
**Effort:** 1 day
**Acceptance:** Creating an inquiry → "Find matching talent" → sorted results based on the brief.

### 3.5 — Public discovery surface (V2 stretch)
**Problem:** No external search. Clients with deep links bypass the marketplace.
**Fix:** Public route `/discover?skill=fire-performer&context=weddings` powered by same searchTalent. Defer to V2.
**Effort:** 2 days
**Acceptance:** Clients can search Tulala directly without an account.

**Phase 3 total: ~5 days. Highest-impact phase.**

---

## PHASE 4 — Trust & verification harmonization (1 day)

Fixes the dual-system confusion.

### 4.1 — S4: Skill verification feeds trust badge
**Problem:** Two verification systems coexist:
- `talent_profile_taxonomy.verified_at` (skill-level)
- `talent_profile_trust_badges` (identity / license / etc.)

When admin verifies "Master Fire Performer", nothing connects to a trust badge.
**Fix:** When N skills get verified, auto-create a "Skills verified by [tenant]" trust badge with `kind='skills_verified'` and `note="X of Y skills verified"`. Updates on each verify/unverify.
**Files:** `admin-talent-skills.ts` `verifySkill` action — call `createTrustBadge` after successful update
**Schema:** Possibly add `kind='skills_verified'` to allowed badge_kind enum (current values: identity, background_check, license, insurance, social_account, media_authentic, agency_approved)
**Effort:** 3 hr
**Acceptance:** Verifying a 3rd skill auto-creates a "Skills verified by Impronta" badge visible on the talent's profile header.

### 4.2 — Trust badges visible in drawer
**Problem:** `TrustBadgesPanel` from Phase 7 of the previous marathon wasn't wired in.
**Fix:** Wire it into the drawer below the SkillSlotPanel.
**Files:** `_drawers.tsx` (import from `_phase7-drawers.tsx`)
**Effort:** 30 min
**Acceptance:** Trust badges visible in profile drawer with verify/reject buttons.

### 4.3 — M8: Specialties surfacing
**Problem:** `relationship_type='specialty'` rows orphaned in DB. Existing data: 23 dance specialties (Salsa, Bachata, etc.) under specific dancer types.
**Fix:** Below each skill row, show inline "Specialties: + Salsa + Bachata" chip picker. Click adds a level-4 specialty term.
**Files:** `_skill-slot-panel.tsx` (`SkillRow` extension)
**Effort:** 4 hr
**Acceptance:** A "Latin Dancer" skill can have specialties Salsa + Bachata added inline.

### 4.4 — Q5 (deferred): Verification scope choice
**Problem:** All verifications agency-scoped. No way to make platform-scope verifications.
**Fix:** When verifying as platform admin (role check), offer scope choice in the confirm dialog.
**Files:** `_skill-slot-panel.tsx` (verify dialog) + `admin-talent-skills.ts` (already supports scope param)
**Effort:** 1 hr
**Acceptance:** Platform staff sees "Verify scope: This agency / Platform-wide" choice.

**Phase 4 total: ~9 hours = 1 day.**

---

## PHASE 5 — Earned-trust metrics (2 days)

S2. The differentiator.

### 5.1 — Metrics column populator
**Problem:** Columns exist on `talent_profiles` (last_active_at, profile_completeness_pct, total_completed_bookings) but nothing populates them.
**Fix:**
- `last_active_at`: middleware updates on every authenticated request to talent surfaces
- `profile_completeness_pct`: nightly cron via Supabase scheduled function — computes from `getFieldsForTalent` field-fill rate
- `total_completed_bookings`: trigger on `bookings` table — increments on `status='completed'`

**Files:**
- `supabase/migrations/20260907210000_metrics_populator_v1.sql` (cron + triggers)
- `web/src/lib/server/touch-active.ts` (middleware utility)

**Effort:** 1.5 days
**Acceptance:** Metrics columns populate live; talent profiles show "Active 2 days ago" on cards.

### 5.2 — Metrics ribbon on profile drawer
**Problem:** Metrics not surfaced in UI.
**Fix:** Above bio in the drawer + on the public profile page:
```
─── EARNED ───
⚡ 94% response rate · 12 bookings · Active 2 days ago · ★ ID Verified
```

Empty state when 0 bookings: "New to Tulala" with subtle copy.
**Files:** `_drawer-section-services.tsx` or new metrics ribbon component
**Effort:** 4 hr
**Acceptance:** Metrics ribbon shows on every claimed talent profile.

**Phase 5 total: ~2 days.**

---

## PHASE 6 — Booking ↔ Skill integration (2-3 days)

S5 + S6.

### 6.1 — Inquiry → Skill linking
**Problem:** When client creates inquiry "Fire Performer for wedding in Tulum", no schema field stores "Fire Performer" as the requested skill.
**Fix:** Add `inquiries.requested_skill_term_id UUID REFERENCES taxonomy_terms(id)` and `inquiries.requested_proficiency_min TEXT`.
**Migration:** `supabase/migrations/20260907220000_inquiry_skill_link.sql`
**UI:** Inquiry creation form — required field "What skill are you booking?" with multi-skill picker (reuse `AddSkillSearch`)
**Effort:** 1 day
**Acceptance:** New inquiries record requested_skill_term_id; reports show inquiry mix by skill.

### 6.2 — Booking → Skill linking
**Problem:** When booking is created from an inquiry, the skill should carry through.
**Fix:** Add `bookings.fulfilled_skill_term_id UUID`. Auto-populate from inquiry on booking creation.
**Migration:** Adds column.
**Effort:** 4 hr
**Acceptance:** Reports can answer "Carmen completed 12 bookings as Fire Performer".

### 6.3 — Booking-history-driven proficiency hint
**Problem:** Proficiency is self-reported.
**Fix:** When a talent has 10+ completed bookings as Fire Performer at agency-verified Master level, surface a "📊 Industry-leading: 12 master-level bookings" badge.
**Files:** Public profile components
**Effort:** 4 hr
**Acceptance:** Profile shows booking-count signal alongside self-set proficiency.

### 6.4 — S6: Skill freshness / expiry prompts
**Problem:** A "Master Latin Dancer" with no bookings in 18 months might not be Master anymore.
**Fix:** Quarterly prompt: "Still actively performing as Latin Dancer? [Yes, still active] [Update level] [Remove]". Track via new column `proficiency_set_at TIMESTAMPTZ`.
**Migration:** Adds `proficiency_set_at`. Updates whenever proficiency_level changes.
**UI:** Prompt drawer on talent surface when log-in detects stale proficiency (>180d).
**Effort:** 1 day
**Acceptance:** Stale skills get re-confirmed quarterly; UI shows "Reaffirm skill" prompt.

**Phase 6 total: ~3 days.**

---

## PHASE 7 — Multi-tenant overrides + RLS (2-3 days)

Required before talent self-edit.

### 7.1 — S3: Per-tenant featured skill
**Problem:** `display_order=1` is global. Talent on Impronta + Agency Y shows the SAME featured skill on both sites. They might want different.
**Fix:** New `agency_talent_skill_overrides` table:
```sql
CREATE TABLE agency_talent_skill_overrides (
  tenant_id UUID,
  talent_profile_id UUID,
  taxonomy_term_id UUID,
  display_order INT,
  is_visible BOOLEAN DEFAULT true,
  custom_proficiency_level TEXT,
  custom_label TEXT,
  PRIMARY KEY (tenant_id, talent_profile_id, taxonomy_term_id)
);
```
**Migration:** New table.
**Effort:** 4 hr (schema only). UI consumer + actions: 1 day.
**Acceptance:** Each agency can override a talent's display order, hide a skill from their site, or rebrand the level.

### 7.2 — ADD-7: RLS on talent_profile_taxonomy
**Problem:** No RLS. Talent users could update other talents' rows if exposed to the API.
**Fix:** RLS policy:
- Talent can SELECT/INSERT/UPDATE rows where `talent_profile_id = (SELECT id FROM talent_profiles WHERE user_id = auth.uid())`
- Agency staff can do all operations on talents in their roster (`agency_talent_roster`)
- Platform staff bypass

**Migration:** New SQL.
**Effort:** 4 hr
**Acceptance:** Authenticated talent can only edit their own skills via the API.

### 7.3 — ADD-10: Talent-side editing
**Problem:** SkillSlotPanel is admin-only. Same component should power talent's profile editing.
**Fix:** Pass `viewMode: 'admin' | 'talent-self'` prop. Hide admin-only controls (Verify button, scope choice) when self-editing.
**Files:** `_skill-slot-panel.tsx`
**Effort:** 4 hr
**Acceptance:** Talent self-edit at their own URL uses the same panel without admin actions.

### 7.4 — ADD-11: Profile completeness algorithm V2
**Problem:** Current scoring is simple ratio.
**Fix:** Weight by `parent_category_field_groups.completeness_weight`. Heavy groups count more.
**Files:** `admin-talent-skills.ts` `computeProfileCompleteness`
**Effort:** 2 hr
**Acceptance:** A Model with all Physical fields filled but missing Identity scores higher than reverse, reflecting real publish-readiness.

**Phase 7 total: ~2-3 days.**

---

## PHASE 8 — Strategic V2 items (5+ days)

Lower urgency, larger scope.

### 8.1 — ADD-4: Per-skill pricing tiers
**Problem:** Talent might charge $500/hr for Master Fire Performance but $80/hr for Beginner Latin Dance. Not in current rate model.
**Fix:** New `talent_profile_skill_rates`:
```sql
CREATE TABLE talent_profile_skill_rates (
  talent_profile_id UUID,
  taxonomy_term_id UUID,
  hourly_rate_cents INT,
  day_rate_cents INT,
  event_rate_cents INT,
  currency TEXT,
  PRIMARY KEY (talent_profile_id, taxonomy_term_id)
);
```
**UI:** Inline rate input on each skill row.
**Effort:** 2 days
**Acceptance:** Different skills can have different rates; search can filter by max rate per skill.

### 8.2 — Plan-tier-gated skill cap
**Problem:** Currently 9 universal cap. Spec called for Free 5 / Studio 9 / Agency 15 / Network ∞.
**Fix:** Read from `plan_tier_caps` table (already exists) for `max_skills_per_talent`. Update trigger.
**Migration:** Add column to plan_tier_caps + update trigger.
**Effort:** 1 day
**Acceptance:** Free-tier tenant blocks adding 6th skill.

### 8.3 — ADD-12: I18n for new components
**Problem:** New SkillSlotPanel labels are hardcoded English.
**Fix:** Wrap labels in `t()` calls. Add Spanish translations to `web/messages/es.json`.
**Files:** All new component files
**Effort:** 1 day
**Acceptance:** Switching to Spanish (EN/ES toggle in chrome) translates all skill UI labels.

### 8.4 — TalentRegistrationDrawer (signup wizard) update
**Problem:** New talents registering still go through legacy chip-grid picker.
**Fix:** Replace with SkillSlotPanel in registration wizard step.
**Files:** Registration wizard component
**Effort:** 1 day
**Acceptance:** New self-registrations use multi-skill flow from day one.

### 8.5 — Public profile page (talent's own /t/<slug>)
**Problem:** Does the public profile show the new skills? Need to verify and update.
**Fix:** Audit + update `app/[locale]/t/[slug]/page.tsx`.
**Effort:** 1 day
**Acceptance:** Carmen's `tulala.digital/t/carmen-diaz` shows her skills with proficiency dots + verification badges.

### 8.6 — M5: Concurrent-edit warning
**Problem:** Two coordinators editing same talent — last write wins silently.
**Fix:** Supabase Realtime channel per `talent_profile_id`. When another user edits, banner shows "Marta is also editing this".
**Files:** `_skill-slot-panel.tsx` + new realtime hook
**Effort:** 1 day
**Acceptance:** Two browser tabs editing same talent show coordination banner.

**Phase 8 total: ~6+ days. Defer to V2.**

---

## ITEMS NOT YET ASSIGNED

These items from the audit don't fit cleanly in a phase yet:

### M1 — Tabs vs accordion confusion
**Problem:** 7 top tabs scroll-to accordion sections. Half-tab/half-accordion.
**Decision needed before implementation:** Pure tabs OR pure accordion + sticky nav.
**Effort if tabs:** 2 days
**Effort if accordion-only:** 1 day
**Owner:** Design call required.

### M2 — ProficiencyDotPicker keyboard a11y
**Problem:** No keyboard support, no ARIA.
**Fix:** `role="radiogroup"` + arrow key handler + larger touch targets.
**Effort:** 4 hr
**Acceptance:** Tab into picker, arrow keys navigate, Enter selects.

### M3 — AddSkillSearch overlay behavior
**Problem:** Clicking dividers can register as overlay click → modal closes.
**Fix:** Replace overlay-close with explicit Cancel button.
**Effort:** 30 min
**Acceptance:** Modal only closes on Cancel/Done click, not stray overlay clicks.

### M4 — Skill row breadcrumb
**Problem:** No category context shown on skill rows.
**Fix:** Add subtitle row: "Performers › Specialty Performers › Fire Performer".
**Effort:** 1 hr
**Acceptance:** Each skill row shows full breadcrumb on hover.

### M6 — Photo placeholder per category
**Problem:** Initials fallback is bland.
**Fix:** Add per-parent_category SVG silhouettes (model, chef, dj, etc.) as fallback.
**Effort:** 2 hr (find/create SVGs) + 1 hr wiring
**Acceptance:** Talents without photos show a category-appropriate silhouette.

### ADD-3 — Orphan relationship_types
**Decision needed:** archive `'specialty'`, `'skill'`, `'context'`, `'attribute'`, `'credential'` usage patterns OR build UI for each.
**Recommendation:** Surface 'specialty' (M8 above), 'context' (already partially done), 'skill' (could be tags). Archive 'attribute' and 'credential' if unused.

### ADD-5 — DB constraint validation
**Problem:** New trigger `enforce_talent_skill_caps` not stress-tested.
**Fix:** Add SQL test that inserts the 10th skill, then catches the rejection.
**Effort:** 30 min
**Acceptance:** Cap trigger rejection has automated test.

### ADD-9 — Inquiry workflow integration
**Already covered in Phase 6.1.**

---

## CRITICAL PATH

```
Phase 1 (polish) ──────┬──→ Phase 4 (trust harmonization)
                       │
Phase 2 (refactor) ────┼──→ Phase 3 (search/discovery) ──→ Phase 6 (booking ↔ skill)
                       │
                       └──→ Phase 7 (multi-tenant + RLS) ──→ Phase 8 (V2)

Phase 5 (metrics) — independent, can start anytime after Phase 2.
```

**If shipping in order:** Phase 1 → 2 → 3 → 5 → 4 → 6 → 7 → 8 (chronological).

**If maximizing impact ASAP:** Phase 1 (polish — tactical wins) → Phase 3 (search — biggest leverage) → Phase 5 (metrics — differentiator) → rest.

---

## RISK REGISTER

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Drawer file refactor breaks existing functionality | Medium | High | Phase 2 ships per-section, not all at once |
| Search ranking algorithm needs tuning post-launch | High | Medium | Phase 3 ships with simple scoring, iterate via metrics |
| Metrics nightly cron runs into Supabase scheduled-functions limits | Low | Medium | Validate scheduling early, fall back to GitHub Actions cron |
| Talent-side editing creates RLS gaps | Medium | High | Phase 7 has explicit RLS migration before exposure |
| Plan-tier cap regression breaks existing 9-skill talents | Low | Medium | Migration includes data-validation pass |
| Public profile redesign creates SEO/canonical-URL drift | Low | High | Phase 8.5 includes redirect rules |

---

## ACCEPTANCE CRITERIA — SHIP CHECK

A talent system is "production-ready V1.5" when:
- [ ] Every roster card shows a unique relevant photo (Phase 1.1)
- [ ] Every Impronta talent has skills assigned (backfill via Phase 1.8)
- [ ] Search by skill returns ranked results (Phase 3)
- [ ] Verification flow has confirmation + attribution (Phase 1.5)
- [ ] Trust badges + skill verification connected (Phase 4.1)
- [ ] Earned-trust metrics populated nightly (Phase 5)
- [ ] Booking links record requested skill (Phase 6.1)
- [ ] Talent self-edit possible without RLS bypass (Phase 7.2-7.3)
- [ ] Tests cover the resolver type-leak + cap trigger (Phase 2.6)
- [ ] No two parallel field systems on a single drawer (already done)

---

## TIMELINE (CALENDAR)

If executed sequentially with one-day handoffs and assuming a single engineer:

| Week | Phase(s) | Focus |
|---|---|---|
| Week 1 | Phase 1 | Polish round (Q1-Q7 + ADD-2) |
| Week 2 | Phase 2 | Component refactor + tests |
| Week 3-4 | Phase 3 | Search + Discovery |
| Week 4 | Phase 5 | Earned-trust metrics |
| Week 5 | Phase 4 + Phase 6 | Trust harmonization + booking integration |
| Week 6 | Phase 7 | Multi-tenant + RLS |
| Week 7+ | Phase 8 | V2 strategic items |

**Total: 6-7 working weeks** for the full V1.5 → V2 transition.

If shipping a "minimum viable polish" subset (Phases 1+3+5): **2.5 weeks.**

---

## WHAT I NEED FROM YOU TO PROCEED

For each phase, mark:
- ✅ Approved as scoped
- 🔄 Approve with modifications (specify)
- ⏭️ Defer (not now)
- ❌ Reject (don't do)

Plus:
1. Pick the priority order (chronological vs max-impact-first vs custom)
2. Decide M1 (tabs vs accordion)
3. Decide ADD-3 (orphan relationship_types — surface or archive)
4. Decide if Phase 8 items (per-skill pricing, plan-tier cap, i18n) are V1.5 or V2

Once you mark up the plan, I execute in order.
