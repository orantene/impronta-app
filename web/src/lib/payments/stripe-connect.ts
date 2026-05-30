/**
 * Stripe Connect (Express) — per-agency payout account management.
 *
 * Companion to `stripe-checkout.ts`. The base checkout flow runs as
 * single-account; Connect lets each agency receive its own funds.
 *
 * Lifecycle:
 *   1. createOrGetConnectedAccount(tenantSlug)
 *      → ensures the agency row has a stripe_account_id; creates one if not.
 *   2. createOnboardingLink(tenantSlug, returnUrl, refreshUrl)
 *      → generates a one-shot Stripe-hosted URL for KYC + bank capture.
 *      → user opens this URL, completes onboarding, returns to `returnUrl`.
 *   3. refreshAccountStatus(tenantSlug)
 *      → fetches the latest from Stripe and writes mirror columns.
 *      → called from the return URL, the `account.updated` webhook, and on
 *        demand from the agency settings page.
 *
 * Charging model (used by `stripe-checkout.ts`):
 *   Direct Charges with `application_fee_amount`. The connected account
 *   bears chargebacks; the platform receives an application fee. Today the
 *   fee defaults to 0 — `getApplicationFeeForAgency` is the single point of
 *   change when the platform monetizes.
 */

import Stripe from "stripe";
import { getStripe } from "./stripe-checkout";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

export type ConnectAccountStatus =
  | "none"
  | "pending"
  | "enabled"
  | "restricted"
  | "disabled";

export type ConnectedAccountSnapshot = {
  stripeAccountId: string | null;
  status: ConnectAccountStatus;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  syncedAt: string | null;
};

export type ConnectResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Resolve an agency by slug to its row id, name, and current Stripe binding.
 * Returns null when the slug doesn't match an agency. Uses the service-role
 * client because Stripe-related reads bypass RLS (server-trusted).
 */
async function loadAgencyConnectFields(tenantSlug: string): Promise<{
  agencyId: string;
  agencyName: string;
  preferredCurrency: string | null;
  stripeAccountId: string | null;
  status: ConnectAccountStatus;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  syncedAt: string | null;
} | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;

  const { data, error } = await admin
    .from("agencies")
    .select(
      "id, display_name, preferred_currency, stripe_account_id, stripe_account_status, stripe_charges_enabled, stripe_payouts_enabled, stripe_details_submitted, stripe_account_synced_at",
    )
    .eq("slug", tenantSlug)
    .maybeSingle();

  if (error || !data) return null;

  return {
    agencyId: data.id as string,
    agencyName: (data.display_name as string) ?? "Workspace",
    preferredCurrency: (data.preferred_currency as string | null) ?? null,
    stripeAccountId: (data.stripe_account_id as string | null) ?? null,
    status: ((data.stripe_account_status as string) ?? "none") as ConnectAccountStatus,
    chargesEnabled: !!data.stripe_charges_enabled,
    payoutsEnabled: !!data.stripe_payouts_enabled,
    detailsSubmitted: !!data.stripe_details_submitted,
    syncedAt: (data.stripe_account_synced_at as string | null) ?? null,
  };
}

/**
 * Map Stripe's account capability flags to our internal status enum.
 *
 * Logic:
 *   - charges + payouts both enabled → "enabled"
 *   - details submitted but at least one capability missing → "restricted"
 *     (Stripe is reviewing or has paused something)
 *   - details not submitted → "pending" (still onboarding)
 *   - account exists but no details ever submitted → "pending"
 */
function deriveStatus(account: Stripe.Account): ConnectAccountStatus {
  const ds = !!account.details_submitted;
  const ce = !!account.charges_enabled;
  const pe = !!account.payouts_enabled;
  if (ce && pe && ds) return "enabled";
  if (ds && (!ce || !pe)) return "restricted";
  return "pending";
}

/**
 * Read the current persisted snapshot without touching Stripe. Used by the
 * agency settings page so we don't burn an API call on every render.
 */
export async function getConnectedAccountSnapshot(
  tenantSlug: string,
): Promise<ConnectResult<ConnectedAccountSnapshot>> {
  const agency = await loadAgencyConnectFields(tenantSlug);
  if (!agency) return { ok: false, error: "Workspace not found." };

  return {
    ok: true,
    data: {
      stripeAccountId: agency.stripeAccountId,
      status: agency.status,
      chargesEnabled: agency.chargesEnabled,
      payoutsEnabled: agency.payoutsEnabled,
      detailsSubmitted: agency.detailsSubmitted,
      syncedAt: agency.syncedAt,
    },
  };
}

/**
 * Same as `getConnectedAccountSnapshot` but keyed by agency id. Used from
 * checkout paths where the tenant id (= agency id) is already in hand and
 * looking up the slug would be a wasted round-trip.
 */
export async function getConnectedAccountSnapshotById(
  agencyId: string,
): Promise<ConnectResult<ConnectedAccountSnapshot>> {
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Database unavailable." };

  const { data, error } = await admin
    .from("agencies")
    .select(
      "stripe_account_id, stripe_account_status, stripe_charges_enabled, stripe_payouts_enabled, stripe_details_submitted, stripe_account_synced_at",
    )
    .eq("id", agencyId)
    .maybeSingle();

  if (error || !data) return { ok: false, error: "Workspace not found." };

  return {
    ok: true,
    data: {
      stripeAccountId: (data.stripe_account_id as string | null) ?? null,
      status: ((data.stripe_account_status as string) ?? "none") as ConnectAccountStatus,
      chargesEnabled: !!data.stripe_charges_enabled,
      payoutsEnabled: !!data.stripe_payouts_enabled,
      detailsSubmitted: !!data.stripe_details_submitted,
      syncedAt: (data.stripe_account_synced_at as string | null) ?? null,
    },
  };
}

/**
 * Create a new Stripe Express account for the agency, or return the existing
 * one. Idempotent — safe to call multiple times.
 *
 * Stripe requires a country code at create-time. We pass "US" as the default
 * because the platform's Stripe account is US; agencies based elsewhere will
 * be guided through Stripe's localization during onboarding. A future
 * enhancement: capture the agency's country up-front and pass it here.
 */
export async function createOrGetConnectedAccount(
  tenantSlug: string,
): Promise<ConnectResult<{ stripeAccountId: string }>> {
  const stripe = getStripe();
  if (!stripe) return { ok: false, error: "Stripe is not configured." };

  const agency = await loadAgencyConnectFields(tenantSlug);
  if (!agency) return { ok: false, error: "Workspace not found." };

  if (agency.stripeAccountId) {
    return { ok: true, data: { stripeAccountId: agency.stripeAccountId } };
  }

  try {
    const account = await stripe.accounts.create({
      type: "express",
      country: "US",
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      business_profile: {
        name: agency.agencyName,
      },
      metadata: {
        agency_id: agency.agencyId,
        tenant_slug: tenantSlug,
      },
    });

    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Database unavailable." };

    const { error } = await admin
      .from("agencies")
      .update({
        stripe_account_id: account.id,
        stripe_account_status: deriveStatus(account),
        stripe_charges_enabled: !!account.charges_enabled,
        stripe_payouts_enabled: !!account.payouts_enabled,
        stripe_details_submitted: !!account.details_submitted,
        stripe_account_synced_at: new Date().toISOString(),
      })
      .eq("id", agency.agencyId);

    if (error) {
      // Compensating cleanup: we have a Stripe account but failed to persist
      // it. Better to delete it than leak — Stripe Express accounts can be
      // deleted while in pending state.
      try {
        await stripe.accounts.del(account.id);
      } catch (delErr) {
        logServerError("payments.stripe-connect.create/compensate", delErr);
      }
      logServerError("payments.stripe-connect.create/persist", error);
      return { ok: false, error: "Could not save the connected account." };
    }

    return { ok: true, data: { stripeAccountId: account.id } };
  } catch (err) {
    logServerError("payments.stripe-connect.create", err);
    return { ok: false, error: "Could not create Stripe account." };
  }
}

/**
 * Generate a fresh Stripe-hosted onboarding URL. These links are one-shot —
 * each call creates a new link valid for a few minutes. Always generate on
 * demand; never cache.
 *
 *   returnUrl   — where Stripe redirects after onboarding completes.
 *   refreshUrl  — where Stripe redirects if the link expires before the
 *                 user finishes (should be a page that re-creates a fresh
 *                 onboarding link, e.g. /admin/payouts).
 */
export async function createOnboardingLink(
  tenantSlug: string,
  returnUrl: string,
  refreshUrl: string,
): Promise<ConnectResult<{ url: string }>> {
  const stripe = getStripe();
  if (!stripe) return { ok: false, error: "Stripe is not configured." };

  const ensure = await createOrGetConnectedAccount(tenantSlug);
  if (!ensure.ok) return ensure;

  try {
    const link = await stripe.accountLinks.create({
      account: ensure.data.stripeAccountId,
      type: "account_onboarding",
      return_url: returnUrl,
      refresh_url: refreshUrl,
    });
    return { ok: true, data: { url: link.url } };
  } catch (err) {
    logServerError("payments.stripe-connect.onboardingLink", err);
    return { ok: false, error: "Could not generate onboarding link." };
  }
}

/**
 * Generate a fresh Stripe Express dashboard login link. Use this from the
 * agency settings UI to "Manage account" — sends the user to their hosted
 * Express dashboard to update bank details, view payouts, etc.
 */
export async function createDashboardLink(
  tenantSlug: string,
): Promise<ConnectResult<{ url: string }>> {
  const stripe = getStripe();
  if (!stripe) return { ok: false, error: "Stripe is not configured." };

  const agency = await loadAgencyConnectFields(tenantSlug);
  if (!agency) return { ok: false, error: "Workspace not found." };
  if (!agency.stripeAccountId) {
    return { ok: false, error: "Workspace hasn't connected Stripe yet." };
  }

  try {
    const link = await stripe.accounts.createLoginLink(agency.stripeAccountId);
    return { ok: true, data: { url: link.url } };
  } catch (err) {
    logServerError("payments.stripe-connect.dashboardLink", err);
    return { ok: false, error: "Could not generate dashboard link." };
  }
}

/**
 * Pull the current status from Stripe and write mirror columns. Called:
 *   - from the onboarding return route after the user completes
 *   - from the `account.updated` webhook
 *   - on demand from the agency settings page
 *
 * Idempotent and safe to call frequently. If Stripe is unreachable, leaves
 * the persisted snapshot alone and returns the error.
 */
export async function refreshAccountStatus(
  tenantSlug: string,
): Promise<ConnectResult<ConnectedAccountSnapshot>> {
  const stripe = getStripe();
  if (!stripe) return { ok: false, error: "Stripe is not configured." };

  const agency = await loadAgencyConnectFields(tenantSlug);
  if (!agency) return { ok: false, error: "Workspace not found." };
  if (!agency.stripeAccountId) {
    return {
      ok: true,
      data: {
        stripeAccountId: null,
        status: "none",
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
        syncedAt: agency.syncedAt,
      },
    };
  }

  try {
    const account = await stripe.accounts.retrieve(agency.stripeAccountId);
    return persistAccountSnapshot(agency.agencyId, account);
  } catch (err) {
    logServerError("payments.stripe-connect.refresh", err);
    return { ok: false, error: "Could not refresh status from Stripe." };
  }
}

/**
 * Persist a Stripe account snapshot to the agencies row. Shared between
 * `refreshAccountStatus` (pull-side) and the webhook handler (push-side
 * via `account.updated` events).
 */
export async function persistAccountSnapshot(
  agencyId: string,
  account: Stripe.Account,
): Promise<ConnectResult<ConnectedAccountSnapshot>> {
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Database unavailable." };

  const status = deriveStatus(account);
  const chargesEnabled = !!account.charges_enabled;
  const payoutsEnabled = !!account.payouts_enabled;
  const detailsSubmitted = !!account.details_submitted;
  const syncedAt = new Date().toISOString();

  const { error } = await admin
    .from("agencies")
    .update({
      stripe_account_status: status,
      stripe_charges_enabled: chargesEnabled,
      stripe_payouts_enabled: payoutsEnabled,
      stripe_details_submitted: detailsSubmitted,
      stripe_account_synced_at: syncedAt,
    })
    .eq("id", agencyId);

  if (error) {
    logServerError("payments.stripe-connect.persist", error);
    return { ok: false, error: "Could not save status." };
  }

  return {
    ok: true,
    data: {
      stripeAccountId: account.id,
      status,
      chargesEnabled,
      payoutsEnabled,
      detailsSubmitted,
      syncedAt,
    },
  };
}

/**
 * Resolve `event.account` from a Connect webhook to the matching agency row.
 * Returns null when no agency owns that Stripe account id (event for an
 * unknown account — should be ignored, not 4xx'd).
 */
export async function findAgencyByStripeAccountId(
  stripeAccountId: string,
): Promise<{ agencyId: string; tenantSlug: string } | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;

  const { data, error } = await admin
    .from("agencies")
    .select("id, slug")
    .eq("stripe_account_id", stripeAccountId)
    .maybeSingle();

  if (error || !data) return null;
  return { agencyId: data.id as string, tenantSlug: data.slug as string };
}

/**
 * Disconnect: clear the binding on our side. We do NOT delete the Stripe
 * account — the agency may still have funds on it, pending payouts, or
 * historical reporting needs. The user must manage / delete the account
 * from the Stripe dashboard if they want it gone for real.
 *
 * After disconnect, future checkouts route to the platform account again
 * (single-account fallback) until the agency reconnects.
 */
export async function disconnectAccount(
  tenantSlug: string,
): Promise<ConnectResult<true>> {
  const agency = await loadAgencyConnectFields(tenantSlug);
  if (!agency) return { ok: false, error: "Workspace not found." };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Database unavailable." };

  const { error } = await admin
    .from("agencies")
    .update({
      stripe_account_id: null,
      stripe_account_status: "none",
      stripe_charges_enabled: false,
      stripe_payouts_enabled: false,
      stripe_details_submitted: false,
      stripe_account_synced_at: new Date().toISOString(),
    })
    .eq("id", agency.agencyId);

  if (error) {
    logServerError("payments.stripe-connect.disconnect", error);
    return { ok: false, error: "Could not disconnect." };
  }

  return { ok: true, data: true };
}

/**
 * Compute the platform application fee in cents for a charge of `amountCents`
 * routed to a given agency. Synchronous, kept for legacy callers — always
 * returns 0. Prefer the async `getApplicationFeeForBooking` below, which
 * reads the persisted commission snapshot per-booking.
 *
 * @deprecated Use `getApplicationFeeForBooking(bookingId)` — it reads
 * from `booking_commission_snapshot` (per Phase B PR 1/2 spec) so the
 * fee tracks the actual ratified commission rate, not a flat 0.
 */
export function getApplicationFeeForAgency(
  _tenantSlug: string,
  _amountCents: number,
): number {
  return 0;
}

/**
 * Phase B PR 3 — pulls the platform_fee_cents from the booking's
 * commission snapshots (persisted by `convertToBooking` via the engine
 * RPC, see `lib/billing/commission-engine.ts`).
 *
 * Since the per-participant grain shipped (ADR 2026-05-22), one booking
 * has N snapshot rows — one per active talent participant. The Stripe
 * application fee is the SUM of every row's platform_fee_cents, since
 * a single PaymentIntent settles the whole booking and the platform's
 * total take is the union of every participant's take.
 *
 * Returns 0 when:
 *   - The booking has no snapshots (rare — the snapshot persist is
 *     best-effort post-commit, but if it failed the booking still
 *     exists). Logged so we notice.
 *   - The supabase client is unavailable (dev / misconfigured env).
 *
 * The math itself is enforced at the DB layer (`CHECK lanes_sum_to_gross`
 * applies per row) so each row's split is consistent.
 */
export async function getApplicationFeeForBooking(
  bookingId: string,
): Promise<number> {
  if (!bookingId) return 0;
  // Lazy import — keeps the lib graph clean (commission-engine pulls in
  // its own server-only deps).
  const { sumBookingPlatformFeeCents } = await import(
    "@/lib/billing/commission-engine"
  );
  const { createClient: createSupabaseServerClient } = await import(
    "@/lib/supabase/server"
  );
  const supabase = await createSupabaseServerClient();
  if (!supabase) return 0;
  return sumBookingPlatformFeeCents(supabase, bookingId);
}

/**
 * Convenience: is the agency in a state where checkout should route to its
 * connected account? Both `enabled` and a positive charges flag are required.
 * `restricted` accounts can sometimes still charge, but to be safe we treat
 * anything other than `enabled` as "fall back to platform".
 */
export function canRouteCheckoutsToAgency(
  snapshot: Pick<ConnectedAccountSnapshot, "status" | "chargesEnabled" | "stripeAccountId">,
): snapshot is ConnectedAccountSnapshot & { stripeAccountId: string } {
  return (
    snapshot.status === "enabled"
    && snapshot.chargesEnabled
    && !!snapshot.stripeAccountId
  );
}
