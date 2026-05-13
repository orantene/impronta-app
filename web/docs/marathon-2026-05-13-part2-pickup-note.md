# Marathon 2026-05-13 (part 2) — what shipped, what's next

**Branch:** `phase-1`
**Net commits this leg:** ~16 commits, ranging across Phase A polish, Phase B foundation, Phase G end-to-end, dead-chrome sweep, and the commission engine wiring.

## What shipped this leg

### Phase A — Thread (core scope, finished)
- `<ReservationThread>` primitive (PR 1) + admin re-skin (PR 2, `?rt=1` flag) + talent re-skin (PR 3, same flag) + client surface rebuild (PR 4 — the business-value unlock with Approve / Decline / Counter)
- 4 react-compiler memoization errors fixed (lint → 0 errors on the canonical branch)
- C1 dead-chrome sweep: 5 disabled "Coming soon" buttons converted to toast-on-click with proper upgrade copy

### Phase B — Money (foundation only; Stripe ops pending)
- **Commission model spec** in `web/docs/commission-model-2026-05-13.md` — 3 lanes / 3 shapes / 4 config levels / 2 payment paths, 5-table schema, pure resolver design
- **5-table schema** migrated to cloud: `platform_commission_config`, `workspace_commission_overrides`, `booking_commission_snapshot`, `platform_commission_balances`, `platform_commission_movements`
- **Pure resolver** at `web/src/lib/billing/commission.ts` with 22 unit tests
- **Engine wiring** via two SECURITY DEFINER RPCs (`engine_load_commission_context`, `engine_persist_booking_commission_snapshot`) + `commission-engine.ts` bridge — `convertToBooking` now persists a snapshot post-commit, non-fatal on failure
- **Workspace actions**: `loadBookingCommissionSnapshotAction`, `markBookingPaymentMethodAction`, `requestPlatformRateOverrideAction`
- **5 ratified decisions** baked into the seed:
  1. Platform default = 5 %
  2. Flat 5 % across plans v1 (deviation from initial lean — revisit at Phase Z)
  3. Stripe Connect Standard (workspace as merchant)
  4. Refunds reverse pro-rata across all 3 lanes
  5. Per-tenant overrides — workspaces submit requests, platform admin approves

### Phase G — Discovery + Embeds (full)
- **PR 1 — SEO foundation**: `buildTalentProfileJsonLd` helper, ProfilePage + Person JSON-LD on `/t/[code]`, agency-scoped talent profiles in sitemap (both EN + ES paths, capped at 5,000 rows)
- **PR 2 — Embeddable roster widget**: pure-HTML route handlers at `/embed.js` (loader), `/embed/roster/<slug>` (iframe target with `frame-ancestors *` CSP), `/embed` (docs landing). Partner usage = 2 lines of HTML. Auto-resize via postMessage. Click-throughs open the talent's full profile via `target="_top"` + `allow-top-navigation-by-user-activation` sandbox.
- **PR 3 — Pitch plan-gate**: `canUsePitchFeature(plan)` helper + `pitchLockedReason()` + `pitchUpgradeTarget()`. Server-side gate in `authorise()`. New `plan_not_eligible` reason on `PitchErrorReason`. UI message in pitch-compose so Free workspaces see the upgrade copy instead of generic error.

## Phase status

| Phase | Status | Blocker |
|-------|--------|---------|
| A — Thread | ✅ Complete | — |
| B — Money | 🟡 Foundation done | Stripe Connect platform application (KYC, live keys) |
| C — Client Surface | ✅ Complete | — (shipped as Phase A PR 4) |
| D — Trust | ⏸ Blocked | Stripe Identity setup |
| E — The Page | ⏸ Partial | Stripe Billing for subs; talent surface polish is pure-code-doable |
| F — Hybrid + Network | ⏸ Mandatory-Opus-high | Deepest cross-cutting; needs focused session |
| G — Discovery + Embeds | ✅ Complete (3 PRs) | — |

## What's NOT shipping until you spin up Stripe

Concrete checklist before Phase B PR 3 can build (the Stripe Connect wire-up):

1. **Stripe platform application** — apply at https://dashboard.stripe.com/connect/onboarding for the Tulala platform account.
2. **Set production keys** in Vercel env vars:
   - `STRIPE_SECRET_KEY` (sk_live_...)
   - `STRIPE_PUBLISHABLE_KEY` (pk_live_...)
   - `STRIPE_WEBHOOK_SECRET` (whsec_... from the webhook endpoint)
   - `STRIPE_CONNECT_CLIENT_ID` (ca_... from Connect settings)
3. **Configure webhook endpoint** at https://app.tulala.digital/api/stripe/webhook for events:
   - `account.updated` (Connect KYC progression)
   - `payment_intent.succeeded` (charge captured)
   - `payment_intent.payment_failed` (charge failed)
   - `application_fee.created` + `application_fee.refunded` (platform fee tracking)
   - `invoice.paid` (off-platform balance settlements)
4. **KYC the platform legal entity** — your Tulala Inc. or equivalent.
5. **Stripe Tax integration** — opt-in via Stripe dashboard.

Until those land, the commission code is dormant: snapshots get created with `payment_method='card'` defaults but no real money moves.

## Recommended next-marathon order

1. **Phase E partial — talent page polish** (no Stripe required for the editor surface itself; only the billing flow needs Stripe Billing). Per `project_talent_surface_launch.md` an 8-phase plan exists.
2. **Phase F — Hybrid mode** if you can dedicate a focused session with Opus high. This is the deepest cross-cutting change; doing it half-attentively is the wrong shape of risk.
3. **A1 from the prior plan** — route admin Create Inquiry through the engine (currently does direct DB insert, bypassing audit + event emission). Medium scope, well-defined.
4. **A9 — Notifications drawer real data** — replace `MOCK_CONVERSATIONS` / `RICH_INQUIRIES`-driven items with a query against `public.notifications`.
5. **B10 — Realtime on inquiry status + lineup** — Supabase realtime channels on `inquiries` + `inquiry_participants` so the open thread updates without manual refresh.

## Cross-references

- `web/docs/commission-model-2026-05-13.md` — Pillar 2 binding spec
- `web/docs/messages-consolidation-audit-2026-05-13.md` — Phase A audit (lost in earlier branch-switch — TLDR survives in memory)
- `web/docs/inquiry-booking-improvement-plan-2026-05-12.md` — A/B/C series of fixes
- `~/.claude/projects/.../memory/project_tulala_2026_execution_plan.md` — top-level plan (long-form companion lost, TLDR survives)
- `~/.claude/projects/.../memory/project_commission_model.md` — commission TLDR + decisions

## How to QA what shipped

1. `cd web && rm -rf .next && npm run dev` if Turbopack cache misbehaves (it did earlier this session).
2. Sign in as `qa-admin@impronta.test` / `Impronta-QA-Admin-2026!`.
3. Try `?rt=1` on `/impronta/admin/messages` → admin inquiry detail renders through `<ReservationThread>` with 5 pills + sheets.
4. Sign in as `qa-client-1@impronta.test` → open an inquiry → see Lineup / Offer / Event / Files pills + Approve/Decline/Counter action row when an offer is sent.
5. View `/sitemap.xml` on an agency host → should include `/t/<code>` entries.
6. View `/embed` for the embed docs landing; `/embed/roster/impronta` for the iframe content.
7. As a Free workspace, try to create a pitch → see the upgrade message.

---

That's the marathon's deliverable trail. Next session picks up cleanly from any of the recommended paths above.
