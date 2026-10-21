import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadPublicOpenTimes } from "@/lib/scheduling/public-open-times";

import {
  availabilityReplyText,
  runAvailabilityTool,
  type AvailabilityDeps,
  type AvailabilityInput,
  type AvailabilityResult,
} from "./availability";

/**
 * TUL-36 slice 3: runs the read-only availability tool against the real public loader.
 * `input.host` must be the SERVER-resolved public host (never a client value) and
 * `input.offeringId` a grounded service ref already resolved by the caller. Nothing is
 * written: no hold, no booking.
 */
export async function runAvailabilityForGuest(
  admin: SupabaseClient,
  input: AvailabilityInput,
  deps?: AvailabilityDeps,
): Promise<{ result: AvailabilityResult; reply: string }> {
  const real: AvailabilityDeps = deps ?? {
    loadOpenTimes: (a) =>
      loadPublicOpenTimes(admin, { host: a.host, offeringId: a.offeringId, from: a.from, days: a.days, parseDuration: (d) => d, now: a.now }),
  };
  const result = await runAvailabilityTool(input, real);
  return { result, reply: availabilityReplyText(result, input.locale) };
}
