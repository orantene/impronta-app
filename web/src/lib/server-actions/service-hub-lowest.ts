"use server";

/**
 * A talent changes her "lowest price I accept" for one workspace listing
 * (TUL-1371). Her own session, her own listing: the database function
 * `set_workspace_service_listing_lowest` (held migration 420000) checks
 * ownership and recomputes the client-price floor through the listing guard.
 */

import { z } from "zod";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { requireNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { logServerError } from "@/lib/server/safe-error";
import { classifyLowestError } from "@/lib/talent/service-hub-lowest-errors";

export type SetLowestResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "not_allowed" | "not_ready" | "unavailable" }
  | { ok: false; reason: "below_floor"; floorCents: number | null };

const schema = z.object({
  listingId: z.string().uuid(),
  /** Whole cents, or null to clear the minimum. */
  lowestCents: z.number().int().min(0).max(1_000_000_000_000).nullable(),
});

export async function setListingLowestPriceAction(input: unknown): Promise<SetLowestResult> {
  await requireNotImpersonating();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, reason: "unavailable" };
  const { error } = await supabase.rpc("set_workspace_service_listing_lowest", {
    p_listing_id: parsed.data.listingId,
    p_talent_lowest_cents: parsed.data.lowestCents,
  });
  if (!error) return { ok: true };
  const failure = classifyLowestError(error);
  if (failure.reason === "unavailable") logServerError("serviceHub.setLowest", error);
  return { ok: false, ...failure };
}
