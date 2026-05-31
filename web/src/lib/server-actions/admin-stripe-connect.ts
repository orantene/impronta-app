"use server";

/**
 * Admin-side server-action wrappers for Stripe Connect (Express) per-tenant
 * payouts. Each action:
 *   1. Authenticates via `requireStaffTenantAction` (staff-only).
 *   2. Verifies `tenantSlug` matches the caller's active tenant scope —
 *      prevents a staff member of one workspace from manipulating another's
 *      Stripe binding by URL-tampering.
 *   3. Delegates to the typed helpers in `lib/payments/stripe-connect.ts`
 *      (which use the service-role client and bypass RLS — that's why the
 *      slug-vs-tenant check above is non-negotiable).
 *
 * The corresponding canonical page is at
 * `(workspace)/[tenantSlug]/admin/payouts/page.tsx`.
 */

import { revalidatePath } from "next/cache";
import { requireStaffTenantAction } from "@/lib/saas/admin-scope";
import { logServerError } from "@/lib/server/safe-error";
import { getStripe } from "@/lib/stripe/client";
import {
  createOrGetConnectedAccount,
  createOnboardingLink,
  createDashboardLink,
  refreshAccountStatus,
  disconnectAccount,
  getConnectedAccountSnapshot,
  type ConnectedAccountSnapshot,
} from "@/lib/payments/stripe-connect";

export type ConnectActionResult<T = void> =
  | (T extends void ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string };

/**
 * Verify the caller is staff of the workspace identified by `tenantSlug`.
 * Returns the resolved tenantId on success, error on mismatch.
 */
async function authorizeForSlug(
  tenantSlug: string,
): Promise<{ ok: true; tenantId: string } | { ok: false; error: string }> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };

  const { data: agency, error } = await auth.supabase
    .from("agencies")
    .select("id")
    .eq("slug", tenantSlug)
    .maybeSingle();
  if (error || !agency) return { ok: false, error: "Workspace not found." };
  if ((agency.id as string) !== auth.tenantId) {
    return { ok: false, error: "Workspace mismatch." };
  }
  return { ok: true, tenantId: auth.tenantId };
}

/**
 * Idempotent: ensures the agency has a Stripe Express account, creating one
 * if needed. Returns the `acct_*` id. Does NOT redirect to onboarding —
 * call `getConnectOnboardingLinkAction` for that.
 */
export async function ensureConnectedAccountAction(
  tenantSlug: string,
): Promise<ConnectActionResult<{ stripeAccountId: string }>> {
  try {
    const guard = await authorizeForSlug(tenantSlug);
    if (!guard.ok) return guard;

    const result = await createOrGetConnectedAccount(tenantSlug);
    if (!result.ok) return result;
    revalidatePath(`/${tenantSlug}/admin/payouts`);
    return { ok: true, data: result.data };
  } catch (err) {
    logServerError("admin-stripe-connect.ensureConnectedAccountAction", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/**
 * Generate a fresh Stripe-hosted onboarding URL. The link is one-shot and
 * short-lived; always create a new one on demand. Returns the URL the
 * client should redirect to (server-action callers typically do
 * `window.location.assign(result.data.url)` on success).
 */
export async function getConnectOnboardingLinkAction(
  tenantSlug: string,
): Promise<ConnectActionResult<{ url: string }>> {
  try {
    const guard = await authorizeForSlug(tenantSlug);
    if (!guard.ok) return guard;

    // Build absolute return + refresh URLs from the request host.
    const { headers } = await import("next/headers");
    const hdrs = await headers();
    const host = hdrs.get("host") ?? "localhost";
    const proto = hdrs.get("x-forwarded-proto") ?? "https";
    const origin = process.env.NEXT_PUBLIC_BASE_URL ?? `${proto}://${host}`;
    const returnUrl = `${origin}/${tenantSlug}/admin/payouts/return`;
    const refreshUrl = `${origin}/${tenantSlug}/admin/payouts`;

    const result = await createOnboardingLink(tenantSlug, returnUrl, refreshUrl);
    if (!result.ok) return result;
    return { ok: true, data: result.data };
  } catch (err) {
    logServerError("admin-stripe-connect.getConnectOnboardingLinkAction", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/**
 * Mint a Stripe **Account Session** client secret for the workspace's
 * Connect Express account, scoped to the embedded `account_onboarding`
 * component. Lazily ensures the Express account exists. Powers the in-app,
 * Tulala-branded EMBEDDED onboarding — the workspace admin never leaves for
 * stripe.com (mirrors the talent embedded flow). `external_account_collection`
 * lets them attach their bank inside the embedded flow.
 */
export async function getConnectAccountSessionAction(
  tenantSlug: string,
): Promise<ConnectActionResult<{ clientSecret: string }>> {
  try {
    const guard = await authorizeForSlug(tenantSlug);
    if (!guard.ok) return guard;

    const stripe = getStripe();
    if (!stripe) return { ok: false, error: "Payouts are not available right now." };

    const ensure = await createOrGetConnectedAccount(tenantSlug);
    if (!ensure.ok) return ensure;

    const session = await stripe.accountSessions.create({
      account: ensure.data.stripeAccountId,
      components: {
        account_onboarding: {
          enabled: true,
          features: { external_account_collection: true },
        },
      },
    });
    revalidatePath(`/${tenantSlug}/admin/payouts`);
    return { ok: true, data: { clientSecret: session.client_secret } };
  } catch (err) {
    logServerError("admin-stripe-connect.getConnectAccountSessionAction", err);
    return { ok: false, error: "Could not start payout setup. Please try again." };
  }
}

/**
 * Generate an Express dashboard login link. Sends the user to their hosted
 * Stripe Express dashboard to manage bank account, view payouts, etc.
 */
export async function getConnectDashboardLinkAction(
  tenantSlug: string,
): Promise<ConnectActionResult<{ url: string }>> {
  try {
    const guard = await authorizeForSlug(tenantSlug);
    if (!guard.ok) return guard;

    const result = await createDashboardLink(tenantSlug);
    if (!result.ok) return result;
    return { ok: true, data: result.data };
  } catch (err) {
    logServerError("admin-stripe-connect.getConnectDashboardLinkAction", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/**
 * Pull the latest from Stripe and write mirror columns. Use after the user
 * returns from onboarding, or on demand to debug a status mismatch.
 */
export async function refreshConnectStatusAction(
  tenantSlug: string,
): Promise<ConnectActionResult<ConnectedAccountSnapshot>> {
  try {
    const guard = await authorizeForSlug(tenantSlug);
    if (!guard.ok) return guard;

    const result = await refreshAccountStatus(tenantSlug);
    if (!result.ok) return result;
    revalidatePath(`/${tenantSlug}/admin/payouts`);
    return { ok: true, data: result.data };
  } catch (err) {
    logServerError("admin-stripe-connect.refreshConnectStatusAction", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/**
 * Read the persisted snapshot — does NOT call Stripe. Use from page reads
 * where stale-by-a-few-minutes is acceptable.
 */
export async function getConnectSnapshotAction(
  tenantSlug: string,
): Promise<ConnectActionResult<ConnectedAccountSnapshot>> {
  try {
    const guard = await authorizeForSlug(tenantSlug);
    if (!guard.ok) return guard;

    const result = await getConnectedAccountSnapshot(tenantSlug);
    if (!result.ok) return result;
    return { ok: true, data: result.data };
  } catch (err) {
    logServerError("admin-stripe-connect.getConnectSnapshotAction", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/**
 * Disconnect — clears the binding on our side. Stripe account is NOT
 * deleted (there may be funds, payouts, history). Future checkouts route to
 * the platform account again until reconnect.
 */
export async function disconnectStripeAccountAction(
  tenantSlug: string,
): Promise<ConnectActionResult> {
  try {
    const guard = await authorizeForSlug(tenantSlug);
    if (!guard.ok) return guard;

    const result = await disconnectAccount(tenantSlug);
    if (!result.ok) return result;
    revalidatePath(`/${tenantSlug}/admin/payouts`);
    return { ok: true };
  } catch (err) {
    logServerError("admin-stripe-connect.disconnectStripeAccountAction", err);
    return { ok: false, error: "Unexpected error." };
  }
}
