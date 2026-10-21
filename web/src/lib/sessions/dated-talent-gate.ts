/**
 * TUL-1472: the talent's own booking gate for a dated purchase made on a TALENT-SITE page.
 *
 * Same two checks the instant-book path runs (`assertInstantPosture`): the talent's
 * accepting-bookings switch (`talent_sites.accepting_bookings`) and the effective booking
 * posture (the item's own mode, else the talent's default). Only an instant posture sells a
 * place by card; paused, request-only and inquiry-only do not.
 *
 * Unlike `loadTalentSiteSwitches` (which fails OPEN so absence never pauses a talent), every
 * unreadable setting here REFUSES: this gate guards a card charge. A missing talent_sites row
 * is not an error and reads as accepting, exactly as on the instant path.
 *
 * DI core (reads only through the client it is handed) so it runs under node:test.
 */
import { logServerError } from "@/lib/server/safe-error";
import { assertInstantPosture } from "@/lib/scheduling/instant-book-gates";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Reader = { from: (table: string) => any };

export type DatedTalentGate =
  | { ok: true; talentProfileId: string }
  | { ok: false; reason: "not_accepting_bookings" | "request_only" | "inquiry_only" | "unreadable" };

export async function datedTalentGate(
  admin: Reader,
  input: { tenantId: string; offeringId: string; expectedTalentProfileId?: string | null },
): Promise<DatedTalentGate> {
  try {
    const { data: off, error: offErr } = await admin
      .from("talent_offerings")
      .select("talent_profile_id, booking_mode")
      .eq("id", input.offeringId)
      .eq("tenant_id", input.tenantId)
      .maybeSingle();
    if (offErr) {
      logServerError("dated.talentGate.offering", offErr);
      return { ok: false, reason: "unreadable" };
    }
    const talentProfileId = off && typeof off.talent_profile_id === "string" ? off.talent_profile_id : null;
    if (!talentProfileId) return { ok: false, reason: "unreadable" };
    if (input.expectedTalentProfileId && input.expectedTalentProfileId !== talentProfileId) {
      return { ok: false, reason: "unreadable" };
    }

    const [siteRes, profileRes] = await Promise.all([
      admin.from("talent_sites").select("accepting_bookings").eq("talent_profile_id", talentProfileId).maybeSingle(),
      admin.from("talent_profiles").select("selling_defaults").eq("id", talentProfileId).maybeSingle(),
    ]);
    if (siteRes.error || profileRes.error) {
      logServerError("dated.talentGate.settings", siteRes.error ?? profileRes.error);
      return { ok: false, reason: "unreadable" };
    }
    // No talent_profiles row: the talent cannot be confirmed, so nothing sells.
    if (!profileRes.data) return { ok: false, reason: "unreadable" };

    const accepting =
      siteRes.data && typeof siteRes.data.accepting_bookings === "boolean" ? siteRes.data.accepting_bookings : null;
    const gate = assertInstantPosture({
      sellingDefaults: profileRes.data.selling_defaults ?? {},
      bookingMode: typeof off.booking_mode === "string" ? off.booking_mode : null,
      staffDesk: false,
      accepting,
    });
    if (gate.ok) return { ok: true, talentProfileId };
    return { ok: false, reason: gate.reason };
  } catch (err) {
    logServerError("dated.talentGate", err);
    return { ok: false, reason: "unreadable" };
  }
}
