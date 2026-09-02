/**
 * lib/client-billing/pricing-flag.ts
 *
 * ONE boolean gating every client-facing surface that sells the client
 * subscription tiers (Standard / Pro / Enterprise).
 *
 * Client Pro pricing is still PLACEHOLDER — the tier-comparison page
 * (/client/subscription) says so in its own header ("Pricing TBD before
 * D6 — market research needed"), and no Stripe subscription checkout is
 * wired for it yet. Until real prices land we do not advertise the plan:
 * the always-visible "Plan" row in the client rail footer is hidden, and
 * the /client/subscription route redirects to the client home instead of
 * rendering placeholder prices.
 *
 * This is deliberately a plain module constant (no env var, no server-only
 * import) so both the server route and the "use client" rail can read it.
 * When real client pricing ships, flip this to `true` in one place.
 */
export const CLIENT_PRO_PRICING_LIVE = false;
