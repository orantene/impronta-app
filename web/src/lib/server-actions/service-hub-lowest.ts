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

export type SetLowestResult = { ok: true } | { ok: false; reason: "invalid" | "not_allowed" | "not_ready" | "unavailable" };

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
  if (error.code === "42501") return { ok: false, reason: "not_allowed" };
  // Function or table missing (migrations held): honest, not a fake success.
  if (error.code === "PGRST202" || error.code === "42883" || error.code === "55000") return { ok: false, reason: "not_ready" };
  if (error.code === "22023" || error.code === "23514") return { ok: false, reason: "invalid" };
  logServerError("serviceHub.setLowest", error);
  return { ok: false, reason: "unavailable" };
}
