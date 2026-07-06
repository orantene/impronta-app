# Handoff: Talent subscription checkout (Pro / Max billing)

> **First read `web/docs/handoffs/README.md` and the BINDING spec in memory `project_talent_subscriptions.md`** (Basic free / **Pro ~$12** / **Portfolio(Max) ~$29**; custom domain = Portfolio only). Also memory `project_payments_platform_decision.md`, `project_live_payments_golive.md`, `project_commission_model.md`.

## ⚠ Owner-decision gate — do NOT start without a green light
As of 2026-07-06 the recommendation is **keep the waitlist for launch, not to wire this now**: live talent billing is a genuine feature + money-code build (not a finish fix), and there is no talent-billing revenue to capture pre-launch. PR #712 already softened the talent tier CTAs to an honest "waitlist / notify me" affordance and removed the fake per-month pricing. **Only execute this brief if the owner explicitly decides to enable live talent billing.** If they haven't, stop and confirm.

## Goal (if greenlit)
Replace the talent-tier waitlist with a real, working subscription checkout so a talent can purchase **Pro** and **Portfolio/Max**, with the plan tier actually enforced (feature gating + custom-domain-on-Portfolio), billing lifecycle handled, and honest UI.

## Current state
- Talent tiers are surfaced across the talent dashboard, but the only functional "Switch to {tier}" action is gated `process.env.NODE_ENV !== "production"` (dev-only) in `web/src/components/admin/shell/internal/talent-drawers/premium-pages.tsx` (`TalentTierCompareDrawer`). Live users see the waitlist card.
- Entry points to audit/replace: `TalentPlanCard.tsx` ("Compare plans"/"Keep Pro"/"Start trial"), the profile tier band, `premium-pages.tsx`, and the free-tier "Pro & Max coming soon" card in `internal/talent/shared/profile-sections-2.tsx`.

## The build (discover-then-mirror, don't invent)
1. **Find the existing subscription-billing architecture and MIRROR it.** Agencies already have plan tiers + (likely) Stripe subscription billing. Grep for the agency plan/subscription/Stripe-checkout-session code (search `checkout.sessions.create`, `subscription`, `plan_tier`, `stripe` under `web/src/lib/payments` + `web/src/lib/billing` + platform-admin settings). Reuse that pattern for talent rather than a parallel implementation. Confirm whether talent billing is a **platform subscription** (charged on the platform account — most likely) vs a Connect flow; the binding spec + existing agency billing dictate this.
2. **Checkout:** wire the "Switch to {tier}" action to create a real Stripe Checkout Session (or Payment Element) for the chosen tier's price, remove the `NODE_ENV` dev-gate, and handle success/cancel returns (note `/checkout/success` + `/checkout/cancel` are now allow-listed — see #712's `surface-allow-list.ts`).
3. **Webhook + lifecycle:** handle subscription created/updated/canceled/past-due in the Stripe webhook (`web/src/lib/stripe/webhook-handler.ts` + `webhook-routing.ts`) so the talent's `plan_tier` reflects billing state; handle downgrade/cancel and trial if the spec calls for one.
4. **Enforcement:** the talent's stored `plan_tier` must actually gate features (custom domain = Portfolio only per spec; Pro/Max feature differences). Verify the gates read the real plan, not a hardcoded value.
5. **UI honesty:** real prices from a single source of truth (no hardcoded/fake pricing), clear current-plan state, load/error/pending states visible (owner rule: async state always visible). Talent-facing language only — **never "buyer"/"cart"**, no "pay to DM"; keep it "client"/"lineup".

## Testing
Use **Stripe test mode** end-to-end: subscribe as a talent (dev-signin as a `@talent`-role `@impronta.test` fixture, creds in memory `reference_qa_credentials.md`), confirm the subscription is created, `plan_tier` updates via webhook, a gated feature (custom domain) unlocks on Portfolio, and cancel/downgrade flows work. Do NOT move real money. If you need a webhook secret / product+price IDs that aren't in the repo, stop and get them from the owner (never fabricate Stripe IDs).

## Gates + done
- tsc + lint clean (README commands); any new migration → `db:push` before merge.
- No fake pricing, no dead CTA, no dev-only gate on the live path.
- PR to `main` (owner merges). Update memory `project_talent_subscriptions.md` with the shipped state.
