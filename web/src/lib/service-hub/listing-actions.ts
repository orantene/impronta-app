"use server";

/**
 * TUL-1367 · Service hub listing link: server actions.
 *
 * - offerServiceListingAction: an active owner/admin of a workspace offers (or edits) a
 *   listing of a talent's service. New listings wait for the talent ('offered').
 * - respondToServiceListingAction: the talent who owns the service consents (accepted) or
 *   says no (hidden), optionally with the lowest price they accept from this workspace.
 *   The database binds consent to the talent's latest ACCEPTED workspace terms (#4158) and
 *   fails closed when there are none.
 *
 * Both call SECURITY DEFINER RPCs with the USER session; the database enforces the floor,
 * exclusivity and who may act. While the held migration is absent: "unavailable".
 */
import { assertNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { isPostgrestMissingColumnError, logServerError } from "@/lib/server/safe-error";
import { createClient } from "@/lib/supabase/server";
import type {
  ListingBookingType,
  ListingClientContact,
  ListingPriceMode,
  ListingShowWho,
} from "./listing";

export type ServiceListingError =
  | "unavailable"
  | "forbidden"
  | "invalid"
  | "below_floor"
  | "exclusive_talent"
  | "outside_terms"
  | "no_accepted_terms"
  | "failed";

export type ServiceListingActionResult =
  | { ok: true; id?: string; status?: string }
  | { ok: false; error: ServiceListingError; floorCents?: number };

const UUID = /^[0-9a-f-]{36}$/i;

function classify(err: unknown): { error: ServiceListingError; floorCents?: number } {
  const e = (err ?? {}) as { code?: string; message?: string; details?: string };
  if (e.code === "PGRST202" || e.code === "42883" || isPostgrestMissingColumnError(err)) return { error: "unavailable" };
  if (e.code === "42501") return { error: "forbidden" };
  if (e.code === "23514" && (e.message ?? "").includes("below_floor")) {
    const floor = Number(e.details);
    return Number.isFinite(floor) ? { error: "below_floor", floorCents: floor } : { error: "below_floor" };
  }
  if (e.code === "23514" && (e.message ?? "").includes("exclusive_talent")) return { error: "exclusive_talent" };
  if (e.code === "23514" && (e.message ?? "").includes("outside_terms")) return { error: "outside_terms" };
  if (e.code === "23514" && (e.message ?? "").includes("no_accepted_terms")) return { error: "no_accepted_terms" };
  if (e.code === "23514") return { error: "invalid" };
  return { error: "failed" };
}

export async function offerServiceListingAction(input: {
  tenantId: string;
  offeringId: string;
  priceMode: ListingPriceMode;
  marginBps: number | null;
  priceCents: number | null;
  listingMinCents: number;
  showWho: ListingShowWho;
  clientContact: ListingClientContact;
  bookingType: ListingBookingType;
}): Promise<ServiceListingActionResult> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return { ok: false, error: "forbidden" };
  if (!UUID.test(input.tenantId) || !UUID.test(input.offeringId)) return { ok: false, error: "invalid" };
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "unavailable" };
  const { data, error } = await supabase.rpc("upsert_workspace_service_listing", {
    p_tenant_id: input.tenantId,
    p_offering_id: input.offeringId,
    p_price_mode: input.priceMode,
    p_margin_bps: input.marginBps,
    p_price_cents: input.priceCents,
    p_listing_min_cents: input.listingMinCents,
    p_show_who: input.showWho,
    p_client_contact: input.clientContact,
    p_booking_type: input.bookingType,
  });
  if (error) {
    const c = classify(error);
    if (c.error === "failed") logServerError("serviceHub.listing.offer", error);
    return { ok: false, ...c };
  }
  return { ok: true, id: String(data ?? "") };
}

export async function respondToServiceListingAction(input: {
  listingId: string;
  accept: boolean;
  talentLowestCents: number | null;
}): Promise<ServiceListingActionResult> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return { ok: false, error: "forbidden" };
  if (!UUID.test(input.listingId)) return { ok: false, error: "invalid" };
  if (input.talentLowestCents != null && (!Number.isInteger(input.talentLowestCents) || input.talentLowestCents < 0 || input.talentLowestCents > 1e12)) {
    return { ok: false, error: "invalid" };
  }
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "unavailable" };
  const { data, error } = await supabase.rpc("respond_workspace_service_listing", {
    p_listing_id: input.listingId,
    p_accept: input.accept === true,
    p_talent_lowest_cents: input.talentLowestCents,
  });
  if (error) {
    const c = classify(error);
    if (c.error === "failed") logServerError("serviceHub.listing.respond", error);
    return { ok: false, ...c };
  }
  return { ok: true, status: String(data ?? "") };
}
