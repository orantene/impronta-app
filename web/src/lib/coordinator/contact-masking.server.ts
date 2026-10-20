import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import { contactMaskingEnabled, shouldMaskContacts, type TermsForMasking } from "./contact-masking";

/**
 * Should the client chat of this inquiry hide phone and email right now?
 *
 * Dark by default (env flag): when off, zero reads and no change to chat. When
 * on, privacy fails closed: a failed read of the booking state or of the terms
 * (other than "the held terms table does not exist yet", which means no hub
 * terms and therefore nothing to protect) masks.
 */
export async function contactMaskingActive(
  admin: SupabaseClient,
  input: { inquiryId: string; tenantId: string },
): Promise<boolean> {
  if (!contactMaskingEnabled()) return false;
  try {
    const [bookingRes, lineupRes] = await Promise.all([
      admin
        .from("talent_bookings")
        .select("id")
        .eq("inquiry_id", input.inquiryId)
        .eq("tenant_id", input.tenantId)
        .neq("status", "cancelled")
        .limit(1),
      admin
        .from("inquiry_participants")
        .select("talent_profile_id")
        .eq("inquiry_id", input.inquiryId)
        .eq("tenant_id", input.tenantId)
        .eq("role", "talent")
        .neq("status", "removed"),
    ]);
    if (bookingRes.error || lineupRes.error) {
      logServerError("coordinator.masking.read", bookingRes.error ?? lineupRes.error);
      return true;
    }
    const hasConfirmedBooking = ((bookingRes.data ?? []) as unknown[]).length > 0;
    const talentIds = [
      ...new Set(((lineupRes.data ?? []) as Array<{ talent_profile_id: string | null }>).map((r) => r.talent_profile_id).filter((v): v is string => !!v)),
    ];
    if (talentIds.length === 0) return shouldMaskContacts({ terms: [], hasConfirmedBooking });

    const termsRes = await admin
      .from("workspace_talent_terms")
      .select("talent_profile_id, version, show_contact, client_contact")
      .eq("tenant_id", input.tenantId)
      .eq("status", "accepted")
      .in("talent_profile_id", talentIds);
    if (termsRes.error) {
      // 42P01 / PGRST205: the held terms table is not there yet, so no hub terms exist.
      if (termsRes.error.code === "42P01" || termsRes.error.code === "PGRST205") {
        return shouldMaskContacts({ terms: [], hasConfirmedBooking });
      }
      logServerError("coordinator.masking.terms", termsRes.error);
      return shouldMaskContacts({ terms: "unreadable", hasConfirmedBooking });
    }
    // The highest accepted version per talent is the one in force.
    const latest = new Map<string, { version: number; t: TermsForMasking }>();
    for (const r of (termsRes.data ?? []) as Array<{ talent_profile_id: string; version: number; show_contact: boolean | null; client_contact: string | null }>) {
      const cur = latest.get(r.talent_profile_id);
      if (!cur || r.version > cur.version) {
        latest.set(r.talent_profile_id, {
          version: r.version,
          t: { showContact: r.show_contact === true, clientContact: r.client_contact === "talent" ? "talent" : "workspace" },
        });
      }
    }
    return shouldMaskContacts({ terms: [...latest.values()].map((v) => v.t), hasConfirmedBooking });
  } catch (err) {
    logServerError("coordinator.masking", err);
    return true;
  }
}
