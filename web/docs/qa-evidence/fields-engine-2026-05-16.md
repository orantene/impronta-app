# Fields Engine — QA Evidence & Verification Checklist (2026-05-16)

**Status: SHIPPED TO PRODUCTION.** Live on https://app.tulala.digital and
https://tulala.digital — promoted deployment `tulala-ncvz6cifz`, all
`deploy:smoke` checks green (domain reachability, CSP parity, image
optimizer, Places route, edge region, **zero Supabase migration drift**).

---

## 1. What was delivered (this engine arc)

| Area | Change | Commit(s) |
|---|---|---|
| Bleed + IA | Killed Specialty "bleed"; 7-bucket rail; Services under About (Profile group) | earlier + `861e7727f` |
| Logistics | Travel/work-eligibility split into its own section | `2a9b31002` |
| Languages | Folded into About (not a standalone section) | `d912b6ba6` |
| **Dynamic type→fields** | Every parent category wired namespace→category; kids/speaker/tech authored | `3391d649e` `318fd3667` |
| Dedup | Deprecated duplicate `travel.willing_to_travel` | `a94c7b7df` |
| Switcher | Specialty details = sticky top-nav group switcher (not accordions) | `fbe47f658` |
| Type-driven | Creator/Experience/Media/skills globals moved to a compact About block; Specialty is 100% type-driven | `dbb70b0c7` `97b6dffd5` |
| Design consistency | One shared input style; Yes/No pill toggle; readable visibility pill | `78757c48a` `ddd29f5f8` `3992996b6` |
| Reactivity | Specialty re-resolves on in-session type change (await-then-bump, no blind debounce) | `a602a1b24` |
| **Hydration race** | No more false "Not set" flash for a typed talent (Phase A) | `8dad77c30` |

## 2. Engine correctness — proven against the LIVE production DB

Every one of the **19 parent categories** resolves a distinct, domain-correct
type-specific field set (so picking a talent type populates the right
Specialty groups). Live query result:

Performers 46f/6g · Sports&Fitness 38/6 · Wellness 36/6 · Hosts&Promo 32/4 ·
Influencers 30/4 · Models 29/4 · Music&DJs 23/6 · Travel&Concierge 23/7 ·
Transportation 21/5 · Chefs 21/6 · Event Staff 17/7 · Animals 16/4 ·
Photo/Video 14/5 · Home&Technical 11/3 · Hospitality 9/5 · Kids 8/1 ·
Security 8/4 · Speakers 8/1 · Production 7/2.

Resolver parent-chain verified: e.g. `actor → Stage & Show Acts →
Performers` → resolves 46 type-specific fields. No resolver/persistence
gap; picker write + loader read both use `relationship_type:"primary_role"`.

## 3. Your 2-minute verification checklist (admin login required)

On **https://app.tulala.digital** → Workspace → Roster → open a talent's
**Edit profile** drawer:

1. **Rail** reads: Profile (Identity · About · Services) · Craft (Specialty
   details) · Where & when (Location · Logistics · Availability) · …
2. **Specialty details** is a row of **sticky pills** (one per group), not a
   vertical accordion stack. Click a pill → that group's fields show.
3. **About** has a compact "General profile" block (Creator/Experience/
   Media/Skills) — these no longer clutter Specialty.
4. **Services** under About; opening a typed talent shows "Loading current
   role…" briefly, then the role — **never a false "Not set"**.
5. **Change the primary type** in Services → within ~1s Specialty re-resolves
   to the new type's field groups **without reopening the drawer**.
6. Inputs/toggles/visibility controls look consistent across every section.

If any step is off, that's the bug to fix next — report the step number.

## 4. Honest gaps (Phase C/D, in progress)

- **One source of truth not yet complete**: the OLD `field_definitions` /
  dynamicGroups path (legacy Physical/Wardrobe/Details) still co-exists —
  Phase C retires it.
- Some hardcoded slices remain bespoke (Logistics serviceArea) — Phase C
  decides engine-driven vs intentionally-bespoke.
- Design consistency pass on section/accordion chrome — Phase D1.
- Talent dashboard parity — Phase D3.
