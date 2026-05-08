# Roster Profile Drawer — Full QA Audit

**Date:** 2026-05-07
**Tester:** Claude (Chrome MCP, localhost:3000, qa-admin@impronta.test)
**Subject:** Carmen Díaz profile drawer (Influencer, Tulum)
**Scope:** Drawer header, all 7 top tabs, accordion sections, footer, kebab menu, primary/secondary type picker, new live category fields panel, autosave behavior

---

## Executive Summary

The drawer is functionally rich but has **3 critical bugs** that block the core "talent picks types → sees right fields" flow, plus **20+ UX gaps** that make the experience overwhelming. The new field architecture (Phase 6 wiring) renders correctly but the resolver leaks type-specific fields across categories.

| Severity | Count | Examples |
|---|---|---|
| 🔴 Critical (blocks core flow) | 3 | Type-leak in resolver · Picker chip-replace bug · Image render |
| 🟡 Major (degrades core UX) | 8 | No 1+2 cap visible · Two parallel field systems · Accordion overwhelm |
| 🔵 Minor (polish) | 12+ | Empty icons · Missing tooltips · Tab vs accordion redundancy |

---

## 🔴 CRITICAL BUGS

### C1 — Resolver leaks type-specific fields across categories

**What happened:** Carmen Díaz is an **Influencer** (parent: `influencers-creators`). Her live "Category fields" panel shows **59 fields across 6 groups**. But it includes:
- `Menu examples` (chef-only field)
- `Private chef day rate` (chef)
- `Tasting menu price (per person)` (chef)
- `Runway experience`, `Runway years`, `Shoot experience types` (model-only)
- `Audio/video samples` (singer)
- `Backing tracks available` (singer)
- `Rate · sponsored post`, `Rate · reel / video` — these ARE creator fields ✓ (correct)

**Root cause:** In `getFieldsForTalent()` resolver (admin-taxonomy.ts), line ~775:

```ts
} else if (d.field_group_id && groupMetaById.has(d.field_group_id)) {
  // Field belongs to a group that's auto-loaded for talent's parent_category
  include = true;
}
```

A type-specific field assigned to a **shared group** (e.g., chef.menu_examples → media-portfolio) leaks into ANY talent whose parent_category recommends that group. Since 19 of 19 parents recommend Media/Portfolio + Rates/Booking + Experience, all type-specific fields in those groups appear on every profile.

**Fix:** Type-specific fields require BOTH (a) field_group active AND (b) a recommendation joining the field to one of the talent's terms. Universal/global fields always render. Pseudocode:

```ts
if (d.tier === "universal" || d.tier === "global") {
  include = true;
} else {
  // Type-specific MUST have a recommendation matching the talent's terms.
  const r = recsByField.get(d.id);
  if (!r) continue;
  include = true;
  // Group is just for UI bucketing; doesn't qualify a field for inclusion.
  brought_in_by = { kind: "recommendation", term_id: r.term_id };
}
```

**Impact:** every profile is showing 30-40 wrong fields. Talent fills out chef cuisines as an influencer, Lorem-ipsum profile data, complete chaos.

---

### C2 — Talent type picker chip clicks REPLACE primary instead of adding secondary

**What happened:** Carmen's primary in DB is `influencer` (verified). I opened the drawer → Services tab → "+Also bookable in another category (8)" → expanded "Performers" → clicked **Fire Performer** chip. The chip went green. Then clicked **Latin Dancer** — Fire Performer deselected, Latin Dancer green. Then clicked **Cabaret Act** — Latin Dancer deselected, Cabaret Act green.

Then scrolled and saw header says **"Selected: Cabaret Act under Performers"** — UI presents Cabaret Act as the SOLE selection, replacing Carmen's "Influencer" primary visually.

**Then I checked DB:** Carmen still has `influencer` as primary. So the picker UI is **UI-state-only** — selections don't persist.

This is a double bug:
1. **Visually misleading:** the picker shows replace-behavior, NOT add-as-secondary. User thinks they're picking a 2nd type and they're erasing the 1st.
2. **Doesn't persist:** none of those clicks saved to `talent_profile_taxonomy`. The user can spend 5 minutes selecting types and lose all of it on page reload.

**User's stated mental model:** "talent has 1 primary + 2 secondary" — meaning clicking Fire Performer should ADD to the secondary slot. The picker should:
- Highlight the EXISTING primary differently (or lock it)
- Multi-select up to 2 secondaries
- Show running count: "1 primary + 1 of 2 secondary"
- Persist on click via the existing `setTalentTaxonomy` action (or whatever the action is named)

**Note:** the user hinted in earlier conversation: *"talent can select at least 9 sub categories — maybe Fire Performer and also Dancer and other related things"*. That implies a richer model than 1+2 — possibly the per-parent talent_type slot (e.g., under Performers, pick Fire Performer + Latin Dancer + Acrobat). The current picker shows 6 chips per category but allows single-select. **This is a fundamental product/UX decision** — see Recommendation R6 below.

---

### C3 — Roster card photos are placeholder identical headshots

**What happened:** 4 of 6 visible roster cards (Adriana Vega, Alexa Mendez, Chiara Moretti, Daniela Mizrahi) all show the SAME stock-headshot blurred photo. Camila Ortega shows initials "CO" (no photo). Carmen Díaz shows a landscape mountain photo (the G8 audit issue from 2026-05-07 — `pickPrimaryThumb` bug).

This is a known issue (`pickPrimaryThumb` in `_data-bridge.ts` prefers `card` variant over `original` regardless of crop_mode) but it's deeply embarrassing for a talent agency demo where talent diversity is the whole point.

**Fix priority:** before any client demo. Even before fixing C1/C2.

---

## 🟡 MAJOR UX GAPS

### M1 — Two parallel field systems coexist

**What it looks like:** the drawer has TWO field rendering systems running side-by-side:
1. **Legacy hardcoded sections** (Identity / Services / Location / Media / Albums / Polaroids / About) — top tabs + accordion below
2. **New `Category fields (live)` panel** (the Phase 6 work) — accordion entry between Identity and Services

The new panel says "59 fields across 6 groups · 0 required to publish" then dumps every field as a read-only chip with TYPE-SPECIFIC / GLOBAL / UNIVERSAL badges.

The legacy sections show editable form fields. The new panel shows read-only previews.

**Why this is bad:** the talent (or admin editing on their behalf) sees the SAME concept twice — e.g., "Cover photo" appears in both the Media section (editable) and in the Category fields panel (read-only chip). Confusing.

**Fix path:** the new panel should EITHER (a) replace the legacy accordion sections entirely, OR (b) be hidden by default behind an "Advanced field catalog (admin)" toggle. Dual-rendering is the worst of both.

---

### M2 — No visible 1+2 cap indicator anywhere

The product rule "1 primary + 2 secondary" is invisible in the UI. The picker just shows a search box + category list + chips. There's no:
- Count badge ("1 of 1 primary set · 0 of 2 secondary used")
- Lock state on the primary
- Visual constraint when 2nd secondary is added
- "+ Slot 2" button or "+1 more" indicator

The DB has the universal cap trigger from `taxonomy_cleanup_v1`, but the UI gives no clue it exists. Users don't know what they can or can't do.

**Fix:** small running counter at the top of the Services section: `▴ Primary: Influencer · Secondary 1: empty · Secondary 2: empty`.

---

### M3 — Accordion is too long; double-tab navigation is redundant

**Top tabs:** Identity / Services / Location / Media / Albums / Polaroids / About (7 tabs)
**Accordion sections (when scrolled):** Add 2 things to publish · Identity · Category fields (live) · Services · Location & service area · Media · Cover photo · Hello reel · Portfolio albums · Polaroids · About · Tone · Bio · I love · I avoid · Availability · Rates · Languages · Refinement · Credits · Limits · Files · Past clients & testimonials · Trust & verification · Admin controls

That's **25 distinct sections** on one drawer. The top tabs partially mirror the accordion. Switching tabs scrolls the accordion to that section. The mental model is unclear — is it tabs OR accordion?

**Fix:** pick one. My recommendation: **top tabs only**, each tab opens to a single panel (no accordion within a tab). 7 tabs × 4-6 fields each is more navigable than one giant accordion.

---

### M4 — "Add 2 things to publish" gating panel disconnected from required fields

The pinned banner at top says "Add 2 things to publish: Add photos · Add a bio". But:
- The **DB-resolved required-before-publish count is 0** (panel says "0 required to publish")
- There's no visible "checklist" tied to actual `required_before_publish` flags from the recommendations
- The "2 things" appear to be hardcoded (photos + bio), not derived from the catalog

**Fix:** wire the pinned banner to the resolver — count fields where `f.required_before_publish && !value_filled` and show that as the publish-readiness checklist.

---

### M5 — Identity + Services have GREEN ✓ checkmarks; meaning unclear

Sections like "Languages", "Trust & verification", "Admin controls" all show a green ✓. So does "Identity" and "Location & service area". But MEDIA, Media (cover photo), Polaroids, About don't. There's no key.

I'd guess green ✓ = "section has at least one filled field" but that's a guess. Without a key, the indicator is noise.

**Fix:** legend at top of drawer or tooltip on the icon. Or simpler: percentage filled per section (e.g. "Identity: 3 of 8").

---

### M6 — Career interests bullet appears empty

Inside the Services panel, after the picker, there's a row: `• Career interests · optional · open-to-grow signals`. The bullet is a black dot with no icon. Clickable but unclear what it expands to. No tooltip.

---

### M7 — "Live taxonomy · 8 visible · 11 more" exposes implementation jargon

This appears under the picker. "Live taxonomy" is a developer term — the talent reading this drawer thinks "WTF is taxonomy?". The 8/11 split is meaningful (it's the `is_visible_by_default` flag we set in Phase 3) but the language leaks the model into the UI.

**Fix:** "Showing 8 categories. + Show 11 more" or similar plain English.

---

### M8 — "Show all 219 more in this category" — wrong number

After selecting Cabaret Act under Performers, the picker shows "+ Show all 219 more in this category". But we know Performers has only 28 talent_types. 219 is wrong.

Likely the count is summing all categories OR including archived types OR coming from a stale fixture.

---

## 🔵 MINOR / POLISH

### P1 — Photo & Video and Creators category icons are bare bullets

In the secondary picker's category list: Models 👤, Hosts 🎤, Performers ✨, Music 🎧, Chefs 👨‍🍳, Wellness 🌿 all have emoji. But Photo & Video and Creators show a black dot (•). Inconsistent.

### P2 — "Saved 9s ago / 1m ago / 3m ago" in drawer header is anxiety-inducing

The drawer header shows "Saved 9s ago" → "Saved 1m ago" → "Saved 3m ago" and counts forever. After 5 minutes it just says "Saved 5m ago". This implies stale state but it's actually fine. Better: show "Saved" with a fading checkmark, no relative timestamp.

### P3 — Map preview in Location is decorative, not functional

The map shows Tulum + a 50km radius circle but it's static — can't drag, zoom, click. Looks like a placeholder for a real map widget.

### P4 — "Pick a Talent Type to regenerate" hint in About tab is enticing but unactionable

The bio textarea shows a link "🔄 Pick a Talent Type to regenerate" — but Carmen already HAS a talent type set. The link doesn't seem to do anything. Either remove or wire up.

### P5 — Bio character counter "22 / 280" is too restrictive for some types

280 chars is Twitter-bio territory. Models / chefs / artists often need longer professional summaries.

### P6 — "Tone" pre-selects Professional with no explanation

The Tone picker (Editorial / Friendly / Professional / Quirky) defaults to Professional with green highlight — but no copy explains what Tone affects. Likely it's an AI-generation hint, but unclear.

### P7 — Multi-language UI for bios doesn't explain auto-translate

"+ Add language" pill exists. If user adds Spanish, are they expected to translate the EN bio manually? Auto-translate? Not stated.

### P8 — Drawer footer "Draft ▼ · Publish" is the only action

Single Publish button — fine. But Draft ▼ dropdown isn't visually explained. Likely it lets you change workflow_status from Draft → Pending → Invited → Published. A label "Status: Draft" would clarify.

### P9 — Kebab menu is a grab-bag of mixed-priority actions

The kebab opens: Undo · Redo · View as client · Apply template · Save as template · Open full editor · Save & exit · Remove from roster.

"Remove from roster" is destructive and should be visually separate (it IS — red text + separator). But "View as client" is high-value (talent-facing preview) and is buried mid-list.

### P10 — Roster card "Draft" pill always shown

Every roster card shows a "Draft" pill at top-left — because all 27 talent are draft (the G6 finding). When everyone is draft, the pill is noise. Hide when all in same state, OR turn the page header into "27 drafts to review" actionable banner.

### P11 — "+ More categories... (11)" dead-end

After clicking + More categories on the secondary picker, presumably you see the 11 hidden parents. But there's no breadcrumb back to "show fewer". If the user toggles, no indicator shows it expanded.

### P12 — Live-resolved field rows don't show the source term

Each field in the new panel has tier + kind badges but doesn't say WHERE it came from. Influencer's "Engagement rate" came from her primary type's recommendation. Clicking the field row could show "← from Influencer (primary)" in a tooltip. The resolver already returns `source_term_id` and `brought_in_by` — just unused in the UI.

---

## 🎨 2026 UI Recommendations

### R1 — Replace dual-system with one "smart form" view

Replace the 7-top-tabs + 25-accordion-sections monstrosity with a **single scrollable form grouped by field_group**, with a sticky group-nav on the left (like Notion settings or modern admin dashboards).

```
┌────────────────────────┬───────────────────────────────────┐
│ • Identity ✓ 8/8       │  IDENTITY                          │
│ • Services ✓ 1/3       │  Stage name: ____________          │
│ • Physical 0/12        │  Pronouns:  [she/her ▼]            │
│ • Media 1/16           │  ...                               │
│ • Languages ✓ 2/8      │                                    │
│ • Experience 0/8       │                                    │
│ • Rates 0/6            │                                    │
│ • Availability ✓ 4/9   │                                    │
│ • Trust 0/7            │                                    │
└────────────────────────┴───────────────────────────────────┘
```

Sidebar nav reflects the resolved groups directly. Click a group → scroll to it. Completion shown live. No tabs, no accordion-within-tab.

### R2 — Picker as "type slot" UI

Replace the chip-grid picker with explicit slots:

```
TALENT TYPES
┌─────────────────────────┐
│ 1 PRIMARY (required)    │
│ ╭─────────────────────╮ │
│ │ 🎤 Influencer       │ │
│ │ Influencers · L3    │ │
│ │ [Change ▾]          │ │
│ ╰─────────────────────╯ │
│                         │
│ + 2 SECONDARY (optional)│
│ ╭─────────────────────╮ │
│ │ + Add secondary type│ │
│ ╰─────────────────────╯ │
│ ╭─────────────────────╮ │
│ │ + Add secondary type│ │
│ ╰─────────────────────╯ │
└─────────────────────────┘
```

Three slots, visually obvious. Click a slot → search/picker drawer. Drag to reorder. Clear constraint.

### R3 — Modern command-palette search

Replace the typeahead pickers with a unified `⌘K` command palette: type "fire" → instantly see "Fire Performer (Performers / Specialty Performers)" with breadcrumb context. Apple-style, used by Linear / Notion / Raycast / Vercel dashboards. Familiar to 2026 users.

### R4 — Field-group cards with "show fields" reveal

Each group renders as a compact summary card: title, completion progress, weight badge. Click → expands to show fields. Default: only "heavy" weight groups expanded. "Light" / "optional" groups collapsed by default to reduce overwhelm.

### R5 — Earned-trust ribbon (when there's data)

Once we have booking data, the profile gets a colored ribbon showing earned signals (per Phase 5 spec):

```
─── EARNED ──────────────────────────────────
  ⚡ 94% response rate · 12 bookings · 3y on Tulala · ★ Verified ID
─────────────────────────────────────────────
```

Above the bio. Static now, populated by the metrics layer when V2 ships.

### R6 — Resolve the "9 sub-categories" question

User's hint: *"talent can select at least 9 sub-categories — maybe Fire Performer and also Dancer and other related things"*. Two interpretations:

**Option A: 1 primary + 2 secondary parent_categories, with up to N talent_types per category.**
Carmen picks Performers as primary → can pick 3 sub-types under Performers (Fire Performer + Dancer + Cabaret Act). Plus 2 more parent_categories with same rules = up to 9 total.

**Option B: Keep 1+2 cap on parent_categories, but pick ONE talent_type (level 3) per slot.**
Just 3 talent_types total — current product spec. Simpler, less marketplace dilution.

The user seemed to want A. If so, the schema + UI + resolver all need updating. **Decision needed before fixing C2.**

### R7 — Photo grid overhaul

Replace the current "Cover photo / Hello reel / Portfolio / Polaroids" laundry list with a unified **photo manager** showing all assets in a 4-column grid with role tags (cover / headshot / portfolio / polaroid) and drag-to-reorder. Single screen, multi-select, batch role assign.

### R8 — Inline AI assist for bios + profile completeness

The "Pick a Talent Type to regenerate" hint already suggests the AI hook exists. Wire it: small **✨ Suggest** button on every textarea. Click → AI proposes a draft based on talent type + service area + existing fields. User edits or accepts. Modern (Notion AI / Linear AI / Cursor pattern).

### R9 — Real-time validation with `validation_rules` JSONB

We already added `validation_rules` JSONB on `profile_field_definitions` (Phase 3). Use it: number fields show min/max errors live, regex fields validate as user types, enum fields show suggestions. Today: zero validation visible.

### R10 — Conditional fields via `show_when` JSONB

Phase 3 added `show_when` JSONB. We already have one rule in the data (`performer.group_size` shows when `performer.solo_or_group === "group"`). Wire the engine: read `show_when`, evaluate against current form state, hide/show fields. Removes clutter for fields that don't apply.

---

## Recommended Action Order

| # | Action | Effort | Impact |
|---|---|---|---|
| 1 | **Fix C1** — resolver type-leak (one file change in admin-taxonomy.ts) | 30 min | Critical — without this, every profile is wrong |
| 2 | **Fix C3** — pickPrimaryThumb for roster card images | 1 hr | Embarrassing in any demo |
| 3 | **Decide R6** — "1+2 parents × N types per slot" vs "1+2 type total" | (decision) | Blocks C2 fix |
| 4 | **Fix C2** — picker behavior + persistence per R6 decision | 4-6 hr | Blocks core flow |
| 5 | **Fix M1** — collapse dual field systems (hide live panel behind admin toggle as quick win) | 30 min | Reduces cognitive load by 40% |
| 6 | **Fix M2 + M4** — visible cap counter + publish checklist | 2 hr | Talent suddenly knows what to do |
| 7 | **Fix M3** — pick tabs OR accordion (tabs preferred) | 1 day | Drawer feels designed not assembled |
| 8 | **Polish round 1** — P1, P2, P5, P6, P7, P8 | 1 day | Profession-grade feel |
| 9 | **R1, R4, R8** — sidebar nav + group cards + AI assist | 3 days | "Looks 2026" |
| 10 | **R9, R10** — wire validation + show_when | 1 day | Form actually validates |

Total to "ready to demo cleanly": ~2 days. Total to "looks 2026 admin tool": ~5 days more.

---

## What's Working

To balance the audit:
- ✅ Drawer opens fast, autosave fires reliably (Identity tab change → "Saved 9s ago" within ~800ms)
- ✅ Tab switching is snappy
- ✅ Drawer is responsive — doesn't break at narrow widths
- ✅ Live category fields panel SHOWS UP and renders the new architecture (the data leak is the only resolver bug)
- ✅ Existing fields (Identity, Location, About) save to DB cleanly
- ✅ Tone selector, language picker, charcount, kebab menu all work
- ✅ Trust & verification + Admin controls sections recognize green-checkmark state
- ✅ "Open full editor" link gives an escape hatch to the canonical CRUD page
- ✅ Phase 3 schema migration (parent_category_field_groups + 13 groups) clearly drives this view — the architecture is alive

---

## Files Referenced

- `web/src/lib/server-actions/admin-taxonomy.ts` (resolver — C1)
- `web/src/app/prototypes/admin-shell/_drawers.tsx` (LiveCategoryFieldsPanel + picker — C2, M1)
- `web/src/app/prototypes/admin-shell/_data-bridge.ts` (pickPrimaryThumb — C3)
- DB tables: `parent_category_field_groups`, `profile_field_recommendations`, `profile_field_groups`

---

## Next-step proposal

Don't fix everything in this audit. Focus order:

1. **Today:** ship C1 (resolver fix) + C3 (photo fallback). Both are < 2 hour fixes.
2. **Decision today:** answer R6. The product rule for type slots determines how to wire C2.
3. **This week:** C2 + M1 + M2 + M4. After this, the drawer is correct + clear.
4. **Next sprint:** R1 sidebar nav. Largest visual upgrade.
5. **Later:** R8 AI assist, R9/R10 validation engines, R5 metrics ribbon.

Want me to start with **C1 + C3 right now** since they're tactical fixes? Or prefer to discuss R6 first (which determines the picker rebuild)?
