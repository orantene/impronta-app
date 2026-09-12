import "server-only";

/**
 * page-helpers.ts — the POS route's four helpers, moved out of `page.tsx`
 * byte for byte when the Messages view took the route over its 800-line cap
 * (2026-09-11). Each one is documented where it stands; the route imports
 * them by name and nothing else does.
 */

import { headers } from "next/headers";

import type { PosCollectionMethodState } from "@/components/admin/pos";
import { collectMethodUnavailableCopy } from "@/components/admin/pos/pos-copy";
import { isKnownTenantRole } from "@/lib/access";
import { reportTerminalAvailability } from "@/lib/payments/terminal-availability";
import type { PosPersonRole } from "@/lib/pos/modes";
import { logServerError } from "@/lib/server/safe-error";
import type { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * `agency_memberships.role` as the POS mode vocabulary wants it.
 *
 * Fails to `viewer` — the rank with NO modes at all. A role string nobody
 * recognises must not be handed the till: the direction that costs an unknown
 * role a screen it should have had is a support ticket, the other direction is
 * a stranger taking money.
 */
export function posRole(raw: unknown): PosPersonRole {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return isKnownTenantRole(value) ? value : "viewer";
}

/**
 * The browser-facing path of THIS request, so a redirect keeps the host shape
 * it arrived on.
 *
 * Middleware sets `x-impronta-original-pathname` before its branded rewrite,
 * so on `improntamodels.com` it reads `/admin/pos` and on the shared app host
 * `/impronta/admin/pos`. Rebuilding the path from the slug instead would hand
 * a custom-domain user `improntamodels.com/impronta/admin/pos`, which is the
 * doubled-prefix bug the admin layout documents.
 */
export async function currentAdminPath(tenantSlug: string): Promise<string> {
  const hdrs = await headers();
  const fallback = `/${tenantSlug}/admin/pos`;
  const raw = hdrs.get("x-impronta-original-pathname") ?? fallback;
  return raw.split("?")[0] || fallback;
}

/**
 * The signed-in person, as the cashier chip names them: the profile's own
 * display name, else the account's email up to the `@`, else nothing. Read
 * with the service role by the user's own id (the session says who they
 * are; the profile row is not RLS-readable through the anon client here).
 */
export async function loadCashierName(admin: NonNullable<ReturnType<typeof createServiceRoleClient>>): Promise<string> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return "";
  const auth = await supabase.auth.getUser();
  if (auth.error) logServerError("pos.page.cashier.auth", auth.error);
  const user = auth.data.user;
  if (!user) return "";
  const profile = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle<{ display_name: string | null }>();
  if (profile.error) logServerError("pos.page.cashier", profile.error);
  const name = profile.data?.display_name?.trim();
  return name || user.email?.split("@")[0] || "";
}

/**
 * Which tenders this counter can honestly offer, and the sentence for each one
 * it cannot.
 *
 * Every arm below is a REAL state read on the server, never an optimistic
 * default. The rule from the brief: a method with no provider behind it says
 * so rather than appearing to work.
 *
 *   cash — always. It is the one tender that needs nothing configured.
 *   link — the hosted Checkout path `startCollection` really drives
 *          (`method: "online_card"`). Live exactly when Stripe has a secret
 *          key; without one, `createCheckoutSessionForTransaction` returns a
 *          mock and a cashier would watch a customer "pay" nothing.
 *   card — CARD-PRESENT, a different thing from the link. `pos/actions.ts`
 *          accepts `cash | online_card` only, so no terminal request can be
 *          started from this screen whatever the environment says. It is
 *          therefore never offered as available, and the two reasons are kept
 *          apart: no reader configured at all, versus a reader that exists
 *          and that this surface cannot yet drive. Telling an operator with a
 *          working reader that they have no reader would send them to buy
 *          hardware they already own.
 *   pass — pass credits have NO table. `docs/plans/program/specs/counter.md`
 *          §3 records C20 as blocked for exactly that reason: there is no
 *          credit ledger to debit, so there is nothing to offer.
 */
export function collectionMethods(tr: (key: string) => string): PosCollectionMethodState[] {
  const unavailable = collectMethodUnavailableCopy(tr);
  const terminal = reportTerminalAvailability();
  return [
    { id: "cash", available: true },
    // A payment link is minted by `createPaymentLink` whether or not Stripe
    // has keys: without them `/pay/<code>` is a test page, and the tab's
    // panel says so (`PaymentLinkPanel`, `providerMock`).
    { id: "link", available: true },
    terminal.available
      ? {
          id: "card",
          available: false,
          unavailableReason: tr("dashboard.pos.counter.collect.cardNotWired"),
        }
      : { id: "card", available: false, unavailableReason: unavailable.card },
    { id: "pass", available: false, unavailableReason: unavailable.pass },
  ];
}
