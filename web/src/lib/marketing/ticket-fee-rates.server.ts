import "server-only";

import { decidePassThrough } from "@/lib/billing/pass-through-arming";
import { loadPlatformTakeBps } from "@/lib/billing/platform-take-rate";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { ticketFeeRate, type TicketFeeRate } from "./ticket-fee-rates";

/** The fee the pricing page's ticket table states, or null when it cannot be read (the table then hides). */
export async function loadTicketFeeRate(): Promise<TicketFeeRate | null> {
  try {
    const admin = createServiceRoleClient();
    if (!admin) return null;
    const decision = await decidePassThrough(admin);
    const legacyTakeBps = decision.mode === "off" ? await loadPlatformTakeBps(null) : null;
    return ticketFeeRate({ decision, legacyTakeBps });
  } catch {
    return null;
  }
}
