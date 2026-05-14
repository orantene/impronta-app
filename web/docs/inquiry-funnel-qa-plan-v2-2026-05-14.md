# Inquiry funnel QA plan v2 — 2026-05-14

> **Replaces** the implicit ad-hoc plan behind the v1 report
> (`inquiry-funnel-qa-report-2026-05-14.md`). v1 walked the happy
> path through 4 of 6 personas and 1 of 5 entry points. v2 is the
> binding coverage matrix for full pre-launch sign-off.

This is a **gap-driven** plan — every cell maps to a real surface +
real engine path that exists in code today. Items already covered in
v1 are marked ✅ for traceability; everything else is open.

---

## 0. Why v2 exists — gaps in v1

| Gap | Evidence | Risk |
|---|---|---|
| Only 1 of 5 inquiry entry points walked | v1 covered workspace `/client/inquiries/new`. Untouched: public directory cart, talent public page CTA, admin manual sheet, pitch landing | Each path has its own form layout, validation, and engine args. A regression in any of the 4 untouched paths ships silently. |
| Only 4 of 6 personas walked | v1 covered admin / qa-client-1 / sofia (talent) / guest CTA. Untouched: coordinator (derived role), talent-coord (hybrid), pure guest (unauthed submit from directory) | Coord + talent-coord were the headline of the 2026-05-13 Messages slice; never browser-verified post-ship. Hybrid identity resolver (slice L) shipped same day — completely un-walked. |
| Only 1 of 4 form layouts inspected visually | v1 inspected the workspace-shell form. The same `<InquiryCartForm>` renders in 4 contexts (public dir / talent page drawer / workspace shell / pitch). User feedback on workspace shell ("loots so bad with no fields") proves the layout shipped without anyone looking at it on the actual viewport users see. | Other 3 contexts are likely worse — drawer is narrower (440px), public directory is wider (1280px), pitch is unknown. |
| 1 of ~10 engine paths walked end-to-end | v1 walked `submitInquiry` → `addTalentToRoster` → `acceptTalentInvitation` → `createOffer` (blocked, then fixed). 17 OTHER call sites use the same `.eq("version", expectedVersion)` UPDATE pattern that bit `createOffer`. None tested live. | Any of `sendOffer`, `counterOffer`, `acceptOffer`, `convertToBooking`, `assignCoordinator`, `submitApproval`, lifecycle mutations could carry the same trigger / RLS / error-swallow combo. |
| Admin Offer tab is mocked | Caught in v1 addendum #3 — reads `MOCK_OFFER_FOR_CONV` constant, not live `inquiry_offers`. Surfaces stale "$2,500 cash" forever. | Demo-grade UI hiding live engine work. Easy to mistake demo state for shipped state. |
| Zero realtime QA | Supabase realtime subscriptions on `inquiry_messages`, `inquiries`, `inquiry_offers` exist. Never opened two browsers and watched cross-update. | Two coordinators on one inquiry can collide; stale UI can write back stale version → silent version_conflict loop. |
| Zero mobile QA | All v1 work at 1155px desktop. The mobile shell (slice I, 108px header) shipped 2026-05-13. | Mobile is the headline shipping surface per 2026 execution plan. Pre-launch with zero mobile passes is unacceptable. |
| Zero i18n QA | `/es/<tenant>` locale fix landed 2026-05-13 (`1e5575b3b`). No Spanish-locale walk. | Half the target market doesn't read English. |
| Zero plan-tier QA | Free / Studio / Agency / Network tiers gate fields (`meetsPlan`), watermarks, media inventory, etc. Only tested as "agency_admin in main tenant" (probably highest tier). | Lower-tier tenants may see broken UIs or have access to features they shouldn't. |
| Zero accessibility QA | No keyboard-only walk, no screen-reader pass, no contrast audit. | Founder-stage but still ships to real clients. |
| Zero error-state QA | All v1 paths assumed happy path. What happens when DB is down? Resend bounces? Storage upload fails? Honeypot triggers? | Production-grade UX requires the unhappy path to look intentional, not crashed. |
| Zero cross-tenant guard QA | `validateActorPermission` exists per engine call. Never tried "agency-A admin uses URL of agency-B inquiry". | Multi-tenant security is the #1 audit failure mode for SaaS. |

These 12 gaps drive the matrices below.

---

## 1. Surface inventory (what exists in code today)

### 1a. Inquiry **entry points** (5 paths into `submitInquiry`)

| # | Surface | Path | Auth | Form layout | Walked in v1? |
|---|---|---|---|---|---|
| E1 | Public directory cart | `/(public)/directory/cart` | guest OR client | `<InquiryCartForm>` wide layout | ❌ |
| E2 | Talent public page CTA | `/t/[profileCode]` | guest OR client | `<InquiryCartForm>` drawer (~440px) | ❌ |
| E3 | Workspace client `/new` | `/[tenantSlug]/client/inquiries/new` | client | `<InquiryCartForm>` workspace-shell (~768px) | ✅ |
| E4 | Admin manual sheet | admin shell "New Inquiry" button via `_pipeline-actions.ts` | agency_admin | sheet-embedded `<InquiryCartForm>` | ❌ |
| E5 | Pitch landing | `/share/pitch/[token]` via `pitch-engine.ts` | guest OR client | pitch-specific layout | ❌ |

### 1b. Funnel stages × who acts

```
new → submitted → coordination → offer → accepted/declined → booked/cancelled → completed → reviewed
                       │                       │
                       ▼                       ▼
            (admin invites talent)   (admin sends offer / client approves)
                       │                       │
              (talent accepts/declines) (client accepts/declines)
```

Engine paths exposed in code:

| Path | Actor | v1 status |
|---|---|---|
| `submitInquiry` | guest / client / admin / talent | ✅ walked once (E3 only) |
| `moveToCoordination` | admin / coord | ❌ |
| `setPriority` | admin | ❌ |
| `addTalentToRoster` | admin / coord | ✅ walked once |
| `acceptTalentInvitation` | talent | ✅ walked once |
| `declineTalentInvitation` | talent | ❌ |
| `assignCoordinator` | admin | ❌ |
| `acceptCoordinatorAssignment` | coord | ❌ |
| `declineCoordinatorAssignment` | coord | ❌ |
| `autoAssignCoordinatorFromSettings` | system | ❌ |
| `addSecondaryCoordinator` | admin | ❌ |
| `removeSecondaryCoordinator` | admin | ❌ |
| `promoteToPrimary` | admin | ❌ |
| `createOffer` | admin / coord | ✅ walked + fixed |
| `sendOffer` | admin / coord | ❌ |
| `updateOfferDraft` | admin / coord | ❌ |
| `counterOffer` | admin / coord | ❌ |
| `clientAcceptOffer` (`submitApproval`) | client | ❌ |
| `clientRejectOffer` | client | ❌ |
| `submitTalentRate` | talent / talent-coord | ❌ |
| `submitApproval` | client / talent / coord | ❌ |
| `rejectApproval` | client / talent / coord | ❌ |
| `convertToBooking` | admin | ❌ |
| `freezeInquiry` | admin | ❌ |
| `unfreezeInquiry` | admin | ❌ |
| `archiveInquiry` | admin | ❌ |
| `processCoordinatorTimeouts` | cron | ❌ |
| `processExpirations` | cron | ❌ |
| `retryFailedEngineEffects` | cron | ❌ |
| `addRequirementGroup` / update / remove / assignParticipantToGroup | admin / coord | ❌ |
| `sendMessage` / `editMessage` / `deleteMessage` / `markThreadRead` | all roles | ❌ |

**Total: 32 engine paths exposed. 4 walked in v1. 28 unverified live.**

### 1c. Per-role surface tree

**Public** (10 routes): `/`, `/directory`, `/directory/cart`, `/inquiry-sent`, `/models`, `/p/[...slug]`, `/posts`, `/posts/[slug]`, `/contact`, `/t/[profileCode]`

**Marketing** (12 routes): `/`, `/agencies`, `/faq`, `/get-started`, `/how-it-works`, `/integrations`, `/legal/privacy`, `/legal/terms`, `/network`, `/operators`, `/organizations`, `/pricing`, `/waitlist`

**Admin** (16 routes): `/[tenant]/admin`, `/account`, `/bookings`, `/bookings/[id]`, `/bookings/[id]/call-sheet`, `/calendar`, `/clients`, `/media`, `/messages`, `/operations`, `/payouts`, `/payouts/return`, `/pitches`, `/production`, `/roster`, `/roster/[id]`, `/roster/new`, `/settings`, `/site`, `/site-settings/*` (10 subroutes), `/website`, `/work`, `/work/[id]`

**Client** (8 routes): `/[tenant]/client`, `/bookings`, `/discover`, `/inquiries`, `/inquiries/[id]`, `/inquiries/new`, `/pitches`, `/settings`, `/shortlists`, `/today`

**Talent** (10 routes): `/[tenant]/talent`, `/activity`, `/agencies`, `/calendar`, `/inbox`, `/inbox/[id]`, `/profile`, `/public-page`, `/reach`, `/settings`, `/settings/payouts`, `/today`

**Auth + checkout** (6 routes): `/auth/*`, `/checkout/success`, `/checkout/cancel`, `/invite/[token]`, `/onboarding`, `/share/*`

**Total unique routes: ~70+. v1 walked 6.**

---

## 2. The coverage matrix

Every cell below is one QA pass. Each pass produces a row in
`web/docs/qa-evidence/2026-05-14/` with a screenshot + result.

### Matrix dimensions

- **Roles (6)**: guest · client · talent · talent-coord · coord · admin
- **Entry points (5)**: E1–E5 (see §1a)
- **Funnel stages (8)**: new · submitted · coordination · offer · accepted · booked · completed · reviewed
- **Viewports (4)**: 375 (mobile S) · 768 (tablet) · 1280 (laptop) · 1920 (desktop XL)
- **Locales (2)**: en · es
- **Plan tiers (4)**: free · studio · agency · network

Full Cartesian is 6 × 5 × 8 × 4 × 2 × 4 = **7,680 cells**. That's
absurd. The plan **does not target full Cartesian** — it targets a
prioritized slice:

#### Priority 0 — must pass before any kind of launch

P0.A — **Each entry point E1–E5 × each role that can use it × 1280px desktop × en × agency tier.**
~15 cells. This is the smoke-test grid.

P0.B — **Full funnel walk for ONE inquiry through every stage transition × every actor.**
~12 stage-transition cells, one happy-path inquiry. Verifies the 32 engine paths.

P0.C — **Cross-tenant guard test** — agency-A admin opens agency-B inquiry URL → should 403.
4 cells (admin / coord / talent / client cross-tenant URLs).

P0.D — **Mobile pass of the 5 most-trafficked surfaces × 375px.**
Surfaces: inquiry form (E1), client inquiry detail, admin inquiry chat tab, talent inbox detail, talent public page. ~5 cells.

**P0 total: ~36 cells.**

#### Priority 1 — pre-launch polish

P1.A — All entry points × all valid roles × 375px + 768px. ~30 cells.
P1.B — All admin surfaces (16 routes) × 1280px × en × admin role. ~16 cells.
P1.C — All client surfaces (8 routes) × 1280px × en × client role. ~8 cells.
P1.D — All talent surfaces (10 routes) × 1280px × en × talent role. ~10 cells.
P1.E — Realtime: two-browser collision test on inquiry messages + status. ~3 cells.
P1.F — Spanish locale × 5 key surfaces. ~5 cells.
P1.G — Lower-tier (free + studio) tenant smoke test. ~6 cells.

**P1 total: ~78 cells.**

#### Priority 2 — quality polish (post-launch acceptable)

P2 — Error states (network drop, RLS denial, validation), accessibility
(keyboard, screen-reader), full mobile pass of all 70+ routes, all locale
strings audit. Skip for now; track separately.

**Plan target: P0 (~36) for launch sign-off, P1 (~78) for pre-launch polish, P2 deferred.**

---

## 3. P0 walk order (binding for next session)

The walk happens in funnel order so each step generates fixture data
for the next:

| Step | Action | Actor | Surface | Engine path | Expect |
|---|---|---|---|---|---|
| 1 | Submit inquiry from public directory | guest (no auth) | E1 `/directory/cart` | `submitInquiry` (source_channel=`directory`) | Row created, `initiator_role=guest`, guest TTL set, `/inquiry-sent` redirect |
| 2 | Submit inquiry from talent page drawer | guest | E2 `/t/TAL-92001` | `submitInquiry` (source_channel=`talent_page_v2`, talent_ids prefilled) | Row created with `current_offer_id=NULL`, talent chip carried into inquiry_participants |
| 3 | Submit inquiry from workspace client `/new` | qa-client-1 | E3 | `submitInquiry` (source_channel=`directory_client`) | ✅ already verified |
| 4 | Submit inquiry from admin manual sheet | admin | E4 | `submitInquiry` (source_channel=`admin_manual`) | Row created with `initiator_role=admin`, admin can pre-set status |
| 5 | Submit inquiry from pitch landing | guest | E5 `/share/pitch/[token]` | `submitInquiry` (source_channel=`pitch_landing`) + `pitch_conversion` event | Row created, pitch token marked converted, talent_ids from pitch carried |
| 6 | Move E1 inquiry to coordination | admin | admin shell | `moveToCoordination` | Status flips, `enforce_inquiry_status_offer_pair` passes (no offer attached) |
| 7 | Assign coordinator | admin | admin shell | `assignCoordinator` | Coord assigned to coord user, notification fires with tenant_id |
| 8 | Accept coordinator assignment | coord | talent inbox or admin shell | `acceptCoordinatorAssignment` | Coord-derived role now active for this inquiry |
| 9 | Add talent to roster | coord | admin shell | `addTalentToRoster` | ✅ already verified — confirm coord can do it |
| 10 | Talent declines | another talent (TAL-92002) | talent inbox | `declineTalentInvitation` | Status updates, `inquiry_participants.status='declined'` |
| 11 | Submit talent rate | accepted talent (Sofia) | talent inbox detail | `submitTalentRate` | Rate persisted, engine emits event |
| 12 | Create offer draft | admin | admin Offer tab (currently MOCKED) | `createOffer` | ✅ already verified — confirm post-`85729cbc7` fix path |
| 13 | Update offer draft | admin | admin Offer tab | `updateOfferDraft` | Draft mutates, version increments |
| 14 | Send offer to client | admin | admin Offer tab | `sendOffer` | Status → offer_sent (or equivalent), client sees offer card |
| 15 | Client rejects → counter | client | client inquiry detail | `clientRejectOffer` + admin `counterOffer` | New offer version, prior marked superseded |
| 16 | Client accepts offer | client | client inquiry detail | `clientAcceptOffer` | Offer accepted, approvals flow opens |
| 17 | Submit + reject approvals | various | various | `submitApproval` / `rejectApproval` | Approval rows correct |
| 18 | Convert to booking | admin | admin shell | `convertToBooking` | Booking row created, inquiry archived, all participants ported |
| 19 | Hit booking detail | all roles | `/admin/bookings/[id]`, `/client/bookings`, `/talent/inbox/[bookingId]` | — | Booking renders end-to-end |
| 20 | Lifecycle: freeze + unfreeze + archive | admin | admin shell | `freezeInquiry` / `unfreezeInquiry` / `archiveInquiry` | Each transitions cleanly |
| 21 | Cross-tenant guard | admin-A | URL of inquiry from tenant-B | any engine call | 403 / 404, no data leak |
| 22 | Mobile pass | client (qa-client-1) | E1 + workspace inquiry detail @ 375px | — | Layout doesn't break, scroll works, no hidden CTAs |

**22 steps. ~36 cells of test evidence.**

---

## 4. Bugs/gaps already identified — flagged for this walk

These are pre-known issues from v1 + this audit. Each will be
re-checked during the matching walk step:

1. ❗ Admin Offer tab still reads `MOCK_OFFER_FOR_CONV` — step 12/13/14 are blocked at the UI level until wiring lands.
2. ❗ 17 engine paths share the `.eq("version", expectedVersion)` UPDATE pattern that bit `createOffer`. Apply same service-role-write + trigger-aware-status-transition fix where needed. Audit during steps 6/7/8/13/14/15/17/18/20.
3. ❗ `inquiry.last_edited_by` not updated by `acceptTalentInvitation`. Confirm fix during step 9/10.
4. ❗ `createOffer` writes still non-atomic (no SECURITY DEFINER RPC wrap). Step 13 should verify retry semantics.
5. ❓ Guest TTL cron — never observed firing (vercel-only). Step 1's guest record needs `expires_at` set.
6. ❓ Resend email delivery — RESEND_API_KEY unset in dev. Set it in QA env or mock-verify the call.
7. ❓ Realtime subscriptions on `inquiry_messages` — never tested live. Step 11 + step 15 are good moments (two browsers open).
8. ❓ `<InquiryCartForm>` layout at drawer width (~440px) on talent page — looks suspect, never inspected. Step 2.
9. ❓ Pitch landing form layout — never inspected. Step 5.
10. ❓ Admin manual sheet form layout — never inspected. Step 4.
11. ❓ Coordinator-request flow (slice F/G shipped 2026-05-13) — never browser-walked. Steps 7/8.
12. ❓ Hybrid identity resolver (slice L shipped 2026-05-13) — never walked. Confirm talent-coord can both submit a rate (talent lane) AND draft an offer (coord lane) on same inquiry.
13. ❓ Step 7 admin suggested-talent chat card — composer-side picker is TODO. Card rendering only verifiable with a manually-seeded `card_payload` row.
14. ❓ Cross-tenant guards on engine UPDATE paths — never tested. Step 21.

---

## 5. Test data fixtures (what we need seeded before the walk)

The v1 walk relied on hand-typed test data. v2 needs persistent
fixtures so re-runs are reproducible:

| Fixture | Status | Notes |
|---|---|---|
| qa-client-1 (workspace client) | ✅ exists | Used in v1 |
| qa-coord-1 (coord-able user) | ❓ verify | Slice F/G shipped coord lane — need a user that isn't admin and isn't the talent |
| qa-talent-1 = Sofia Herrera (TAL-92001) | ✅ exists | |
| qa-talent-2 (second talent for decline test) | ❓ verify | TAL-92002 if seeded |
| qa-talent-coord-1 (hybrid identity) | ❓ verify | Slice L shipped; need a user with both talent profile AND coord eligibility |
| qa-admin-tenant-b (cross-tenant test) | ❓ verify | Second tenant admin to test cross-tenant guard |
| free-tier tenant | ❓ verify | For plan-tier QA in P1.G |
| studio-tier tenant | ❓ verify | |
| network-tier tenant | ❓ verify | |
| `inquiry_messages.card_payload` row of type `admin_suggested_talent` | ❌ missing | Manual seed required for step 13 |
| Pitch token (active, with talent_ids) | ❓ verify | Step 5 requires a live pitch link |

**Action item**: build a `web/scripts/seed-qa-fixtures.ts` that
idempotently seeds the above. Until then, document fixture state
in `web/docs/qa-evidence/2026-05-14/fixtures.md`.

---

## 6. Evidence format

Every walk step writes one Markdown file at
`web/docs/qa-evidence/2026-05-14/<step-NN>-<short-name>.md` with:

```
## Step <NN> — <short name>

- **Surface**: <route>
- **Role**: <role>
- **Viewport**: <px>
- **Locale**: <en|es>
- **Tier**: <free|studio|agency|network>
- **Actor user**: <email>
- **Inquiry / fixture**: <id>

### What I did
1. ...
2. ...

### What I expected
- ...

### What actually happened
- ...

### Screenshots
- ![](./step-NN-1.png)

### Verdict
✅ pass / ❌ fail / 🟡 partial

### Filed bugs
- [BUG-XX] <link to bug entry below>
```

Bugs filed into a running list at
`web/docs/qa-evidence/2026-05-14/_bugs.md`.

---

## 7. Open decisions / asks

1. **Do we hold launch on plan-tier QA?** (P1.G — 6 cells). Per the
   pre-launch shipping rule "ship straight to prod without per-promote
   gates," I propose: walk free + studio + agency for P0, defer
   network. Leans on user.
2. **Do we set up RESEND_API_KEY in QA env?** Without it, every step
   that emits email is verified-no-op only. Real verification needs the key.
3. **Do we build the seed-qa-fixtures script before the walk, or
   hand-create as we go?** Building it costs ~1h, saves every future
   regression run. Leans toward build.
4. **Do we accept realtime as a P1 gate, not P0?** Two-browser tests
   are slow. P1 demotion means we accept "messages-might-not-instant"
   risk for launch. Leans yes.

---

## 8. Out of scope for this plan

- API surface (`/api/admin/inquiries/*`, `/api/admin/inspector/*`, cron). Covered separately.
- Public marketing routes (`/agencies`, `/pricing`, etc.) — not part of inquiry funnel.
- Auth flows (`/auth/*`, `/invite/[token]`, `/onboarding`). Separate plan.
- Billing surfaces (`/checkout/*`, Stripe Connect). Deferred per Stripe live-money testing memo.
- Builder surfaces (`/admin/site*`, `/admin/website`). Separate plan exists (`builder-human-qa-plan-2026.md`).

---

## 9. Next action (binding)

In the next session, before any code changes:

1. Verify QA fixture inventory (§5) — write `fixtures.md` describing what exists.
2. Execute P0 walk steps 1 → 22 in order.
3. File bugs as encountered into `_bugs.md`.
4. When P0 completes, decide whether to ship the P1 walk in same session or defer.

This v2 plan replaces all prior implicit QA plans. v1 report stays for historical context.
