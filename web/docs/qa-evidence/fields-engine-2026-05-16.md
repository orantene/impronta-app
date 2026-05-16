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

## 4. Phase C — one source of truth (DONE for the editing UX)

**C1 (shipped):** When the NEW DB-driven engine is mounted (real talent +
tenant — the canonical case), the legacy `field_values`/dynamicGroups
accordions (refinement / physical / wardrobe / details) are now hidden.
A tenant talent edits through **exactly one engine** (the Specialty
switcher). The legacy render code remains only for non-tenant/create
contexts where the new engine isn't mounted.

**C2 — architecture decision (deliberate, documented):**

| Slice | Engine | Why |
|---|---|---|
| Type-driven specialty fields | **NEW** `profile_field_definitions` (one engine) | The whole point — dynamic per talent type |
| Legacy physical/wardrobe/details | Hidden when NEW active; data in `field_values` retained | No destructive migration — Discover + public profile still read `field_values`. "Keep the data." |
| Identity / About / Location / Logistics / Rates / Availability / Media / Albums / Polaroids | **Intentionally bespoke** (NOT migrated) | Each has a rich custom UI (Places map, photo upload, bio AI, seasonal grid) and feeds specific downstream consumers (Discover filters, booking pre-checks, public profile). Forcing them through the generic field engine would regress UX and risk those readers. They are *consistent* (shared input/toggle/visibility primitives) without being *the same engine*. |

Net: "one source of truth" holds where it matters — the **variable,
type-driven** field set is one engine. Fixed structural sections stay
bespoke by design, not by omission. A future hard migration of
`field_values` → `talent_profile_field_values` (and repointing Discover/
public readers) is possible but is a separate, data-risk-managed project,
deliberately not bundled here.

## 5. Remaining (Phase D)

- Design consistency pass on section/accordion chrome — D1.
- Input-type UX pass (free-text → structured where it helps) — D2.
- Talent dashboard parity (reuse the proven engine) — D3.
