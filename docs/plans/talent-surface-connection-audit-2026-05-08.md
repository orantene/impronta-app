# Talent surface — deep audit & connection plan

**Date:** 2026-05-08
**Author:** audit pass during pre-launch QA session
**Scope:** the seven talent self-surface tabs (Today / Messages / Profile / Calendar / Agencies / Public page / Settings), the routing/hydration layer beneath them, and the bridges that should feed them real data.

---

## TL;DR

The talent surface is **structurally rendered but data-disconnected, with routing brittleness on top.** When QA admin navigates to a talent tab they see Marta Reyes's mock data, hit hydration mismatches that reset the state machine, and end up on a URL that doesn't reflect the page they're looking at. Fixing this is a launch blocker — every charter (subscriptions, trust badges, exclusivity, billing) is downstream of a working talent surface.

The plan groups the work into **four phases (P0–P3)**:

| Phase | What | Why first | Effort |
|---|---|---|---|
| **P0 — Fix the foundation** | Hydration, URL sync, module errors | Everything above this is unstable until these are fixed | 1 day |
| **P1 — Wire the bridges** | Connect each tab to real data loaders | This is the actual "launch the talent surface" work | 2–3 days |
| **P2 — Wire the saves** | Hook drawer/edit actions to existing `talent-self-*` server actions | Makes the surface persistent, not read-only | 1–2 days |
| **P3 — Polish & gaps** | View Transitions, missing bridges (calendar, agencies hydration), bottom nav | Removes remaining sharp edges | 1 day |

Total: roughly **5–7 working days** of focused work to get the talent surface from "rendered with mocks" to "fully connected, saves persist, no hydration cascade."

---

## How I audited

1. Drove Chrome as `qa-admin@impronta.test` (real user, freshly-provisioned talent profile id `6b9c3de6-ad06-410a-86ab-16d8aac6404f`)
2. Hard-navigated to each talent URL: `/impronta/talent/{today,messages,profile,calendar,agencies,public-page,settings}`
3. Toggled the Workspace ↔ Talent pill from `/impronta/admin/*`
4. Captured the dev-server log to identify SSR errors and route activity
5. Cross-referenced symptoms with code in `_talent.tsx`, `_pages.tsx`, `_state.tsx`, the talent layout, and the data-bridge files

---

## Findings

### F1 — Hydration mismatch (CRITICAL, root cause of half the symptoms)

`ProtoProvider`'s render body mutates a module-level singleton `TENANT`:

```ts
// src/app/prototypes/admin-shell/_state.tsx:7213-7227
if (initialBridgeData?.tenantIdentity) {
  const ti = initialBridgeData.tenantIdentity;
  TENANT.name = ti.displayName;     // ← side effect during render
  TENANT.slug = ti.slug;
  TENANT.initials = ...;
  TENANT.domain = `${ti.slug}.tulala.digital`;
  TENANT.customDomain = `${ti.slug}.com`;
}
```

**Problem:** `TENANT` is a module-level constant read by `TulalaIdentityBar` and ~30 other components. The render-time mutation means SSR and CSR read different values:

- SSR with bridge: TENANT becomes "Impronta Models" → renders "Acting as Impronta Models"
- CSR initial render before mutation: TENANT is still the mock default "Atelier Roma" → renders "Acting as Atelier Roma"
- React detects mismatch → throws hydration error → falls back to client-only render → entire state machine re-initializes from scratch
- During fallback re-init, `preferredSurface` from `user_prefs` kicks in and may move user to a different surface than the URL implied

**Live evidence (dev log):**
```
Hydration failed because the server rendered text didn't match the client.
+ aria-label="Acting as Atelier Roma — switch"
- aria-label="Acting as Impronta Models — switch"
at TulalaIdentityBar (_pages.tsx:1402:15)
at TalentLayout (talent/layout.tsx:101:5)
```

**Downstream symptoms this single bug produces:**
- Talent surface URL doesn't update on tab clicks (state machine resets, `setTalentPage` doesn't persist)
- Direct nav to `/talent/profile` ends up rendering the standalone prototype (`Atelier Roma` mock) instead of the bridged talent layout
- Identity bar flickers between mock and real values

**Fix:** Move identity into context/props. Replace every `TENANT.xxx` reader with a `useProto()` consumer of `bridgeTenantIdentity`. ~30 call sites; mechanical but unavoidable.

### F2 — `AdminActionState is not defined` runtime error (HIGH)

```
ReferenceError: AdminActionState is not defined
  at module evaluation (admin-inquiries.ts:1754:23)
  at module evaluation (..._state.tsx:7944:42)  ← flipMode dynamic import
```

`admin-inquiries.ts` does `import type { AdminActionState }` then `export type { AdminActionState }`. Type-only references should be erased at compile time, but Turbopack is evaluating the re-export as a runtime value. Triggered every time `flipMode` calls the dynamic import for `setPreferredSurface`.

**Impact:** Talent ↔ Workspace toggle preference doesn't persist (the call fails silently, swallowed by the `.catch()` handler in `flipMode`).

**Fix:** Either drop the `export type` re-export and have consumers import from `admin-action-state` directly, or convert the file to use `import { type AdminActionState }` syntax which Turbopack handles correctly. ~5 minutes.

### F3 — Per-tab data inventory

| Tab | Bridge wired? | Saves wired? | Mock fallback? | Notes |
|---|:---:|:---:|:---:|---|
| **Today** | ✅ profile | n/a | conversations + upcoming | Onboarding banner uses bridge correctly. "Needs your reply" / "Next on calendar" cards still pull `MOCK_CONVERSATIONS`. |
| **Messages** | ❌ | ❌ | full | `useState(MOCK_CONVERSATIONS[0]!.id)` — entirely mock. `effectiveTalentInquiries` exists in proto state but isn't consumed here. |
| **Profile** | ⚠️ partial | ❌ | sections | Header uses `bridgeTalentSelfProfile` via `buildFreshTalentProfile`, but sections (rates, limits, credits, languages) still read from the mock profile object. `talent-self-profile-sections.ts` exists but isn't called from the drawer. |
| **Calendar** | ❌ | ❌ | full | Shows Marta's "Vogue Italia May 14–15", "Stella McCartney May 14", "08:30 · Mango". No `loadTalentCalendar` bridge exists. |
| **Agencies** | ❌ | ❌ | full | Reads `MY_AGENCIES.length`. `loadTalentAgencies` exists in the data-bridge but isn't piped through the layout. |
| **Public page** | ❌ | n/a | full | `const profile = MY_TALENT_PROFILE` — hardcoded Marta. |
| **Settings** | ⚠️ partial | ⚠️ partial | passkeys, contact prefs | Uses `bridgeTalentSelfProfile?.id` for the talent id but `MY_TALENT_PROFILE.name` for the passkeys card. Contact policy editor in TalentContactGate doesn't consume `loadTalentContactPrefs`. |

**Translation:** of the 7 surfaces, **0 are fully connected**. 3 are partial. 4 are full mock.

### F4 — Server actions exist; the UI just doesn't call them

Inventory of `src/lib/server-actions/talent-self-*`:

- ✅ `talent-self-profile-sections.ts` — bio/about, location, rates, availability, credits, limits, social proof
- ✅ `talent-self-provision.ts` — create profile from claim
- ✅ Implicit: `talent-pipeline.ts` — accept/decline/counter offers
- ✅ Read bridges: `loadTalentSelfProfile`, `loadTalentInquiries`, `loadTalentAgencies`, `loadTalentContactPrefs`

What's missing:
- ❌ `loadTalentCalendar(talent_profile_id, tenantId)` — reads `agency_bookings` + `talent_holds` + `talent_availability` for this talent
- ❌ `loadTalentMessages(talent_profile_id)` — for the Messages tab specifically (different shape than `loadTalentInquiries` which is unread-counts only)
- ❌ Save action for talent's contact policy (`talent-self-contact-prefs.ts`)
- ❌ Save actions for languages, skills (mirrors of existing admin versions but with `requireTalentSelfAction`)

### F5 — URL ↔ surface coupling is brittle

**Symptoms observed live:**
1. Hard nav to `/impronta/talent/today` → rendered talent surface, but Tab Context reported URL as `/impronta/admin` (hydration cascade reset surface)
2. Hard nav to `/impronta/talent/profile` → rendered the **workspace overview page** with Atelier Roma identity (full SSR/CSR de-sync)
3. Click Calendar tab while in talent surface → page changed but URL stayed the same

**Root cause:** F1's hydration cascade. When hydration fails, React discards the SSR tree, ProtoProvider re-mounts, and `preferredSurface` from `user_prefs` plus `initialSurface` from props can disagree. The state machine settles wherever, often not where the URL points.

**Once F1 is fixed** the URL routing should also stabilize. The `setTalentPage` guard I verified last session is correct logic — it just was never running because the state machine was being reset out from under it.

### F6 — Missing `loading.tsx` boundaries

Talent layout has 4 parallel queries on first hit. With force-dynamic, this means a noticeable wait before the talent shell paints. No `loading.tsx` means Next.js delays the URL commit until everything fetches. Adding skeletons would make navigation feel instant.

### F7 — Mobile bottom-nav hydration mismatch (MEDIUM)

```
+ <nav data-tulala-mobile-bottom-nav aria-label="workspace sections" ...>
- <div role="status" aria-live="assertive" ...>
at MobileBottomNav (_pages.tsx:12197:7)
```

Server is rendering a status div (toast?), client is rendering the bottom nav. Likely a `typeof window !== "undefined"` branch. Independent of F1; needs its own fix.

---

## Plan

### Phase 0 — Fix the foundation (1 day)

The cheapest changes that unlock everything else. **Do not skip — building features on top of a hydration cascade is sand foundation.**

| # | Task | File(s) | Effort | Verify |
|---|---|---|---|---|
| P0.1 | Replace `TENANT.xxx = ...` mutation with proper context propagation | `_state.tsx`, ~30 readers in `_pages.tsx`/`_drawers.tsx` | 4–6 h | No more "Atelier Roma" / "Impronta Models" hydration mismatch in dev log |
| P0.2 | Fix `AdminActionState` re-export | `admin-inquiries.ts` | 5 min | flipMode toggle persists `preferredSurface` to user_prefs |
| P0.3 | Fix MobileBottomNav SSR/CSR branching | `_pages.tsx:12197` | 30 min | No `MobileBottomNav` hydration error in dev log |
| P0.4 | Add `loading.tsx` to `/admin/` and `/talent/` route trees | new files | 30 min | Click Roster→Pitches; URL updates instantly even before content paints |
| P0.5 | Verify URL ↔ tab sync end-to-end | live test | 30 min | All 7 talent tabs + all 11 workspace tabs land on the right URL |

**Done when:** zero hydration errors in the dev log on full nav cycle of all tabs in both surfaces, URL always matches the active tab.

### Phase 1 — Wire the bridges (2–3 days)

Connect each tab to its real data source. Order is by user-visible value.

#### P1.1 — Talent Messages (½ day)

- Adapt `effectiveTalentInquiries` (already in proto state) into the conversation list shape
- Replace `MOCK_CONVERSATIONS[0]!.id` initial state with first item from the bridge array
- Empty state when bridge returns `[]`
- Verify QA admin (no inquiries) sees an empty inbox, not Marta's lookbook chatter

Files: `_talent.tsx:6577–7000` (TalentMessagesPage)

#### P1.2 — Public page editor (½ day)

- Replace `const profile = MY_TALENT_PROFILE` with `bridgeTalentSelfProfile`
- Use `buildFreshTalentProfile` helper for fresh talents
- Hide premium-only sections (custom domain, EPK) when `subscription.tier === "basic"`

Files: `_talent.tsx:15174` (PublicPageEditor)

#### P1.3 — Agencies (½ day)

- Add `loadTalentAgencies` to the talent layout's bridge bundle (it exists in `_data-bridge/talent.ts` but isn't threaded)
- Pass through proto state as `bridgeTalentAgencies`
- Replace `MY_AGENCIES.length` etc. with bridge data
- Empty state when fresh talent has no agency relationships

Files: `talent/layout.tsx`, `_state.tsx` (proto value), `_talent.tsx:15017` (AgenciesPage)

#### P1.4 — Profile sections (1 day)

The biggest one. Each accordion section in `MyProfilePage` reads from the mock profile.

- Bio / About → `bridgeTalentSelfProfile.bios` (need to extend the bridge to fetch bios)
- Languages → call `getTalentLanguages` server action (already exists)
- Rates → extend bridge to read `talent_profiles.rate_card_lines`
- Credits, Reviews, Limits → similar — extend the bridge or add per-section read actions

Files: `_talent.tsx:3312` (MyProfilePage) and the drawer it opens (`_talent_drawers.tsx`)

#### P1.5 — Calendar (½ day)

- Add `loadTalentCalendar(talentProfileId, tenantId)` to `_data-bridge/talent.ts` — reads `agency_bookings` (talent participants), `talent_holds`, `talent_availability` for the date range
- Pipe through layout → proto state
- Replace TALENT_REQUESTS dedup logic with bridge consumption
- Empty calendar for fresh talents

Files: new bridge fn, `talent/layout.tsx`, `_talent.tsx:11326` (CalendarPage)

#### P1.6 — Today (¼ day, partial)

Already mostly wired. Just need to:
- Replace `MOCK_CONVERSATIONS` reads in "Needs your reply" / "Next on calendar" with `effectiveTalentInquiries` (after P1.1) and bridge calendar (after P1.5)

#### P1.7 — Settings (¼ day)

- Pass `bridgeTalentSelfProfile.displayName` to `<PasskeysCard userName=...>`
- Wire `loadTalentContactPrefs` (exists) into the contact gate editor

Files: `_talent.tsx:14325` (SettingsPage)

**Done when:** QA admin sees their actual (mostly empty) state across all 7 tabs. Marta only appears as mock fallback in standalone prototype mode.

### Phase 2 — Wire the saves (1–2 days)

Each editable section needs to call the right server action.

| Section | Action | Status |
|---|---|---|
| About / Bio | `updateTalentAbout` (talent-self) | exists, mirror of admin |
| Location | `updateTalentLocation` (talent-self) | exists |
| Rates | `updateTalentRates` (talent-self) | needs creation — mirror admin version |
| Limits | `updateTalentLimits` (talent-self) | needs creation |
| Credits | `updateTalentCredits` (talent-self) | needs creation |
| Languages | `saveTalentLanguages` (already self-callable) | wire UI |
| Skills | `saveTalentSkills` (talent-self) | needs creation |
| Contact policy | new `setTalentContactPolicy` | needs creation |

**Pattern for each "needs creation":** copy the admin version, swap `requireStaffTenantAction` → `requireTalentSelfAction`, swap `tenantId` filter for `talent_profile_id` filter, ensure RLS policy lets talent self-write.

**Done when:** Every drawer's Save button persists to DB, optimistic UI updates, banner % completeness moves up after each save.

### Phase 3 — Polish & gaps (1 day)

- **P3.1** — View Transitions on tab nav. Your `next.config.ts` already has `experiments.viewTransition: true`; just need to wrap the `router.push` in `startViewTransition`. ~30 min.
- **P3.2** — `loading.tsx` skeletons that mimic each surface's chrome (instead of generic blank). ~2 h.
- **P3.3** — Mobile bottom-nav for talent surface (currently workspace-only).
- **P3.4** — `<Link>` prefetch on the talent topbar tabs so cold compiles happen in the background. ~1 h.
- **P3.5** — RLS audit: verify the talent-self read paths can't see other talents' data. ~2 h.

---

## Dependency graph

```
P0.1 (TENANT singleton)─┬─→ P0.5 (URL sync verify)──┐
                        │                            │
P0.2 (AdminActionState)─┤                            │
                        │                            ├─→ P1.* (all bridge wiring)
P0.3 (MobileBottomNav)──┤                            │       ↓
                        │                            │   P2.* (all save wiring)
P0.4 (loading.tsx)──────┘                            │       ↓
                                                     │   P3.* (polish)
```

P0 is a hard prereq — if we wire bridges (P1) on top of a broken state machine, every "saved" change might be lost when hydration resets.

---

## Out of scope (intentional)

- **Layout query consolidation** (the 9–10 queries per nav). Worth doing, but it's polish, not a launch blocker. Defer to a separate session post-launch.
- **PageRouteSyncer → `usePathname()` refactor.** Architectural cleanup, deserves its own RFC.
- **Bridge data structure split** (workspace vs talent). Same as above.
- **Pitch / Media+Watermark / Trust badges feature work.** All blocked on talent surface working anyway.

---

## Risks & open questions

| Risk | Mitigation |
|---|---|
| **TENANT singleton fix touches ~30 readers** — refactor breaks something subtle | Land in a feature branch, run typecheck + smoke tests. If isolation feels uncertain, keep singleton but make it computed-on-render from props rather than mutated |
| **RLS gaps on talent-self save paths** | P3.5 audit + a `requireTalentSelfAction` parity test similar to existing admin-scope test |
| **Cold dev compile masks remaining bugs** | Already mitigated by switching to Turbopack last session |
| **Time estimate optimistic** | Each phase is independently shippable. If P1.4 (profile sections) sprawls, ship P0 + P1.{1,2,3,5,6,7} as a meaningful checkpoint |

---

## What "done" looks like

A QA admin user (no profile data, no inquiries, no calendar events) can:
1. Land on `/impronta/talent/today` with a clean dev log (zero hydration errors)
2. See an empty inbox, an empty calendar, an empty agencies list — not Marta's data
3. Click each topbar tab → URL updates → page renders the right surface
4. Click "Continue setup →" on the onboarding banner → drawer opens to the right section
5. Fill in their name + city → click Save → page reflects the new completeness % without a full refresh
6. Toggle to Workspace and back → land on the same talent tab they left
7. Hard-refresh on `/impronta/talent/calendar` → still on the calendar, no fallback to the standalone prototype

Once that flow holds, the surface is launch-ready and you can build subscriptions / trust badges / billing on top of it with confidence.
