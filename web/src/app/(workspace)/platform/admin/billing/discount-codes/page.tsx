// Phase 8.x — Platform HQ · Discount codes
// Lets the founder mint Stripe Coupons + Promotion Codes. Supports the
// 100% off "FRIENDS_FREE"-style codes used for internal QA, friends and
// family deals, and time-limited launch promos.
//
// Stripe is the source of truth — no app-side schema. Codes appear in
// the Stripe Dashboard alongside any codes created there directly.
//
// All checkout flows already set `allow_promotion_codes: true` so codes
// minted here are usable as-is in workspace + talent + client checkouts.

import { redirect, notFound } from "next/navigation";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { getPlatformRole } from "@/lib/access/platform-role";
import { isStripeConfigured } from "@/lib/stripe/client";
import {
  listPlatformDiscountCodes,
  type DiscountCodeSummary,
} from "./actions";
import { DiscountCodeShell } from "./DiscountCodeShell";

export const dynamic = "force-dynamic";

const HQ = {
  bg:         "#0F0F11",
  card:       "#16161A",
  cardSoft:   "rgba(255,255,255,0.04)",
  border:     "rgba(255,255,255,0.10)",
  borderSoft: "rgba(255,255,255,0.06)",
  ink:        "#F5F2EB",
  inkMuted:   "rgba(245,242,235,0.62)",
  inkDim:     "rgba(245,242,235,0.38)",
  green:      "#5DD3A0",
  amber:      "#F0B461",
} as const;

const F  = '"Inter", system-ui, sans-serif';
const FD = 'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif';

export default async function PlatformDiscountCodesPage() {
  const session = await getCachedActorSession();
  if (!session.user) redirect("/login?next=/platform/admin/billing/discount-codes");

  const role = getPlatformRole(session.profile);
  if (role !== "super_admin") notFound();

  const stripeReady = isStripeConfigured();

  let codes: DiscountCodeSummary[] = [];
  let listError: string | null = null;
  if (stripeReady) {
    const list = await listPlatformDiscountCodes();
    if (list.ok) codes = list.data;
    else listError = list.error;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, fontFamily: F, color: HQ.ink }}>
      {/* Header */}
      <div>
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: 0.7,
            textTransform: "uppercase",
            color: HQ.green,
            marginBottom: 6,
          }}
        >
          Tulala HQ · Billing
        </div>
        <h1
          style={{
            fontFamily: FD,
            fontSize: 28,
            fontWeight: 600,
            margin: 0,
            letterSpacing: -0.5,
            lineHeight: 1.1,
          }}
        >
          Discount codes
        </h1>
        <p
          style={{
            margin: "8px 0 0",
            fontSize: 13,
            color: HQ.inkMuted,
            maxWidth: 720,
            lineHeight: 1.5,
          }}
        >
          Mint Stripe coupons + promotion codes. 100% off codes are useful for
          internal QA, friends &amp; family deals, and comped tenants. The codes
          live in Stripe — Stripe is the source of truth — and are usable in
          every workspace, talent, and client checkout flow because each session
          already accepts promotion codes.
        </p>
      </div>

      {!stripeReady && (
        <div
          style={{
            background: "rgba(240,180,97,0.06)",
            border: `1px solid rgba(240,180,97,0.18)`,
            borderRadius: 12,
            padding: 14,
            color: HQ.amber,
            fontSize: 13,
          }}
        >
          Stripe is not configured. Set <code>STRIPE_SECRET_KEY</code> in the
          Vercel project to mint codes.
        </div>
      )}

      {stripeReady && listError && (
        <div
          style={{
            background: "rgba(243,103,114,0.06)",
            border: `1px solid rgba(243,103,114,0.18)`,
            borderRadius: 12,
            padding: 14,
            color: "#F36772",
            fontSize: 13,
          }}
        >
          Failed to load codes: {listError}
        </div>
      )}

      <DiscountCodeShell initialCodes={codes} stripeReady={stripeReady} />
    </div>
  );
}
