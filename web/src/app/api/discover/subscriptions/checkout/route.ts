// Phase D §3 — client Pro subscription checkout.
//
// POST /api/discover/subscriptions/checkout
//   body: { tenantSlug: string }   (used to build the return URLs)
//   → 200 { url }                  Stripe Checkout (subscription mode)
//   → 401 unauthenticated
//   → 400 tenant_slug_required
//   → 503 not configured (Stripe key OR STRIPE_CLIENT_PRO_PRICE_ID unset)
//
// The price is read from STRIPE_CLIENT_PRO_PRICE_ID inside
// createClientProCheckoutSession — never hardcoded. On success the webhook
// (api/discover/subscriptions/webhook) upserts client_subscriptions to 'pro'.

import { NextResponse } from "next/server";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClientProCheckoutSession } from "@/lib/stripe/client-billing";
import { deriveAppBaseUrl } from "@/lib/stripe/utils";

export const dynamic = "force-dynamic";

type Body = { tenantSlug?: string };

export async function POST(req: Request) {
  const session = await getCachedActorSession();
  if (!session.user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: Body | null = null;
  try { body = await req.json() as Body; } catch { /* */ }
  const tenantSlug = body?.tenantSlug?.trim();
  if (!tenantSlug) {
    return NextResponse.json({ error: "tenant_slug_required" }, { status: 400 });
  }

  // Resolve a nicer customer display name from the client profile; fall back to
  // the auth email. Email is required for the Stripe customer.
  const email = session.user.email ?? "";
  let displayName = email || "Tulala client";
  const admin = createServiceRoleClient();
  if (admin) {
    const { data: profile } = await admin
      .from("client_profiles")
      .select("display_name")
      .eq("user_id", session.user.id)
      .maybeSingle();
    const name = (profile as { display_name?: string | null } | null)?.display_name;
    if (name) displayName = name;
  }

  const appBaseUrl = await deriveAppBaseUrl();

  const result = await createClientProCheckoutSession({
    userId: session.user.id,
    email,
    displayName,
    tenantSlug,
    appBaseUrl,
  });

  if (!result.ok) {
    // "not configured" is an ops/setup error, not a client error → 503.
    const isConfig = /not configured/i.test(result.error);
    return NextResponse.json(
      { error: isConfig ? "not_configured" : "checkout_failed", message: result.error },
      { status: isConfig ? 503 : 502 },
    );
  }

  return NextResponse.json({ url: result.data.url });
}
