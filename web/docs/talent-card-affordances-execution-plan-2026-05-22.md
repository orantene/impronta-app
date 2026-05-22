# Site-Wide Talent-Card Affordances — Favorites + Inquiry — Execution Plan

**Date:** 2026-05-22 · **Status:** proposed · **Origin:** directory→client-dashboard funnel audit follow-up

---

## 0. Problem statement

Favorites ("save a talent") and Inquiry ("collect talent → contact the agency") are built **per-surface**, not as a platform capability. Three concrete symptoms:

1. **Two inquiry composers.** The public directory uses `DirectoryInquirySheet` → `InquiryCartForm`; the client dashboard and the public talent profile (`/t/[code]`) use the canonical `InquiryDrawer` ("Start a new project"). The May-14 "canonical InquiryDrawer" migration never reached the directory.
2. **Inconsistent + disconnected favorites.** The favorite control is a **bookmark** on directory cards and a **heart** in the client dashboard; front-page saves do not reliably surface in `/client/favorites`.
3. **Coverage gaps.** Homepage "Featured Talent", "Talent by Discipline", page-builder talent sections, profile-page related cards, search results and pitch landings each have their own — or missing — affordances.

**Goal:** one Favorites system + one Inquiry system, exposed through **one shared talent-card affordance layer**, present on **every profile card across the entire site**.

---

## 1. Reframe — a capability, not a directory feature

Every talent/profile card, anywhere it renders, shows the **same** two controls — Add-to-favorite and Add-to-inquiry — wired to the **same** stores and engine. A visitor builds one favorites list and one inquiry cart that follow them across home → directory → profile → dashboard, and across agencies.

---

## 2. Canonical systems — the single source of truth

| Concern | Canonical | Notes |
|---|---|---|
| Favorites store | `client_favorites` (auth — keyed by `client_user_id`, already **global / cross-tenant**) + guest `localStorage` (`impronta.public.favorite-ids`) + `MergeGuestFavorites` bridge | cross-agency saving is already supported at the data layer |
| Inquiry cart | `saved_talent` table + `usePublicDiscoveryState` | guest writes via RPC `guest_add_saved_talent` |
| Inquiry composer | `InquiryDrawer` → `submitInquiryNowAction` → `submitInquiry` engine | retire the `InquiryCartForm` divergence |
| Inquiry→Messages | `submitInquiry` Step 13: `insertSystemMessage` (client private thread) + `sendInquirySubmittedNotifications` + talent thread fan-out | wiring exists; needs a live end-to-end test |
| Favorite icon | new per-tenant branding token `favoriteIcon: 'heart' \| 'bookmark'` | admin-configurable |
| Shared UI | new `<TalentCardActions>` primitive + `useTalentAffordances()` hook | the one component every card embeds |

**Audit findings carried in (verified this session):** the inquiry engine is **real, not a mock**; the engine→messages link exists in code; `client_favorites` is already cross-tenant; the directory's `talents-by-ids` 404 was a poisoned-cache artifact, not a `main` bug.

---

## 3. Lanes, agents & effort

Effort key — **S** = contained (hours) · **M** = a focused day · **L** = multi-day / intricate.
Agents run as separate chats in isolated worktrees on per-lane branches (existing multi-agent protocol).

### Lane G — Foundation & canonical contracts · Agent: **Opus** · Effort: **L** · ⛔ GATE

| # | Task | Effort |
|---|---|---|
| G1 | Site-wide profile-card inventory — enumerate every component that renders a talent card; document its current favorite/inquiry wiring. Deliverable: inventory table appended here. | S |
| G2 | Canonical favorites contract — `useFavorites()` hook over `client_favorites` + guest localStorage; harden `MergeGuestFavorites` (fix the origin/timing sync gap). | M |
| G3 | Canonical inquiry-cart contract — `useInquiryCart()` + a single `openInquiry()` entry over `saved_talent` / `usePublicDiscoveryState`. | M |
| G4 | Build `<TalentCardActions>` — favorite toggle + inquiry toggle; tenant icon token; guest + auth; carries source attribution. | L |
| G5 | Add `favoriteIcon` to the branding token schema + default + render plumbing. | S |

**Done when:** `<TalentCardActions>` drops into any card and works against the real stores; nothing else depends on per-surface code. **Blocks:** A, B, D.

### Lane C — Nav & registered-client UX · Agent: **Sonnet** · Effort: **M** · ✅ no dependency — start immediately

| # | Task | Effort |
|---|---|---|
| C1 | Profile icon beside the hamburger (signed-in only). | S |
| C2 | Role-aware menu — detect session role (client/talent/admin), render that role's dashboard nav inside the menu. | M |
| C3 | Dedupe the desktop hamburger nav (repeating pages). | S |
| C4 | Registered-client UX polish (identity, sign-out, dashboard shortcuts). | M |

**Files:** `components/public-header.tsx`, mobile-nav, header actions. Independent of the directory section — safe to run in Wave 1.

### Lane A — Favorites system · Agent: **Sonnet** · Effort: **M–L** · depends on G2, G4, G5

| # | Task | Effort |
|---|---|---|
| A1 | Branding-settings UI — heart/bookmark toggle control in `/[tenant]/admin/site-settings/branding`. | M |
| A2 | Token → render: server emits the token; `<TalentCardActions>` reads it everywhere. | S |
| A3 | Fix favorites sync — guest/front-page save → `client_favorites` → `/client/favorites`; root-cause + fix the merge gap. | M |
| A4 | Cross-tenant verification — a save made on another agency's storefront appears in the same client's dashboard. | S |

### Lane B — Inquiry system · Agent: **Opus** · Effort: **L** · depends on G3, G4

| # | Task | Effort |
|---|---|---|
| B1 | Harden `InquiryDrawer` as the single composer — verify guest path, source attribution, shortlist intake. | M |
| B2 | Rework `DirectoryInquirySheet` — keep AI strip / talent quick-add / shortlist orchestration, swap the form body to `InquiryDrawer`. | L |
| B3 | Wire the header inquiry button + every "start inquiry" entry site-wide to the same `InquiryDrawer`. | M |
| B4 | Retire `InquiryCartForm` (or reduce to a thin adapter) once unused — kill the two-canonical drift. | M |

### Lane D — Site-wide adoption · Agent: **Sonnet** · Effort: **L** · depends on G4 (and A, B landed)

| # | Task | Effort |
|---|---|---|
| D1 | Homepage — "Featured Talent" + any talent cards adopt `<TalentCardActions>`. | M |
| D2 | Page-builder talent sections (Directory, Featured-Talent, showcase). | M |
| D3 | Talent profile page related/similar cards. | S |
| D4 | Client dashboard discover / favorites / shortlist cards. | M |
| D5 | Pitch landings, search results, any remaining surfaces (from G1 inventory). | M |

### Lane E — Integration & QA · Agent: **Opus** (integrator) · Effort: **M, ongoing**

| # | Task | Effort |
|---|---|---|
| E1 | Integrator — FF-only merges of every lane branch; collision watch. | M |
| E2 | Cross-surface QA — favorite + inquiry on every card surface × guest/client/returning, at 390/820/1440. | M |
| E3 | Inquiry↔Messages live test — submit an inquiry, confirm the client **and** lined-up talent receive the thread messages. | S |
| E4 | `tsc --noEmit` + lint gate; `deploy:smoke` after any deploy. | S |

---

## 4. Sequencing — waves

- **Wave 1 (parallel):** Lane G (gate) ‖ Lane C (independent).
- **Wave 2 (parallel, after G):** Lane A ‖ Lane B.
- **Wave 3 (after A + B):** Lane D.
- **Wave 4:** Lane E final pass (the integrator runs continuously from Wave 1).

Critical path: **G → B → D → E**. Lane C delivers visible UX in Wave 1 with no wait.

---

## 5. Multi-agent guardrails (existing protocol)

- Each lane branches off the latest `main`; isolated worktree; per-lane branch; FF-only integration; never force-push `main`.
- One migration per agent — `date -u +%Y%m%d%H%M%S` at start; park-restore on timestamp collision.
- `cd web && npx tsc --noEmit && npm run lint` before every commit.
- New migration ⇒ `npm run db:push` is part of the commit, before merge.

---

## 6. Risks & prerequisites

1. **Directory section files mid-merge.** `Editor.tsx` / `directory-results-toolbar.tsx` showed live conflict markers during the audit. Lanes G/B/D must not start until that merge lands clean (`git grep '<<<<<<<'` empty).
2. **Two "canonical" composers.** Both `InquiryDrawer` and `InquiryCartForm` self-label "canonical" — B4 must fully retire one or drift returns.
3. **Don't strip features.** `DirectoryInquirySheet`'s AI strip / quick-add / shortlist list must survive the B2 swap.
4. **Dev env.** Use `impronta.local` (allow-listed); add `impronta.lvh.me` to `allowedDevOrigins` if lvh.me QA is needed; Supabase is Free-tier (egress limits).

---

## 7. Effort summary

| Lane | Agent | Effort | Depends on | Wave |
|---|---|---|---|---|
| G — Foundation | Opus | L | — | 1 |
| C — Nav / UX | Sonnet | M | — | 1 |
| A — Favorites | Sonnet | M–L | G | 2 |
| B — Inquiry | Opus | L | G | 2 |
| D — Site-wide adoption | Sonnet | L | G, A, B | 3 |
| E — Integration & QA | Opus | M (ongoing) | all | 1–4 |

**Total:** ~6 lanes, ~1 integrator + 5 lane agents. Wave 1 is startable now; Waves 2–3 gate on the directory merge settling.
